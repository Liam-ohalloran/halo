// Card 16: Home, Pay and Study on the iPhone stack (390 x 844) and embedded in NotchPixel's web tab (680 x 420).
// Saves to screenshots/card-16/. Usage: node scripts/shots-card16-devices.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
const server = await createServer({ server: { port: 5255, strictPort: true }, logLevel: 'error' }); await server.listen()
const browser = await chromium.launch()
const errs = []
for (const [name, w, h, extra, mobile] of [['iphone', 390, 844, '', true], ['embed', 680, 420, '&embed=1', false]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: mobile, isMobile: mobile })
  for (const tab of ['now', 'pay', 'study']) {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errs.push(`${name} ${tab}: ${e.message}`))
    await page.goto(`http://localhost:5255/halo/?demo=soon&open=1&tab=${tab === 'now' ? 'home' : tab}&home=full${extra}`)
    await page.waitForTimeout(2200)
    await page.screenshot({ path: `screenshots/card-16/${name}-${tab}.png`, clip: name === 'embed' ? { x: 0, y: 0, width: 680, height: 320 } : undefined })
  }
}
console.log(errs.join('\n') || 'no errors')
await browser.close(); await server.close()
