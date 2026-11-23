// Card 29: Controls and Audio against the REAL helper on this laptop, first online, then with the Wi-Fi turned off.
//   node scripts/test-card29.mjs            online checks only
//   node scripts/test-card29.mjs --wifi-off also turns the Wi-Fi off (from the Wi-Fi tile), repeats everything, opens Halo
//                                           from a stored session with no network, then turns the Wi-Fi back on.
// It starts its own copy of the helper on port 47851 and Vite on 5173 (the helper allows that origin), so the installed app is untouched.
// It changes your volume, mute, microphone mute, an app's volume and the power mode for a moment and puts every one back.
// With --wifi-off a detached watchdog switches the Wi-Fi back on after 4 minutes even if this script dies.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const WIFI_OFF = process.argv.includes('--wifi-off')
const PORT = 47851
const TOKEN = 'test29token'
const BASE = 'http://localhost:5173/halo/'
const dir = 'screenshots/card-29'
mkdirSync(dir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg) }

// ---- the helper ---------------------------------------------------------------------------------------------------------
const py = 'helper/.build-venv/Scripts/python.exe'
const helper = spawn(py, ['helper/halo_helper.py'], { env: { ...process.env, HALO_TOKEN: TOKEN, HALO_PORT: String(PORT), HALO_NO_TRAY: '1' }, stdio: 'ignore', windowsHide: true })
const api = async (path, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Halo-Token': TOKEN, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return r.ok ? r.json() : null
}
for (let i = 0; i < 60; i++) { if (await api('/status').catch(() => null)) break; await sleep(500) }
check(!!(await api('/status')), 'the helper is up on its own port')

// ---- put things back ---------------------------------------------------------------------------------------------------
const orig = { vol: await api('/volume'), bri: await api('/brightness').catch(() => null), mic: await api('/mic'), power: await api('/power-mode'), wifi: await api('/wifi'), apps: await api('/apps/volume') }
console.log('starting state', JSON.stringify({ vol: orig.vol, bri: orig.bri, mic: orig.mic, power: orig.power, wifi: orig.wifi }))
async function restore() {
  if (orig.vol) { await api('/volume', { level: orig.vol.level }); await api('/mute', { muted: orig.vol.muted }) }
  if (orig.bri) await api('/brightness', { level: orig.bri.level })
  if (orig.mic) await api('/mic/mute', { muted: orig.mic.muted })
  if (orig.power) await api('/power-mode', { mode: orig.power.mode }).catch(() => null)
  for (const a of orig.apps?.apps ?? []) await api(`/apps/volume/${encodeURIComponent(a.id)}`, { level: a.level }).catch(() => null)
  if (orig.wifi?.enabled) await api('/wifi', { enabled: true }).catch(() => null)
}

let watchdog = null
if (WIFI_OFF) {
  // A separate process that survives this one: after 4 minutes it switches the Wi-Fi radio on, whatever happened here.
  watchdog = spawn(py, ['-c', 'import asyncio,time\nfrom winsdk.windows.devices.radios import Radio,RadioKind,RadioState\ntime.sleep(240)\nasync def on():\n    await Radio.request_access_async()\n    for r in await Radio.get_radios_async():\n        if r.kind==RadioKind.WI_FI: await r.set_state_async(RadioState.ON)\nasyncio.run(on())'], { detached: true, stdio: 'ignore', windowsHide: true })
  watchdog.unref()
}

