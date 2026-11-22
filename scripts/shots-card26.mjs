// Card 26, the web half, with a pretend helper (Playwright answers the helper's requests): the Shelf's Clip view and its
// copy again, banners for Windows and Phone Link notifications (a message shows no text), and the overflow audit.
// The real helper, the app and Windows are checked by scripts/desktop-helper-probe.mjs and the helper's pytest tests.
// Usage: node scripts/shots-card26.mjs   (saves to screenshots/card-26/, exits 1 on any problem)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { auditInPage } from './check-overflow.mjs'

const dir = 'screenshots/card-26'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5240, strictPort: true }, logLevel: 'error' })
await server.listen()
const base = 'http://localhost:5240/halo/'
const browser = await chromium.launch()
const problems = []
const note = (m) => problems.push(m)

// A 40 x 24 blue PNG stands in for an image on the clipboard.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAYCAYAAACWTY9zAAAAFklEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC'
const CLIPS = [
  { id: 'c6', kind: 'text', text: 'Chemistry notes: titration formula c1v1 = c2v2', chars: 47, at: 1 },
  { id: 'c5', kind: 'text', text: 'https://wacevault.com/human-bio', chars: 31, at: 1 },
  { id: 'c4', kind: 'image', w: 1280, h: 720, thumb: PNG, at: 1 },
  { id: 'c3', kind: 'text', text: 'A very long line of copied text that goes on and on and on past the end of any tile so it has to be cut off nicely with an ellipsis', chars: 130, at: 1 },
  { id: 'c2', kind: 'text', text: 'SATURDAY PA 5:30-9', chars: 18, at: 1 },
  { id: 'c1', kind: 'text', text: 'leebro@example.test', chars: 19, at: 1 },
]
const copies = []
let notes = []
let streams = 0

async function pretendHelper(page) {
  await page.addInitScript(() => localStorage.setItem('halo.helperToken', 'tok'))
  await page.route('http://127.0.0.1:47800/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-Halo-Token, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Private-Network': 'true' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/clipboard') return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, items: CLIPS }) })
    if (url.pathname.endsWith('/copy')) { copies.push(url.pathname.split('/')[2]); return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: '{"ok":true}' }) }
    if (url.pathname === '/events') {
      // The first stream is what was already there when Halo started. Notifications come on the later ones, like real life.
      streams++
      const body = ['retry: 60000\n\n', 'event: volume\ndata: {"level":40,"muted":false}\n\n', ...(streams > 1 ? notes : []).map((n) => `event: notification\ndata: ${JSON.stringify(n)}\n\n`)].join('')
      return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'text/event-stream' }, body })
    }
    return route.fulfill({ status: 503, headers: { ...cors, 'Content-Type': 'application/json' }, body: '{"detail":"not available"}' })
  })
}

