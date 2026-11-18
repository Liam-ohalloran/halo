// Card 06 screenshots of the Now panel on fixtures with a fixed clock, at the two HALO.md test sizes.
// Usage: node scripts/shots-now.mjs   (saves to screenshots/06/)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/06'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5217, strictPort: true }, logLevel: 'error' })
await server.listen()
const sizes = { 'notchpixel-680x420': [680, 420], 'iphone-390x844': [390, 844] }
// name, demo mode, open the island, extra
const shots = [
  ['resting', 'full', false], ['pill-soon', 'soon', false], ['open-soon', 'soon', true], ['open-live', 'live', true],
  ['open-busy', 'busy', true], ['open-quiet', 'quiet', true], ['open-empty', 'empty', true],
  ['open-loading', 'loading', true], ['open-error', 'error', true], ['open-offline', 'error', true, 'offline'],
]
const browser = await chromium.launch()
const errors = []
for (const [size, [width, height]] of Object.entries(sizes)) {
  for (const [name, mode, open, extra] of shots) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${name} ${size}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name} ${size}: ${m.text()}`))
    await page.goto(`http://localhost:5217/halo/?demo=${mode}${open ? '&open=1' : ''}`)
    await page.waitForTimeout(extra === 'offline' ? 900 : 2200)
    if (extra === 'offline') {
      await ctx.setOffline(true)
      await page.getByRole('button', { name: 'Retry' }).click()
      await page.waitForTimeout(1500)
    }
    await page.screenshot({ path: `${dir}/${name}-${size}.png` })
    await ctx.close()
  }
}
await browser.close()
await server.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : `saved to ${dir}`)