const server = await createServer({ server: { port: 5173, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []

async function open(tab, { delay = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await ctx.addInitScript(([t, u]) => { try { localStorage.setItem('halo.helperToken', t); localStorage.setItem('halo.helperUrl', u) } catch { /* ignore */ } }, [TOKEN, `http://127.0.0.1:${PORT}`])
  const page = await ctx.newPage()
  const reqs = []
  page.on('request', (r) => { if (r.url().startsWith(`http://127.0.0.1:${PORT}`)) reqs.push({ m: r.method(), p: new URL(r.url()).pathname, t: Date.now(), b: r.postData() }) })
  page.on('pageerror', (e) => errors.push(`${tab}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR|Failed to fetch|open-meteo|supabase/i.test(m.text()) && errors.push(`${tab}: ${m.text()}`))
  if (delay) await page.route(`http://127.0.0.1:${PORT}/**`, async (route) => { if (route.request().method() === 'POST') await sleep(delay); await route.continue() })
  await page.goto(`${BASE}?demo=soon&tab=${tab}&open=1`)
  await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
  await sleep(1800)
  return { page, ctx, reqs }
}
const win = (page, name) => page.locator('.sh-clip').screenshot({ path: `${dir}/${name}.png` })
// How long from the click until the tile has changed on screen, measured inside the page.
const tapAndTime = (page, sel, changed) => page.evaluate(async ([s, c]) => {
  const el = document.querySelector(s)
  const t0 = performance.now()
  el.click()
  const before = performance.now()
  const flip = () => eval(c)
  if (flip()) return performance.now() - t0
  return await new Promise((res) => { const mo = new MutationObserver(() => { if (flip()) { mo.disconnect(); res(performance.now() - t0) } }); mo.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true }); setTimeout(() => res(-1), 3000) })
}, [sel, changed])

async function exercise(label) {
  console.log(`\n== ${label}`)
  // ---------------- Controls
  let t = await open('controls', { delay: 350 }) // the helper "answers" 350 ms late: what you see first is the page's own doing
  const { page, reqs } = t
  check((await page.locator('.controls-pv .ctOff').isHidden()), `${label}: Controls sees the helper`)
  const getsBefore = reqs.filter((r) => r.m === 'GET' && r.p === '/volume').length
  check(getsBefore <= 2, `${label}: read once when the tab was built, not polled (${getsBefore} reads of /volume)`)

  // tap Mute: drawn at once, answered 350 ms later
  const wasMuted = (await api('/volume')).muted
  const ms = await tapAndTime(page, '[data-t="mute"]', `document.querySelector('[data-t="mute"]').classList.contains('on') === ${!wasMuted}`)
  check(ms >= 0 && ms < 50, `${label}: the Mute tile changed on screen ${ms.toFixed(1)} ms after the tap (helper answers 350 ms later)`)
  await sleep(700)
  check((await api('/volume')).muted === !wasMuted, `${label}: and the helper did mute (${!wasMuted})`)
  check((await page.locator('[data-t="mute"]').evaluate((e) => e.classList.contains('on'))) === !wasMuted, `${label}: the answer left the tile as tapped`)
  if (!wasMuted) { await page.click('[data-t="mute"]'); await sleep(700) } // back to unmuted for the rest
  await api('/mute', { muted: true }) // silent while the sliders are tested
  await sleep(1500)
  check(await page.locator('[data-t="mute"]').evaluate((e) => e.classList.contains('on')), `${label}: muting from outside Halo is pushed to the tile with no request from the page`)
  const reads = reqs.filter((r) => r.m === 'GET' && r.p === '/volume').length
  await sleep(3500)
  const reads2 = reqs.filter((r) => r.m === 'GET' && r.p === '/volume').length
  check(reads <= 3 && reads2 === reads, `${label}: no polling: ${reads} reads of /volume after a pushed change (one of them is the catch-up read), and still ${reads2} after 3.5 s of quiet`)

  // push: volume moved outside Halo
  const v0 = (await api('/volume')).level
  const v1 = v0 >= 50 ? v0 - 9 : v0 + 9
  await api('/volume', { level: v1 })
  let seen = null
  for (let i = 0; i < 30 && seen !== String(v1); i++) { await sleep(100); seen = await page.locator('.ctS[data-s="vol"] .pc').innerText() }
  check(seen === String(v1), `${label}: volume changed outside Halo shows up on the slider (${seen})`)

  // drag the volume slider (muted, so silent): the bar follows at once, the helper hears at most one change per 50 ms
  const box = await page.locator('.ctS[data-s="vol"]').boundingBox()
  const x = box.x + box.width / 2
  reqs.length = 0
  await page.mouse.move(x, box.y + box.height * 0.8)
  await page.mouse.down()
  const t0 = Date.now()
  let shownEarly = null
  for (let i = 0; i <= 30; i++) {
    await page.mouse.move(x, box.y + box.height * (0.8 - (0.5 * i) / 30))
    await sleep(20)
    if (i === 15) shownEarly = Number(await page.locator('.ctS[data-s="vol"] .pc').innerText())
  }
  await page.mouse.up()
  const dragMs = Date.now() - t0
  await sleep(900)
  const posts = reqs.filter((r) => r.m === 'POST' && r.p === '/volume')
  check(shownEarly !== null && Math.abs(shownEarly - v1) > 5, `${label}: the slider followed the finger while the helper had not answered once (${shownEarly})`)
  check(posts.length >= 3 && posts.length <= Math.ceil(dragMs / 50) + 2, `${label}: ${posts.length} requests for a ${dragMs} ms drag (one per 50 ms at most)`)
  const lastSent = JSON.parse(posts.at(-1)?.b ?? '{}').level
  const finalShown = Number(await page.locator('.ctS[data-s="vol"] .pc').innerText())
  check(lastSent === finalShown && (await api('/volume')).level === finalShown, `${label}: the last value wins: sent ${lastSent}, shown ${finalShown}, helper ${(await api('/volume')).level}`)
  // brightness: drag it to about 70 and back
  if (orig.bri) {
    const bb = await page.locator('.ctS[data-s="bri"]').boundingBox()
    const bx = bb.x + bb.width / 2
    const yAt = (lvl) => bb.y + bb.height * (1 - lvl / 100)
    await page.mouse.move(bx, yAt(orig.bri.level))
    await page.mouse.down()
    await page.mouse.move(bx, yAt(70), { steps: 12 })
    await page.mouse.up()
    await sleep(800)
    const bNow = (await api('/brightness')).level
    check(Math.abs(bNow - 70) <= 4, `${label}: the brightness slider set the screen to ${bNow} (wanted about 70)`)
    await api('/brightness', { level: orig.bri.level })
    await sleep(1500)
    const briShown = Number(await page.locator('.ctS[data-s="bri"] .pc').innerText())
    check(Math.abs(briShown - orig.bri.level) <= 1, `${label}: and the slider followed it back when it was set from outside (shows ${briShown}, laptop ${(await api('/brightness')).level})`)
  }
  await win(page, `${label}-controls`)

  // a "no": the tile goes back and shakes
  await page.route(`http://127.0.0.1:${PORT}/mute`, (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: '{"detail":"nope"}' }) : route.continue()))
  const was = await page.locator('[data-t="mute"]').evaluate((e) => e.classList.contains('on'))
  const shook = await page.evaluate(async () => {
    const el = document.querySelector('[data-t="mute"]')
    el.click()
    const t0 = performance.now()
    let moved = false, back = false
    while (performance.now() - t0 < 1500) {
      await new Promise((r) => setTimeout(r, 10))
      if (el.getAnimations().some((a) => a.effect?.getTiming().duration === 320)) moved = true
      if (moved && !back && !el.classList.contains('on') === false) back = true
    }
    return moved
  })
  await sleep(300)
  check(shook, `${label}: a refused tap shook the tile`)
  check((await page.locator('[data-t="mute"]').evaluate((e) => e.classList.contains('on'))) === was, `${label}: and the tile went back to what it was (${was})`)
  await page.unroute(`http://127.0.0.1:${PORT}/mute`)

  // power mode: whatever Windows says, the screen ends up where the helper is
  const pm0 = (await api('/power-mode'))?.mode
  await page.click('[data-p="performance"]')
  await sleep(1500)
  const pmNow = (await api('/power-mode'))?.mode
  const pmShown = await page.locator('.ctPM button.on').getAttribute('data-p')
  check(pmShown === pmNow, `${label}: the power mode on screen (${pmShown}) is the one Windows has (${pmNow})`)
  await api('/power-mode', { mode: pm0 })
  await page.context().close()

  // ---------------- Audio
  t = await open('audio', { delay: 250 })
  const a = t.page
  check(await a.locator('.audio-pv .auOff').isHidden().catch(() => true), `${label}: Audio sees the helper`)
  // master mute button
  const m0 = (await api('/volume')).muted
  const ms2 = await tapAndTime(a, '[data-k="mute"]', `document.querySelector('[data-k="mute"]').getAttribute('aria-pressed') === '${!m0}'`)
  check(ms2 >= 0 && ms2 < 50, `${label}: the master mute button changed ${ms2.toFixed(1)} ms after the tap`)
  await sleep(600)
  check((await api('/volume')).muted === !m0, `${label}: and the helper agreed`)
  await api('/mute', { muted: true })
  // mic
  const mic0 = (await api('/mic')).muted
  const ms3 = await tapAndTime(a, '[data-k="micB"]', `document.querySelector('[data-k="micB"]').getAttribute('aria-pressed') === '${!mic0}'`)
  check(ms3 >= 0 && ms3 < 50, `${label}: the mic button changed ${ms3.toFixed(1)} ms after the tap`)
  await sleep(600)
  check((await api('/mic')).muted === !mic0, `${label}: and the helper muted the mic (${!mic0})`)
  await api('/mic/mute', { muted: mic0 })
  await sleep(1500)
  check((await a.locator('[data-k="micB"]').getAttribute('aria-pressed')) === String(mic0), `${label}: the mic restored from outside Halo is pushed back to the button (button ${await a.locator('[data-k="micB"]').getAttribute('aria-pressed')}, laptop ${(await api('/mic')).muted})`)
  // master slider drag
  const sl = await a.locator('[data-k="sl"]').boundingBox()
  t.reqs.length = 0
  const target = 0.35
  await a.mouse.move(sl.x + sl.width * 0.6, sl.y + sl.height / 2)
  await a.mouse.down()
  await a.mouse.move(sl.x + sl.width * target, sl.y + sl.height / 2, { steps: 12 })
  await a.mouse.up()
  await sleep(700)
  const want = Math.round(target * 100)
  const got = (await api('/volume')).level
  check(Math.abs(got - want) <= 3, `${label}: the master slider sent ${got} (wanted about ${want})`)
  // mixer: the first app, 100 -> about 40 and back
  const app = a.locator('.auA').first()
  if (await app.count()) {
    const id = await app.getAttribute('data-a')
    const was0 = (await api('/apps/volume')).apps.find((x) => x.id === id)?.level
    const vt = await app.locator('.vt').boundingBox()
    await a.mouse.move(vt.x + vt.width / 2, vt.y + vt.height * 0.2)
    await a.mouse.down()
    await a.mouse.move(vt.x + vt.width / 2, vt.y + vt.height * 0.6, { steps: 10 })
    await a.mouse.up()
    await sleep(700)
    const nowLevel = (await api('/apps/volume')).apps.find((x) => x.id === id)?.level
    check(nowLevel !== undefined && Math.abs(nowLevel - 40) <= 8, `${label}: the ${id} slider in the mixer moved the real app to ${nowLevel}`)
    await api(`/apps/volume/${encodeURIComponent(id)}`, { level: was0 })
  } else check(true, `${label}: no app is making sound, so the mixer has no slider to try`)
  check((await a.locator('[data-k="outs"] .auO').count()) >= 1, `${label}: the output is listed`)
  await win(a, `${label}-audio`)
  await a.context().close()
  await restore()
}

try {
  await exercise('online')

  if (WIFI_OFF) {
    // The Wi-Fi goes off from the Wi-Fi tile, the way Liam would do it.
    console.log('\n== turning the Wi-Fi off from the tile (a watchdog turns it back on in 4 minutes if this script dies)')
    const t = await open('controls')
    const tile = t.page.locator('[data-t="wifi"]')
    check(await tile.evaluate((e) => e.classList.contains('on')), 'the Wi-Fi tile starts On')
    const ms = await tapAndTime(t.page, '[data-t="wifi"]', `!document.querySelector('[data-t="wifi"]').classList.contains('on')`)
    check(ms >= 0 && ms < 50, `the tile showed Off ${ms.toFixed(1)} ms after the tap`)
    let off = false
    for (let i = 0; i < 40 && !off; i++) { await sleep(250); off = (await api('/wifi'))?.enabled === false }
    check(off, 'the helper turned the Wi-Fi radio off')
    let onLine = true
    for (let i = 0; i < 40 && onLine; i++) { await sleep(250); onLine = await t.page.evaluate(() => navigator.onLine) }
    check(onLine === false, 'the page knows it is offline')
    check(await t.page.locator('.sh-offline').isVisible(), 'the "Offline" pill is showing')
    await win(t.page, 'wifi-off-pill')
    await t.ctx.close()

    await exercise('wifi-off')

    // Halo from a stored session with no network: it must open at once.
    console.log('\n== opening Halo from a stored session with the Wi-Fi off')
    const ctx = await browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    await ctx.addInitScript(([t, u]) => {
      try {
        localStorage.setItem('halo.helperToken', t); localStorage.setItem('halo.helperUrl', u)
        // An access token that ran out hours ago, and the refresh token that works again once the network is back.
        localStorage.setItem('sb-brqrszaljxeduelpuyty-auth-token', JSON.stringify({ access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, expires_at: 1700000000, refresh_token: 'stored-refresh', user: { id: 'u1', email: 'liam@example.com', aud: 'authenticated' } }))
        localStorage.setItem('halo.cache.v1:now', JSON.stringify({ at: Date.now(), data: { shift: null, test: null, today: { shifts: [], tests: [], sessions: [] }, weekSessions: [] } }))
      } catch { /* ignore */ }
    }, [TOKEN, `http://127.0.0.1:${PORT}`])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(`boot: ${e.message}`))
    const t0 = Date.now()
    await p.goto(`${BASE}?desktop=0`)
    await p.waitForSelector('.sh', { timeout: 6000 }).catch(() => null)
    const bootMs = Date.now() - t0
    check(await p.locator('.sh').count() > 0, `Halo opened on the stored session in ${bootMs} ms with no network`)
    check(!(await p.locator('.signin, .signin-card').count()), 'and did not show the sign-in card')
    check(await p.locator('.sh-offline').count() > 0, 'with the "Offline" pill in place')
    await sleep(1500)
    await p.screenshot({ path: `${dir}/wifi-off-boot.png` })
    await ctx.close()

    console.log('\n== turning the Wi-Fi back on from the tile')
    const t2 = await open('controls')
    await t2.page.click('[data-t="wifi"]')
    let on = false
    for (let i = 0; i < 60 && !on; i++) { await sleep(250); on = (await api('/wifi'))?.enabled === true }
    check(on, 'the Wi-Fi radio is on again')
    let back = false
    for (let i = 0; i < 80 && !back; i++) { await sleep(500); back = await t2.page.evaluate(() => navigator.onLine) }
    check(back, 'and the page is online again')
    await sleep(1500)
    check(!(await t2.page.locator('.sh-offline').isVisible()), 'the "Offline" pill is gone')
    await t2.ctx.close()
  }
} finally {
  await restore().catch(() => {})
  await browser.close()
  await server.close()
  helper.kill()
}
check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`)
if (problems.length) { console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1) }
console.log('\nCard 29: all checks passed.')