const ctx = await browser.newContext({ viewport: { width: 700, height: 340 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', (e) => note(`page error: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch|ERR_|503|CORS/i.test(m.text()) && note(`console: ${m.text()}`))
await pretendHelper(page)

// ---- Shelf: the Clip view
await page.goto(`${base}?demo=soon&api=full&tab=shelf&open=1&sixers=none`)
await page.waitForSelector('.sh[data-open="true"] .shelf-pv')
await page.waitForTimeout(1500)
if (!(await page.evaluate(() => document.querySelector('.shelf-pv').classList.contains('has-clip')))) note('the Clip chip does not show with the helper up')
await page.screenshot({ path: `${dir}/shelf-with-clip-chip.png` })
for (const p of await page.evaluate(auditInPage)) note(`shelf: ${p}`)
await page.click('[data-act="mode"]')
await page.waitForTimeout(900)
const count = await page.textContent('[data-k="count"]')
if (!/6\/25 COPIED/.test(count)) note(`clip count says ${count}`)
const names = await page.$$eval('.shelf-pv .lg.file .nm', (els) => els.map((e) => e.textContent))
if (names[0] !== 'Chemistry notes: titration formula c1v1 = c2v2' || names.length !== 3) note(`clip tiles: ${JSON.stringify(names)}`)
await page.screenshot({ path: `${dir}/shelf-clipboard-history.png` })
for (const p of await page.evaluate(auditInPage)) note(`shelf clip: ${p}`)
// Copy again puts the selected item back through the helper. Remove and Phone are off here.
await page.click('[data-a="copy"]')
await page.waitForTimeout(400)
if (copies[0] !== 'c6') note(`copy again asked the helper for ${JSON.stringify(copies)}`)
const dis = await page.$$eval('.shelf-pv [data-a]', (b) => Object.fromEntries(b.map((x) => [x.dataset.a, x.disabled])))
if (!dis.phone || !dis.rm || dis.copy) note(`clip mode buttons: ${JSON.stringify(dis)}`)
await page.click('.shelf-pv .lg.file:nth-child(2)')
await page.waitForTimeout(300)
const dis2 = await page.$$eval('.shelf-pv [data-a]', (b) => Object.fromEntries(b.map((x) => [x.dataset.a, x.disabled])))
if (dis2.open) note('Open should work on a copied link')
await page.screenshot({ path: `${dir}/shelf-clipboard-link-selected.png` })
await page.click('[data-act="mode"]')
await page.waitForTimeout(500)
if (await page.evaluate(() => document.querySelector('.shelf-pv').classList.contains('is-clip'))) note('did not go back to the Shelf')

// ---- Banners for Windows and Phone Link notifications
const cases = [
  ['normal', { id: 'win-1', type: 'notification', title: 'Chemistry test marked', body: 'SEQTA result is in', app: 'Calendar', hidden: false }, 'Chemistry test marked'],
  ['message', { id: 'win-2', type: 'message', title: 'New message', body: 'WhatsApp', app: 'WhatsApp', hidden: true }, 'New message'],
  ['phone-call', { id: 'win-3', type: 'call', title: 'Mum', body: 'Incoming call', app: 'Phone Link', hidden: false }, 'Mum'],
  ['phone-message', { id: 'win-4', type: 'message', title: 'New message', body: 'Phone Link', app: 'Phone Link', hidden: true }, 'New message'],
]
for (const [name, n, title] of cases) {
  notes = [n]
  streams = 0
  await page.goto(`${base}?demo=soon&api=full&sixers=none`)
  await page.waitForSelector('.sh')
  await page.mouse.move(690, 330)
  let shown = null
  for (let i = 0; i < 60 && !shown; i++) { await page.waitForTimeout(150); shown = await page.evaluate(() => (document.querySelector('.sh')?.dataset.live === 'banner' ? document.querySelector('.il-bn .bTx b')?.textContent : null)) }
  if (shown !== title) { note(`${name}: banner title is ${shown}, want ${title}. streams=${streams} winNotes=${await page.evaluate(() => JSON.stringify(window.__haloDev?.winNotes.rows().map((r) => r.id)))} live=${await page.evaluate(() => document.querySelector('.sh')?.dataset.live)}`); continue }
  await page.waitForTimeout(900)
  const b = await page.evaluate(() => { const r = document.querySelector('.sh').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: document.querySelector('.il-bn').textContent, btn: !document.querySelector('.il-bn .bBtn').hidden } })
  if (b.w !== 520 || b.h !== 84) note(`${name}: banner is ${b.w} x ${b.h}`)
  if (b.btn) note(`${name}: a notification banner must not have a button that does anything`)
  if (n.type === 'message' && /dinner|where are you|see you/i.test(b.text)) note(`${name}: message text leaked`)
  await page.screenshot({ path: `${dir}/banner-${name}.png`, clip: { x: 60, y: 0, width: 580, height: 120 } })
}

await browser.close()
await server.close()
if (problems.length) { console.error(problems.map((p) => `FAIL ${p}`).join('\n')); process.exit(1) }
console.log('card 26 web checks passed')
