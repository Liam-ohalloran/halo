// Home screenshots: each panel (Now, Study, Pay) at the two HALO.md test sizes, on fixtures with a fixed clock.
// Usage: node scripts/shots-home.mjs   (saves to screenshots/home/)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/home'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5231, strictPort: true }, logLevel: 'error' })
await server.listen()
const sizes = { 'notchpixel-680x420': [680, 420], 'iphone-390x844': [390, 844] }
const shots = [['resting', 'full', null, null], ['pill-soon', 'soon', null, null], ['now', 'soon', 'now', null], ['study', 'soon', 'study', null], ['pay', 'soon', 'pay', null], ['sixers', 'soon', 'sixers', 'live'], ['sixers-next', 'soon', 'sixers', 'next'], ['pill-live', 'full', null, 'live']]
const browser = await chromium.launch()
const errors = []
for (const [size, [width, height]] of Object.entries(sizes)) {
  for (const [name, mode, tab, sx] of shots) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${name} ${size}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name} ${size}: ${m.text()}`))
    await page.goto(`http://localhost:5231/halo/?demo=${mode}${tab ? `&open=1&tab=${tab}` : ''}${sx ? `&sixers=${sx}` : ''}`)
    await page.waitForTimeout(2600)
    await page.screenshot({ path: `${dir}/${name}-${size}.png` })
    await ctx.close()
  }
}
await browser.close()
await server.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : `saved to ${dir}`)
