// Card 16: screenshots of Home, Pay and Study at 600 x 290, filled and empty, plus the Pay week switch and the Study timer
// running. Saves to screenshots/card-16/. Usage: node scripts/shots-card16.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/card-16'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5252, strictPort: true }, logLevel: 'error' })
await server.listen()
const base = 'http://localhost:5252/halo/'
const browser = await chromium.launch()
const problems = []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(query) {
  const ctx = await browser.newContext({ viewport: { width: 700, height: 340 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(`${query}: ${e.message}`))
  await page.goto(`${base}?demo=soon&open=1&${query}`)
  await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
  await page.waitForTimeout(2200)
  return { ctx, page }
}
const clip = { x: 50, y: 0, width: 600, height: 292 }
const shot = (page, name) => page.screenshot({ path: `${dir}/${name}.png`, clip })

for (const [state, label] of [['full', 'filled'], ['empty', 'empty']]) {
  const sx = state === 'empty' ? 'none' : 'final-win'
  for (const tab of ['home', 'pay', 'study']) {
    const { ctx, page } = await open(`tab=${tab}&home=${state}&api=${state}&sixers=${sx}`)
    await shot(page, `${tab}-${label}`)
    if (tab === 'pay') {
      await page.click('.pay-pv .toggle button[data-w="1"]')
      await page.waitForTimeout(1400)
      await shot(page, `pay-${label}-next-week`)
    }
    if (tab === 'study' && state === 'full') {
      await page.click('.study-pv [data-k="len"] button[data-m="50"]')
      await page.click('.study-pv .sr[data-n="Methods"]')
      await page.click('.study-pv [data-k="play"]')
      await page.waitForTimeout(1500)
      await shot(page, 'study-running')
      await page.click('.study-pv [data-k="play"]')
      await page.waitForTimeout(500)
      await shot(page, 'study-paused')
    }
    await ctx.close()
  }
}
// Loading and error states
{
  const { ctx, page } = await open('tab=pay&api=loading')
  await shot(page, 'pay-loading'); await ctx.close()
}
{
  const { ctx, page } = await open('tab=study&api=loading')
  await shot(page, 'study-loading'); await ctx.close()
}
{
  const { ctx, page } = await open('tab=pay&api=error')
  await shot(page, 'pay-error'); await ctx.close()
}
{
  const { ctx, page } = await open('tab=study&api=error')
  await shot(page, 'study-error'); await ctx.close()
}
await browser.close()
await server.close()
if (problems.length) { console.log(problems.join('\n')); process.exit(1) }
console.log(`Saved to ${dir}/`)
