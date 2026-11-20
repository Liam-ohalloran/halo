// Headless screenshots of every state at NotchPixel panel size and iPhone size (dev fixtures).
import { createServer } from 'vite'
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' })
await server.listen()
const base = `http://localhost:${server.httpServer.address().port}/halo/`
mkdirSync('shots', { recursive: true })

const sizes = {
  panel: { viewport: { width: 400, height: 460 }, deviceScaleFactor: 2 },
  iphone: { ...devices['iPhone 15'] },
}
const states = [
  ['now', 'full', 'now'], ['pay', 'full', 'pay'], ['study', 'full', 'study'], ['study-running', 'running', 'study'],
  ['empty-now', 'empty', 'now'], ['empty-pay', 'empty', 'pay'], ['empty-study', 'empty', 'study'],
  ['loading', 'loading', 'now'], ['error', 'error', 'now'], ['signin', 'signedout', 'now'], ['boot', 'boot', 'now'],
]
const browser = await chromium.launch()
const errors = []
for (const [size, opts] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ ...opts, colorScheme: 'dark', reducedMotion: 'no-preference' })
  for (const [name, mock, tab] of states) {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${size}/${name}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${size}/${name}: ${m.text()}`))
    await page.goto(`${base}?mock=${mock}&tab=${tab}`)
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `shots/${size}-${name}.png` })
    await page.close()
  }
  // Interaction check: switch tabs and start/stop the timer.
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${size}/interact: ${e.message}`))
  await page.goto(`${base}?mock=full&tab=now`)
  await page.click('#tab-study'); await page.waitForTimeout(600)
  await page.click('text=Start focus'); await page.waitForTimeout(1500)
  await page.click('text=Stop & log'); await page.waitForTimeout(700)
  await page.screenshot({ path: `shots/${size}-study-logged.png` })
  await page.click('#tab-pay'); await page.waitForTimeout(500)
  await page.click('[aria-label="Previous week"]'); await page.waitForTimeout(700)
  await page.screenshot({ path: `shots/${size}-pay-lastweek.png` })
  const mem = await page.evaluate(() => performance.memory?.usedJSHeapSize)
  console.log(size, 'JS heap MB', mem ? (mem / 1048576).toFixed(1) : 'n/a')
  await ctx.close()
}
await browser.close()
await server.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
