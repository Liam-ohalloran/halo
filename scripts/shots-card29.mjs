// Card 29: the Base tab next to its prototype, at night and by day, plus its other states and its Settings.
// Opens design/prototype/base-tab.html and the real tab (?demo=base&base=proto, the prototype's own numbers) at the same Perth time
// and the same size, and saves both, a side by side picture and a difference picture. Saved to screenshots/card-29/.
// The cycling closed island is recorded by scripts/record-card29.mjs.
// Usage: node scripts/shots-card29.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-29'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5259, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const BASE = 'http://localhost:5259/halo/'
const PROTO = pathToFileURL(resolve('design/prototype/base-tab.html')).href
const fontFile = (w) => readFileSync(`node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`)
/** The bar in the prototype: Base, Home, Week, Pay, Music and the three dots. Liam's own default has 8 pinned tabs. */
const PROTO_BAR = JSON.stringify({ pinned: ['base', 'home', 'week', 'pay', 'music'] })

// The prototype loads Inter from Google. Serve the same files from node_modules instead so it works offline and never changes.
async function protoPage(ctx, iso) {
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(iso) })
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: [200, 300, 400, 500, 600].map((w) => `@font-face{font-family:Inter;font-weight:${w};src:url(https://fonts.gstatic.com/inter-${w}.woff2) format('woff2')}`).join('\n') }))
  await page.route('https://fonts.gstatic.com/**', (r) => { const w = /inter-(\d+)/.exec(r.request().url())?.[1] ?? '400'; return r.fulfill({ contentType: 'font/woff2', body: fontFile(w === '200' ? '300' : w) }) })
  await page.goto(PROTO)
  await page.evaluate(() => document.fonts.ready)
  await sleep(300)
  return page
}

async function realPage(ctx, query, { bar = PROTO_BAR } = {}) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  // The browser context is shared, so a page that wants the default bar clears whatever an earlier page saved.
  await page.addInitScript((b) => { try { b ? localStorage.setItem('halo.tabprefs', b) : localStorage.removeItem('halo.tabprefs') } catch {} }, bar)
  await page.goto(`${BASE}?${query}`)
  await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
  await page.evaluate(() => document.fonts.ready)
  await sleep(1500)
  return page
}

const png = (b) => `data:image/png;base64,${b.toString('base64')}`
// Difference of two PNGs, drawn in the browser: red where they differ by more than a few levels. Also a side by side picture.
async function compare(a, b, outDiff, outSide, skipTop = 0) {
  const page = await browser.newPage()
  const r = await page.evaluate(async ({ a, b, skipTop }) => {
    const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = s })
    const [ia, ib] = await Promise.all([load(a), load(b)])
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
    const cv = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h) }
    const da = cv(ia), db = cv(ib)
    const o = document.createElement('canvas'); o.width = w; o.height = h
    const ox = o.getContext('2d'); const od = ox.createImageData(w, h)
    let bad = 0, total = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]))
      const counted = y >= skipTop
      if (counted) total++
      const wrong = d > 24 && counted
      if (wrong) bad++
      od.data[i] = wrong ? 255 : da.data[i] * 0.25; od.data[i + 1] = wrong ? 40 : da.data[i + 1] * 0.25; od.data[i + 2] = wrong ? 40 : da.data[i + 2] * 0.25; od.data[i + 3] = 255
    }
    ox.putImageData(od, 0, 0)
    const s = document.createElement('canvas'); s.width = w * 2 + 24; s.height = h + 40
    const sx = s.getContext('2d'); sx.fillStyle = '#06070a'; sx.fillRect(0, 0, s.width, s.height)
    sx.drawImage(ia, 0, 40); sx.drawImage(ib, w + 24, 40)
    sx.fillStyle = '#fff'; sx.font = '600 22px system-ui, sans-serif'; sx.fillText('Prototype', 8, 28); sx.fillText('Halo', w + 32, 28)
    return { pct: (bad / total) * 100, diff: o.toDataURL('image/png'), side: s.toDataURL('image/png') }
  }, { a: png(a), b: png(b), skipTop })
  await page.close()
  writeFileSync(outDiff, Buffer.from(r.diff.split(',')[1], 'base64'))
  writeFileSync(outSide, Buffer.from(r.side.split(',')[1], 'base64'))
  return r.pct
}

const ctx = await browser.newContext({ viewport: { width: 700, height: 460 }, deviceScaleFactor: 2, colorScheme: 'dark', timezoneId: 'Australia/Perth' })

// ---------- 1. Side by side with the prototype, at night and by day
for (const [name, demo, iso] of [['night', 'base', '2026-11-23T19:45:00+08:00'], ['day', 'baseday', '2026-11-23T13:20:00+08:00']]) {
  const proto = await protoPage(ctx, iso)
  const real = await realPage(ctx, `demo=${demo}&base=proto&tab=base&open=1`)
  // Both are cropped to the island's inside, 1 px in from each side (the real island has a 1 px ring that the prototype draws outside).
  const pBox = await proto.locator('.isl').boundingBox()
  const rBox = await real.locator('.sh-clip').boundingBox()
  const pShot = await proto.screenshot({ clip: { x: pBox.x + 1, y: pBox.y, width: 598, height: 289 } })
  const rShot = await real.screenshot({ clip: { x: rBox.x, y: rBox.y, width: 598, height: 289 } })
  writeFileSync(`${dir}/${name}-prototype.png`, pShot)
  writeFileSync(`${dir}/${name}-base.png`, rShot)
  // The sun times and the countdown are worked out for real, so they differ from the prototype's typed-in ones. Everything else is counted.
  const pct = await compare(pShot, rShot, `${dir}/${name}-diff.png`, `${dir}/${name}-side-by-side.png`, 2 * 46)
  console.log(`${name}: ${pct.toFixed(2)}% of the pixels under the top bar differ from the prototype (real sun times, tabular digits, the seconds of the clock)`)
  assert.ok(pct < 5, `the ${name} Base tab matches the prototype (${pct.toFixed(2)}% differ)`)
  // Weights: only 400, 500 and 600 (nothing thin).
  const weights = await real.evaluate(() => [...new Set([...document.querySelectorAll('.bt, .bt *, .sh-rail *, .sh-time')].map((e) => getComputedStyle(e).fontWeight))].sort())
  assert.deepEqual(weights, ['400', '500', '600'], `only Inter 400, 500 and 600 are used on the Base tab (${weights})`)
  await proto.close()
  if (name === 'night') {
    // The clock behind the peaks: a close up.
    await real.screenshot({ path: `${dir}/night-peaks-closeup.png`, clip: { x: rBox.x + 150, y: rBox.y + 90, width: 300, height: 120 } })
  }
  await real.close()
}

