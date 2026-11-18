// Tab switch test: open the island, switch through every tab twice (slowly, then quickly, then back and forth)
// and assert the visible panel always ends at computed opacity 1 (HALO.md 3.5, tab switch).
// Usage: node scripts/test-home-tabs.mjs [base url] [screenshot dir]
// Signed in is simulated in the test browser only, same as test-home.mjs. No real credentials.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:4173/halo/'
const shotDir = process.argv[3]
if (shotDir) mkdirSync(shotDir, { recursive: true })
const session = {
  access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
}
let failures = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++ }
const TABS = ['Now', 'Study', 'Pay', 'Sixers']

const browser = await chromium.launch()
for (const [size, [width, height]] of Object.entries({ '680x420': [680, 420], '390x844': [390, 844] })) {
  console.log(`\n== ${size}`)
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: width < 500 })
  await ctx.addInitScript((s) => {
    localStorage.setItem('sb-brqrszaljxeduelpuyty-auth-token', JSON.stringify(s))
    localStorage.removeItem('halo.homeTab')
  }, session)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/functions/v1/nba', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'none', game: null, maxey: null, next: { startsAt: new Date(Date.now() + 26 * 3600e3).toISOString(), opponent: { tri: 'CHI', name: 'Bulls', city: 'Chicago' }, home: true }, fetchedAt: new Date().toISOString() }) }))
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: r.request().headers()['accept']?.includes('object') ? 'null' : '[]' }))
  await page.routeWebSocket(/supabase\.co\/realtime/, (ws) => {
    ws.onMessage((m) => { try { const j = JSON.parse(String(m)); if (Array.isArray(j)) ws.send(JSON.stringify([j[0], j[1], j[2], 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }])) } catch { /* ignore */ } })
  })
  await page.goto(base)
  await page.waitForSelector('.h-island', { timeout: 15000 })
  await page.waitForTimeout(800)
  if (width > 500) { await page.mouse.move(width / 2, 14); await page.mouse.down(); await page.mouse.up() } else await page.touchscreen.tap(width / 2, 14)
  await page.waitForTimeout(900)
  check((await page.evaluate(() => document.querySelector('.h-island')?.dataset.state)) === 'expanded', 'island open')

  // Every panel in the host: exactly one should remain after settling, and it must be fully visible.
  const panels = () => page.evaluate(() => [...document.querySelectorAll('.h-panelhost > .h-panel')].map((p) => ({
    opacity: parseFloat(getComputedStyle(p).opacity), transform: getComputedStyle(p).transform, filter: getComputedStyle(p).filter, cls: p.className,
  })))
  const settle = async (label, expectedTab) => {
    await page.waitForTimeout(700)
    const sel = await page.getByRole('tab', { name: expectedTab }).getAttribute('aria-selected')
    const ps = await panels()
    check(sel === 'true' && ps.length === 1 && ps[0].opacity === 1 && ps[0].filter === 'none',
      `${label}: ${expectedTab} panel opacity 1 (${ps.map((p) => `${p.opacity}/${p.filter}`).join(', ')})`)
  }
  // 1. Through every tab, twice, with time to settle between.
  for (let round = 1; round <= 2; round++) for (const name of TABS) { await page.getByRole('tab', { name }).click(); await settle(`round ${round}`, name) }
  // 2. Quick: clicks 40 ms apart, back and forth, ending on each tab in turn.
  for (const end of TABS) {
    for (const name of ['Pay', 'Study', 'Sixers', 'Now', 'Pay', 'Now', 'Study', end]) { await page.getByRole('tab', { name }).click(); await page.waitForTimeout(40) }
    await settle('quick', end)
  }
  // 3. Rapid ping-pong between two tabs mid-fade.
  for (const [a, b] of [['Study', 'Pay'], ['Sixers', 'Now']]) {
    for (let i = 0; i < 6; i++) { await page.getByRole('tab', { name: i % 2 ? b : a }).click(); await page.waitForTimeout(90) }
    await settle(`ping-pong ${a}/${b}`, b)
  }
  if (shotDir) for (const name of TABS) {
    await page.getByRole('tab', { name }).click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${shotDir}/${name.toLowerCase()}-${size}.png` })
  }
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await ctx.close()
}
await browser.close()
console.log(failures ? `\n${failures} FAILED` : '\nAll passed')
process.exit(failures ? 1 : 0)
