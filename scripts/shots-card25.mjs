// Card 25: the web half of the desktop app, in a normal browser with ?desktop=1 (no Tauri). Screenshots of the island
// in both styles, the open window, and the Settings (More) tab with the desktop rows, plus the overflow audit on them.
// The Windows half (click through, focus, full screen, hover with the real pointer) is scripts/desktop-probe.ps1.
// Usage: node scripts/shots-card25.mjs   (saves to screenshots/card-25/, exits 1 on any problem)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { auditInPage } from './check-overflow.mjs'

const dir = 'screenshots/card-25'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5239, strictPort: true }, logLevel: 'error' })
await server.listen()
const base = 'http://localhost:5239/halo/'
const browser = await chromium.launch()
const problems = []
const note = (m) => problems.push(m)
const ctx = await browser.newContext({ viewport: { width: 700, height: 340 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', (e) => note(`page error: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch/i.test(m.text()) && note(`console: ${m.text()}`))

async function open(url, style) {
  await page.goto(`${base}?desktop=1&demo=soon&api=full&sixers=final-win${url}`)
  await page.waitForSelector('.sh')
  await page.evaluate((s) => { document.documentElement.dataset.deskStyle = s; document.body.style.background = 'repeating-conic-gradient(#2a2a30 0 25%, #1c1c20 0 50%) 0 0 / 24px 24px' }, style)
  await page.waitForTimeout(900)
}
const shot = (name) => page.screenshot({ path: `${dir}/${name}.png` })

// Both styles, closed. Island floats (round top), Notch hangs from the edge with ears.
for (const style of ['notch', 'island']) {
  await open('', style)
  await page.mouse.move(690, 330)
  await shot(`${style}-closed`)
  const r = await page.evaluate(() => { const e = document.querySelector('.sh'); const cs = getComputedStyle(e); return { top: cs.borderTopLeftRadius, ears: getComputedStyle(e, '::before').display } })
  if (style === 'island' && (r.top === '0px' || r.ears !== 'none')) note(`island style: top radius ${r.top}, ears ${r.ears}`)
  if (style === 'notch' && (r.top !== '0px' || r.ears === 'none')) note(`notch style: top radius ${r.top}, ears ${r.ears}`)
}

// Transparent page: nothing paints behind the island in the app.
const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
if (bg !== 'rgba(0, 0, 0, 0)') note(`html background is ${bg}, want transparent`)

// Open window, Home and the Settings tab. No scrolling, no clipped or overlapping text.
for (const [name, tab] of [['home', 'home'], ['settings', 'more']]) {
  await open(`&open=1&tab=${tab}`, 'notch')
  await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
  await page.waitForTimeout(900)
  const b = await page.evaluate(() => { const r = document.querySelector('.sh').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
  if (b.w !== 600 || b.h !== 290) note(`${name}: open window is ${b.w} x ${b.h}`)
  const bad = await page.evaluate(auditInPage)
  for (const p of bad) note(`${name}: ${p}`)
  await shot(`open-${name}`)
}

// Sign-in card at the size the app gives it (460 x 440).
await page.setViewportSize({ width: 460, height: 440 })
await page.goto(`${base}?desktop=1`)
await page.waitForSelector('.signin-card')
await page.waitForTimeout(500)
const sc = await page.evaluate(() => { const c = document.querySelector('.signin-card').getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), scrolls: document.documentElement.scrollHeight > innerHeight } })
if (sc.w !== 460 || sc.h > 440 || sc.scrolls) note(`sign-in card: ${JSON.stringify(sc)}`)
await shot('signin')

await browser.close()
await server.close()
if (problems.length) { console.error(problems.map((p) => `FAIL ${p}`).join('\n')); process.exit(1) }
console.log('card 25 web checks passed')
