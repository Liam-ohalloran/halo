// Home smoke test: signed in, hover, click, switch every tab, check nothing freezes and nothing logs an error.
// Usage: node scripts/test-home.mjs <base url> [screenshot dir]
//   node scripts/test-home.mjs https://liam-ohalloran.github.io/halo/ screenshots/home/live
// Signed in is simulated in the test browser only: a stored session plus empty answers for the Supabase calls.
// Nothing is typed into any form and no real credentials are used.
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

const browser = await chromium.launch()
for (const [size, [width, height]] of Object.entries({ 'notchpixel-680x420': [680, 420], 'iphone-390x844': [390, 844] })) {
  console.log(`\n== ${size}`)
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: width < 500 })
  await ctx.addInitScript((s) => {
    localStorage.setItem('sb-brqrszaljxeduelpuyty-auth-token', JSON.stringify(s))
    localStorage.removeItem('halo.homeTab')
    window.__frames = 0
    ;(function f() { window.__frames++; requestAnimationFrame(f) })()
  }, session)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => { errors.push(e.message); if (process.env.STACK) console.log(e.stack) })
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  // Empty answers for the database, and a quiet realtime socket.
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: r.request().headers()['accept']?.includes('object') ? 'null' : '[]' }))
  await page.routeWebSocket(/supabase\.co\/realtime/, (ws) => {
    ws.onMessage((m) => {
      try { const j = JSON.parse(String(m)); if (Array.isArray(j)) ws.send(JSON.stringify([j[0], j[1], j[2], 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }])) } catch { /* ignore */ }
    })
  })

  await page.goto(base)
  await page.waitForSelector('.h-island', { timeout: 15000 })
  await page.waitForTimeout(800)
  const state = () => page.evaluate(() => document.querySelector('.h-island')?.dataset.state)
  const responsive = async (label) => {
    const r = await Promise.race([page.evaluate(() => new Promise((res) => setTimeout(() => res('ok'), 100))), new Promise((res) => setTimeout(() => res('FROZEN'), 4000))])
    check(r === 'ok', `${label}: page responsive`)
  }
  const fps = async () => { const a = await page.evaluate(() => window.__frames); await page.waitForTimeout(1000); return (await page.evaluate(() => window.__frames)) - a }
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor + '|' + getComputedStyle(document.documentElement).backgroundColor)
  check(bg === 'rgb(11, 11, 16)|rgb(11, 11, 16)', `background is #0b0b10 (${bg})`)
  check((await state()) === 'resting', 'starts resting')
  check((await fps()) > 20, 'animation loop running when idle')

  const hasHover = width > 500
  if (hasHover) {
    await page.mouse.move(width / 2, 12, { steps: 4 })
    await page.waitForTimeout(900)
    await responsive('hover')
    check((await state()) === 'expanded', 'hover opens the island')
    await page.mouse.move(width / 2, height - 6, { steps: 6 })
    await page.waitForTimeout(1200)
    await responsive('leave')
    check((await state()) === 'resting', 'leaving closes the island')
  }
  // Click to open (tap on the phone).
  if (hasHover) { await page.mouse.move(width / 2, 14); await page.mouse.down(); await page.mouse.up() } else await page.touchscreen.tap(width / 2, 14)
  await page.waitForTimeout(900)
  check((await state()) === 'expanded', 'click opens the island')
  const tabs = await page.getByRole('tab').all()
  check(tabs.length === 3, `tab bar has Now, Study, Pay (${tabs.length} tabs)`)
  for (const name of ['Now', 'Study', 'Pay', 'Study', 'Now', 'Pay']) {
    await page.getByRole('tab', { name }).click()
    await page.waitForTimeout(700)
    await responsive(`tab ${name}`)
    const sel = await page.getByRole('tab', { name }).getAttribute('aria-selected')
    check(sel === 'true' && (await state()) === 'expanded', `tab ${name} selected and island still open`)
  }
  for (const name of ['Now', 'Study', 'Pay']) {
    await page.getByRole('tab', { name }).click()
    await page.waitForTimeout(900)
    if (shotDir) await page.screenshot({ path: `${shotDir}/${name.toLowerCase()}-${size}.png` })
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1000)
  check((await state()) === 'resting', 'Escape closes the island')
  check((await fps()) > 20, 'animation loop still healthy after the run')
  check(errors.length === 0, `no console or page errors${errors.length ? ': ' + [...new Set(errors)].join(' | ') : ''}`)
  await ctx.close()
}
// Loading state: with scripts blocked (the page before JavaScript runs) the background must already be #0b0b10, no haze.
{
  const ctx = await browser.newContext({ viewport: { width: 680, height: 420 } })
  const page = await ctx.newPage()
  await page.route('**/*.js', (r) => r.abort())
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const bg = await page.evaluate(() => { const c = (e) => getComputedStyle(e); return c(document.body).backgroundColor + '|' + c(document.documentElement).backgroundColor + '|' + c(document.body).backgroundImage })
  check(bg === 'rgb(11, 11, 16)|rgb(11, 11, 16)|none', `loading background is #0b0b10 with no gradient (${bg})`)
  await ctx.close()
}
await browser.close()
console.log(failures ? `\n${failures} FAILED` : '\nAll passed')
process.exit(failures ? 1 : 0)