// ---------- 2. The default top bar (Liam's 8 pinned tabs): the date drops under it so they never touch
{
  const page = await realPage(ctx, 'demo=base&base=proto&tab=base&open=1', { bar: null })
  assert.equal(await page.locator('.bt').getAttribute('data-low'), '', 'with a long top bar the date drops below it')
  await page.locator('.sh-clip').screenshot({ path: `${dir}/night-default-bar.png` })
  await page.close()
}

// ---------- 3. Every state: nothing from the helper or the database
{
  const page = await realPage(ctx, 'demo=base&base=empty&tab=base&open=1')
  await page.locator('.sh-clip').screenshot({ path: `${dir}/night-empty.png` })
  const text = await page.locator('.bt').innerText()
  for (const want of ['Nothing playing', 'Start Halo helper', 'Nothing rostered', 'No forecast']) assert.ok(text.includes(want), `the empty state says "${want}"`)
  assert.equal(await page.locator('.bt-cb:not(:disabled)').count(), 0, 'with nothing playing the music buttons are off')
  assert.equal(await page.locator('.sh-body').evaluate((e) => e.scrollHeight - e.clientHeight), 0, 'nothing scrolls')
  await page.close()
}

// ---------- 4. The music card works: pause shows play, and back again
{
  const page = await realPage(ctx, 'demo=base&base=proto&tab=base&open=1')
  const label = () => page.locator('.bt-cb[data-a="toggle"]').getAttribute('aria-label')
  assert.equal(await label(), 'Pause')
  await page.locator('.bt-cb[data-a="toggle"]').click()
  assert.equal(await label(), 'Play', 'pressing pause shows play')
  await page.locator('.bt-cb[data-a="toggle"]').click()
  assert.equal(await label(), 'Pause')
  await page.close()
}

// ---------- 5. Settings: the photo, the clock behind the mountains, and the cycle
{
  const page = await realPage(ctx, 'demo=base&base=proto&tab=more&open=1&account=1', { bar: null })
  await page.locator('.st-nb[data-sec="look"]').click()
  await sleep(250)
  await page.locator('.sh-clip').screenshot({ path: `${dir}/settings-look.png` })
  await page.locator('.st-nb[data-sec="cycle"]').click()
  await sleep(250)
  await page.locator('.sh-clip').screenshot({ path: `${dir}/settings-cycle.png` })
  // The cycle's switches and interval are saved.
  const ui = () => page.evaluate(() => JSON.parse(localStorage.getItem('halo.ui') ?? '{}'))
  await page.locator('.st-sw[aria-label="Pay, last 7 days"]').click()
  await page.locator('[aria-label="Every"] .st-seg-b[data-v="10"]').click()
  const saved = await ui()
  assert.equal(saved.cycle.pay, false)
  assert.equal(saved.cycleEvery, 10)
  await page.locator('.st-sw[aria-label="Pay, last 7 days"]').click()
  await page.locator('[aria-label="Every"] .st-seg-b[data-v="6"]').click()

  // "Base background": pick a photo of your own (kept on this device), the clock behind the mountains turns off, and Reset brings the default back.
  await page.locator('.st-nb[data-sec="look"]').click()
  assert.equal(await page.locator('.st-btn:has-text("Use the default")').isHidden(), true, 'nothing to reset yet')
  await page.locator('input[type=file]').setInputFiles('public/base/night.jpg')
  await page.waitForFunction(() => localStorage.getItem('halo.basePhoto'), null, { timeout: 8000 })
  const own = await page.evaluate(() => localStorage.getItem('halo.basePhoto'))
  assert.ok(own.startsWith('data:image/jpeg'), 'the photo is kept on this device as a small JPEG')
  assert.equal((await ui()).clockBehind, false, 'the ridge is cut for the shipped photo, so it turns off for your own')
  await sleep(200)
  await page.locator('.sh-clip').screenshot({ path: `${dir}/settings-look-own-photo.png` })
  await page.locator('.st-btn:has-text("Use the default")').click()
  assert.equal(await page.evaluate(() => localStorage.getItem('halo.basePhoto')), null)
  assert.equal((await ui()).clockBehind, true)
  // Switching the clock off: the peaks stop covering the digits.
  await page.locator('.st-sw[aria-label="Clock behind mountains"]').click()
  await page.locator('#sh-tab-base').click()
  await sleep(600)
  assert.equal(await page.locator('.bt').getAttribute('data-front'), 'off')
  await page.locator('.sh-clip').screenshot({ path: `${dir}/night-clock-in-front.png` })
  await page.close()
}

await browser.close(); await server.close()
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1) }
console.log('Card 29: all checks passed. Screenshots in ' + dir)
