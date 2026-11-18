// Card 10 screenshots and checks: the phone stack at 390 wide (every tab, plus a real swipe), and the install guide.
// Usage: node scripts/shots-phone.mjs   (saves to screenshots/10/)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/10'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5241, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const fails = []
const sizes = { 'notchpixel-680x420': [680, 420], 'iphone-390x844': [390, 844] }

for (const [size, [width, height]] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: width < 500, isMobile: width < 500 })
  for (const tab of ['now', 'study', 'pay', 'sixers']) {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${tab} ${size}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${tab} ${size}: ${m.text()}`))
    await page.goto(`http://localhost:5241/halo/?demo=soon&open=1&tab=${tab}&sixers=live`)
    await page.waitForTimeout(2200)
    await page.screenshot({ path: `${dir}/${tab}-${size}.png` })
    if (size.startsWith('iphone')) {
      const info = await page.evaluate(() => ({
        phone: document.documentElement.classList.contains('phone'),
        selected: document.querySelector('.h-tab[aria-selected="true"]')?.getAttribute('data-id'),
        slides: document.querySelectorAll('.phone-slide').length,
        hScroll: document.documentElement.scrollWidth > innerWidth,
      }))
      if (!info.phone || info.slides !== 4 || info.hScroll || info.selected !== tab) fails.push(`${tab}: ${JSON.stringify(info)}`)
    }
    await page.close()
  }
  await ctx.close()
}

// A real swipe: scroll the stack one slide and the tab bar must follow.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5241/halo/?demo=soon&tab=now')
  await page.waitForTimeout(1500)
  await page.evaluate(() => { const s = document.querySelector('.phone-scroll'); s.scrollTo({ left: s.clientWidth * 2, behavior: 'instant' }) })
  await page.waitForTimeout(500)
  const sel = await page.evaluate(() => document.querySelector('.h-tab[aria-selected="true"]')?.getAttribute('data-id'))
  if (sel !== 'pay') fails.push(`swipe: expected pay, got ${sel}`)
  await page.screenshot({ path: `${dir}/swiped-pay-iphone-390x844.png` })
  await page.click('.h-tab[data-id="study"]')
  await page.waitForTimeout(900)
  const left = await page.evaluate(() => Math.round(document.querySelector('.phone-scroll').scrollLeft / document.querySelector('.phone-scroll').clientWidth))
  if (left !== 1) fails.push(`tap: expected slide 1, got ${left}`)
  await ctx.close()
}

// Install guide
for (const [size, [width, height]] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`install ${size}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`install ${size}: ${m.text()}`))
  await page.goto('http://localhost:5241/halo/install/')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${dir}/install-${size}.png`, fullPage: true })
  const steps = await page.locator('.ins-step').count()
  if (steps !== 3) fails.push(`install ${size}: ${steps} steps`)
  await ctx.close()
}
await browser.close()
await server.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : `all checks passed, saved to ${dir}`)
