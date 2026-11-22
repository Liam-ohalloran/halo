// Card 26: checks the bundled helper inside the running desktop app (npm run desktop:dev, started with
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222). It changes your volume by a few points and puts it
// back, shows one Windows notification, and puts one line on the clipboard. Saves screenshots to screenshots/card-26/.
//   node scripts/desktop-helper-probe.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/card-26'
mkdirSync(dir, { recursive: true })
const problems = []
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const ps = (cmd) => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '\\"')}"`, { encoding: 'utf8' })
const shot = (name) => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/screen-top.ps1 -Path ${dir}/${name}.png`)

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts()[0].pages()[0]
await page.mouse.move(1200, 600)

// 1. The app started its own helper, with a token it keeps in Windows Credential Manager
const info = await page.evaluate(() => window.__TAURI__.core.invoke('helper_info'))
check(info && info.running && info.port >= 47800 && info.token.length >= 32, `helper is running on port ${info?.port}`)
const creds = ps('cmdkey /list')
check(/Halo/i.test(creds), 'pairing token is in Windows Credential Manager (Halo)')
const api = (path, init = {}) => page.evaluate(async ([p, i, port, token]) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { ...i, headers: { 'X-Halo-Token': token, ...(i.body ? { 'Content-Type': 'application/json' } : {}) } })
  return { status: r.status, body: await r.json().catch(() => null) }
}, [path, init, info.port, info.token])
for (let i = 0; i < 40; i++) { if ((await api('/status').catch(() => ({ status: 0 }))).status === 200) break; await wait(500) } // it takes a few seconds to start
check((await api('/status')).status === 200, 'helper answers with the token')
const noTok = await page.evaluate(async (port) => (await fetch(`http://127.0.0.1:${port}/status`)).status, info.port).catch(() => 'blocked')
check(noTok === 401 || noTok === 'blocked', `and refuses without it (${noTok})`)

// 2. A real Windows notification arrives as a banner
await page.reload(); await page.waitForSelector('.sh'); await wait(2500)
ps(`& '${process.cwd()}\\scripts\\send-test-toast.ps1' -Title 'Chemistry test marked' -Body 'SEQTA result is in'`)
let banner = null
for (let i = 0; i < 30 && !banner; i++) {
  await wait(200)
  banner = await page.evaluate(() => (document.querySelector('.sh')?.dataset.live === 'banner' ? document.querySelector('.il-bn .bTx b')?.textContent : null))
}
check(banner === 'Chemistry test marked', `Windows notification shows as a banner (${banner})`)
await wait(1200)
shot('banner-windows-notification')
await wait(5500)

// 3. Scroll on the island changes the volume and fires the pill
const v0 = (await api('/volume')).body
const cx = await page.evaluate(() => Math.round(innerWidth / 2)) // the window is only as wide as the island
await page.mouse.move(cx, 12)
for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -100); await wait(120) }
await wait(700)
let hud = null
for (let i = 0; i < 15 && hud !== 'hud'; i++) { hud = await page.evaluate(() => document.querySelector('.sh')?.dataset.live); if (hud !== 'hud') await wait(200) } // the helper looks once a second
const v1 = (await api('/volume')).body
check(v1.level === Math.min(100, v0.level + 12), `scrolling up 3 notches: volume ${v0.level} to ${v1.level}`)
check(hud === 'hud', `the volume pill is showing (${hud})`)
shot('volume-pill-from-scroll')
await wait(2200)
for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 100); await wait(120) }
await wait(900)
const v2 = (await api('/volume')).body
check(v2.level === v0.level, `scrolling back down puts it back (${v2.level})`)
await page.mouse.move(1200, 600)

// 4. Clipboard history in the Shelf tab, copy again
const marker = `halo clipboard probe ${Date.now()}`
ps(`Set-Clipboard -Value '${marker}'`)
await wait(1500)
const clips = (await api('/clipboard')).body
check(clips.items[0]?.text === marker, 'a new copy is the newest history item')
const id = clips.items[0].id
ps("Set-Clipboard -Value 'something else'")
await wait(1200)
check((await api(`/clipboard/${id}/copy`, { method: 'POST' })).status === 200, 'copy again answers ok')
await wait(600)
check(ps('Get-Clipboard').trim() === marker, 'and the clipboard holds that text again')

await browser.close()
if (problems.length) { console.error(`${problems.length} problem(s)`); process.exit(1) }
console.log('desktop helper probe: all checks passed')
