// Card 18: notification banners. Plays every alert type on /island and checks size, one at a time, hover hold, the
// stack and its fan, actions, and that no banner text is cut off. Also records a short video of the whole run.
// Usage: node scripts/shots-card18.mjs   (saves to screenshots/card-18/, exits 1 on any problem)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'

const dir = 'screenshots/card-18'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5238, strictPort: true }, logLevel: 'error' })
await server.listen()
const url = 'http://localhost:5238/halo/island/'
const browser = await chromium.launch()
const problems = []
const note = (m) => problems.push(m)

const ctx = await browser.newContext({ viewport: { width: 760, height: 420 }, deviceScaleFactor: 2, colorScheme: 'dark', recordVideo: { dir: `${dir}/_vid`, size: { width: 760, height: 420 } } })
const page = await ctx.newPage()
page.on('pageerror', (e) => note(`page error: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch/i.test(m.text()) && note(`console: ${m.text()}`))
await page.goto(url)
await page.waitForSelector('.sh')
await page.waitForTimeout(600)
await page.mouse.move(740, 400)

const box = () => page.evaluate(() => { const r = document.querySelector('.sh').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: r.top } })
const shown = () => page.evaluate(() => document.querySelector('.sh').dataset.live)
const CLIP = { x: 60, y: 0, width: 640, height: 300 }
const shot = (name) => page.screenshot({ path: `${dir}/${name}.png`, clip: CLIP })
const wait = (ms) => page.waitForTimeout(ms)
const TYPES = ['shift_cover', 'leave_reminder', 'new_mark', 'call', 'sixers_final', 'battery_low', 'task_done', 'focus_done']

// ---- 1. Every type: opens to 520 x 84 in its colour, text fits, then settles back
for (const t of TYPES) {
  await page.click(`[data-notify=${t}]`)
  await wait(1100)
  const b = await box()
  if (b.w !== 520 || b.h !== 84 || b.top !== 0) note(`${t}: banner is ${b.w} x ${b.h} at ${b.top}`)
  if ((await shown()) !== 'banner') note(`${t}: shown is ${await shown()}`)
  const fit = await page.evaluate(() => [...document.querySelectorAll('.il-bn .bTx b, .il-bn .bTx span')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent))
  if (fit.length) note(`${t}: text cut off: ${fit.join(' | ')}`)
  const btn = await page.evaluate(() => { const b = document.querySelector('.il-bn .bBtn'); return b && !b.hidden ? b.textContent : null })
  if (t === 'task_done' ? btn !== null : btn === null) note(`${t}: button is ${btn}`)
  await shot(`banner-${t}`)
  await wait(4000 + 380 + 700)
  if ((await shown()) === 'banner') note(`${t}: banner did not settle back`)
  const b2 = await box()
  if (b2.w !== 200 || b2.h !== 34) note(`${t}: closed island is ${b2.w} x ${b2.h}`)
}

// ---- 2. The stack: 6 pills after 8 alerts, newest first, fan on hover, card under the pointer
const stackInfo = () => page.evaluate(() => ({ n: document.querySelectorAll('.nst .np:not(.out)').length, first: document.querySelector('.nst .np:not(.out) b')?.textContent, on: document.querySelector('.nst').classList.contains('on') }))
let st = await stackInfo()
if (!st.on || st.n !== 6 || st.first !== 'Focus done · 50 min') note(`stack: ${JSON.stringify(st)}`)
await shot('stack-collapsed')
await page.hover('.nst .np:not(.out)')
await wait(700)
await shot('stack-fanned')
if (!(await page.evaluate(() => document.querySelector('.nst').classList.contains('fan')))) note('stack did not fan on hover')
const card = await page.evaluate(() => { const c = document.querySelector('.nst .np.card'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
if (!card || card.w !== 520 || card.h !== 84) note(`hovered pill card: ${JSON.stringify(card)}`)
const clipped = await page.evaluate(() => [...document.querySelectorAll('.nst.fan .np:not(.out) .npT b, .nst.fan .np.card .npT span')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent))
if (clipped.length) note(`stack text cut off: ${clipped.join(' | ')}`)
const rows = await page.evaluate(() => [...document.querySelectorAll('.nst.fan .np:not(.out)')].map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.bottom] }))
for (let i = 1; i < rows.length; i++) if (rows[i][0] < rows[i - 1][1] - 1) note(`fanned pills ${i - 1} and ${i} overlap`)
await page.mouse.move(740, 400)
await wait(600)
if (await page.evaluate(() => document.querySelector('.nst').classList.contains('fan'))) note('stack stayed fanned after the pointer left')
// Dismiss one with the x
await page.hover('.nst .np:not(.out)')
await wait(500)
await page.evaluate(() => document.querySelector('.nst .np:not(.out) .npX').click())
await wait(500)
st = await stackInfo()
if (st.n !== 5) note(`after dismissing one: ${st.n} pills`)
await page.mouse.move(740, 400)

// ---- 3. One at a time: Play all shows banners in turn, never two, most important first
await page.click('[data-notify=all]')
const seq = []
const t0 = Date.now()
while (Date.now() - t0 < 8 * 6000) {
  const s = await page.evaluate(() => ({ live: document.querySelector('.sh').dataset.live, title: document.querySelector('.il-bn .bTx b')?.textContent, n: document.querySelectorAll('.il-view.il-banner.on').length }))
  if (s.n > 1) note('two banners at once')
  if (s.live === 'banner' && s.title && seq[seq.length - 1] !== s.title) seq.push(s.title)
  if (seq.length === 8 && s.live !== 'banner') break
  await wait(200)
}
if (seq.length !== 8) note(`play all showed ${seq.length} banners: ${seq.join(' | ')}`)
else if (seq[0] !== 'Cover needed · Sat 5–10' || seq[1] !== 'Leave in 10 min') note(`play all order: ${seq.join(' | ')}`)

// ---- 4. Hover holds the banner open
await wait(1500)
await page.mouse.move(740, 400)
await page.click('[data-notify=call]')
await wait(1000)
await page.mouse.move(380, 40)
await wait(6000)
if ((await shown()) !== 'banner') note('banner closed while hovered')
await shot('banner-hover-hold')
await page.mouse.move(740, 400)
await wait(4000 + 380 + 400)
if ((await shown()) === 'banner') note('banner stayed after the pointer left')

// ---- 5. Actions: a link opens (recorded on the page)
await page.click('[data-notify=sixers_final]')
await wait(1100)
await page.click('.il-bn .bBtn')
await wait(300)
const read = await page.textContent('.il-read')
if (!/Opened link: https:\/\/example\.com\/box/.test(read)) note(`link action: ${read}`)
await wait(5200)

// ---- 6. Nothing scrolls
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) note('page scrolls sideways')

await ctx.close()
for (const f of readdirSync(`${dir}/_vid`)) renameSync(`${dir}/_vid/${f}`, `${dir}/recording.webm`)
await browser.close()
await server.close()
if (problems.length) { console.error(problems.map((p) => `FAIL ${p}`).join('\n')); process.exit(1) }
console.log('card 18: all checks passed')
