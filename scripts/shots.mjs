// Headless screenshots at the two HALO.md test sizes, saved to screenshots/<card>/.
// Usage: npm run shots -- 01   (card number defaults to 01)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const card = process.argv[2] ?? '01'
const dir = `screenshots/${card}`
mkdirSync(dir, { recursive: true })

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' })
await server.listen()
const sizes = { 'notchpixel-680x420': [680, 420], 'iphone-390x844': [390, 844] }
const browser = await chromium.launch()
const errors = []
for (const [name, [width, height]] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  await page.goto('http://localhost:5198/halo/')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${dir}/${name}.png` })
  await ctx.close()
}
await browser.close()
await server.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : `saved to ${dir}`)
