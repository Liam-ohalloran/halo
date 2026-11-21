// Card 17: island idle and live states. Screenshots of every state and every HUD pill on /island, plus checks:
// sizes, ears and no overflow hidden on the island, priority order in the page, a held volume key sliding the bar
// (one pill, one element, the bar only ever moves up), and no scrollbars.
// Usage: node scripts/shots-card17.mjs   (saves to screenshots/card-17/, exits 1 on any problem)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/card-17'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5237, strictPort: true }, logLevel: 'error' })
await server.listen()
const url = 'http://localhost:5237/halo/island/'
const browser = await chromium.launch()
const problems = []
const note = (m) => problems.push(m)

const ctx = await browser.newContext({ viewport: { width: 760, height: 380 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', (e) => note(`page error: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch/i.test(m.text()) && note(`console: ${m.text()}`))
await page.goto(url)
await page.waitForSelector('.sh')
await page.waitForTimeout(600)

const box = () => page.evaluate(() => { const r = document.querySelector('.sh').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: r.top } })
const shown = () => page.evaluate(() => document.querySelector('.sh').dataset.live)
const CLIP = { x: 60, y: 0, width: 640, height: 170 }
const shot = (name) => page.screenshot({ path: `${dir}/${name}.png`, clip: CLIP })
const click = (sel) => page.click(sel)
const settle = (ms = 900) => page.waitForTimeout(ms)
// Park the pointer well away so hover never opens the island.
await page.mouse.move(700, 360)

// ---- 1. Every live state, on its own
const STATES = [
  ['idle', null, 200, 34], ['unread', 'unread', 200, 34], ['music', 'music', 300, 38], ['shift', 'shift', 380, 64], ['timer', 'timer', 380, 64],
  ['game', 'game', 400, 40], ['leave', 'leave', 400, 46],
]
for (const [name, btn, w, h] of STATES) {
  if (btn) await click(`[data-state=${btn}]`)
  await settle()
  const b = await box()
  if (b.w !== w || b.h !== h || b.top !== 0) note(`${name}: ${b.w} x ${b.h} at top ${b.top}, want ${w} x ${h} at 0`)
  const s = await shown()
  if (s !== name) note(`${name}: page says ${s}`)
  await shot(`state-${name}`)
  if (btn) await click(`[data-state=${btn}]`)
  await settle(500)
}
// Charging: 220 x 34 plus the floating pill, gone after 3 seconds.
await click('[data-state=charge]')
await settle(900)
{
  const b = await box()
  if (b.w !== 220 || b.h !== 34) note(`charge: ${b.w} x ${b.h}`)
  const pill = await page.evaluate(() => { const c = document.querySelector('.il-chg'); const r = c.getBoundingClientRect(); return { on: c.classList.contains('on'), top: r.top, h: r.height, fill: document.querySelector('.il-chg .hTr i').style.width } })
  if (!pill.on || pill.top < 34 || pill.fill !== '74%') note(`charge floating pill: ${JSON.stringify(pill)}`)
  await shot('state-charge')
  await settle(2900)
  const after = await box()
  if (after.w !== 200 || after.h !== 34) note(`charge did not go away after 3 s: ${after.w} x ${after.h}`)
  if (await page.evaluate(() => document.querySelector('.il-chg').classList.contains('on'))) note('charge floating pill still showing after 3 s')
  await shot('state-charge-gone')
}

// ---- 2. Ears and overflow: the island element keeps its ears and never has overflow hidden
const ears = await page.evaluate(() => {
  const sh = document.querySelector('.sh')
  const cs = getComputedStyle(sh)
  const a = getComputedStyle(sh, '::before')
  const b = getComputedStyle(sh, '::after')
  return { overflow: cs.overflow, before: a.backgroundImage, after: b.backgroundImage, flat: cs.borderTopLeftRadius === '0px' && cs.borderTopRightRadius === '0px' }
})
if (ears.overflow !== 'visible') note(`island overflow is ${ears.overflow}, the ears would be cut`)
if (!/radial-gradient/.test(ears.before) || !/radial-gradient/.test(ears.after)) note('ears are not radial masks')
if (!ears.flat) note('island top is not flat')

// ---- 3. Priority in the page: everything on, then switch off from the top
for (const k of ['unread', 'music', 'shift', 'timer', 'game', 'leave']) await click(`[data-state=${k}]`)
await click('[data-state=charge]')
await settle(900)
const seen = []
for (const k of ['leave', 'game', 'timer', 'shift', 'music']) {
  seen.push(await shown())
  await click(`[data-state=${k}]`)
  await settle(120)
}
seen.push(await shown())
if (seen.join() !== 'leave,game,timer,shift,music,charge') note(`priority in the page: ${seen.join()}`)
await settle(3000)
if ((await shown()) !== 'unread') note(`after charge ends with unread left: ${await shown()}`)
await click('[data-state=unread]')
await settle(500)

// ---- 4. Every HUD pill
const HUDS = [
  ['Vol +', 'volume'], ['Mute', 'mute'], ['Bri +', 'brightness'], ['Kbd light', 'keyboard-light'], ['Mic', 'mic'], ['Output', 'output'],
  ['Bluetooth', 'bluetooth'], ['Wi-Fi', 'wifi'], ['Airplane', 'airplane'], ['Night light', 'night-light'], ['Focus', 'focus'],
  ['Power mode', 'power-mode'], ['EQ', 'eq'], ['ANC', 'anc'], ['Caps lock', 'caps-lock'], ['Plug in', 'plug-in'], ['Unplug', 'unplug'],
]
for (const [btn, name] of HUDS) {
  await click(`[data-hud="${btn}"]`)
  await page.waitForTimeout(750)
  const b = await box()
  const s = await shown()
  if (s !== 'hud') note(`${name}: showing ${s}, not hud`)
  if (!(b.w === 310 || b.w === 360) || b.h !== 44) note(`${name}: ${b.w} x ${b.h}, want 310 or 360 x 44`)
  await shot(`hud-${name}`)
  await settle(2900) // hold is 1.1 to 2.6 s, then it settles back
  const back = await box()
  if (back.w !== 200 || back.h !== 34) note(`${name}: did not settle back, ${back.w} x ${back.h}`)
}
// A second press of mute is the unmuted pill (green mic, blue sound), shot for the colours.
await click('[data-hud="Mute"]'); await page.waitForTimeout(750); await shot('hud-mute-off'); await settle(2000)
await click('[data-hud="Mic"]'); await page.waitForTimeout(750); await shot('hud-mic-on'); await settle(2000)
await click('[data-hud="Bluetooth"]'); await page.waitForTimeout(750); await shot('hud-bluetooth-off'); await settle(2000)
// A HUD sits above a live state, but not above Leave now.
await click('[data-state=music]'); await settle(700)
await click('[data-hud="Vol +"]'); await page.waitForTimeout(750)
if ((await shown()) !== 'hud') note('HUD did not show over music')
await shot('hud-over-music')
await settle(2800)
if ((await shown()) !== 'music') note(`music did not come back after the HUD: ${await shown()}`)
await click('[data-state=leave]'); await settle(700)
await click('[data-hud="Vol +"]'); await page.waitForTimeout(750)
if ((await shown()) !== 'leave') note('HUD showed over Leave now')
await shot('hud-not-over-leave')
await click('[data-state=leave]'); await click('[data-state=music]'); await settle(2800)

// ---- 5. Holding volume up: the bar slides, the pill never flashes or is rebuilt
await page.evaluate(() => { for (const k of ['Vol −']) { for (let i = 0; i < 6; i++) document.querySelector(`[data-hud="${k}"]`).click() } })
await settle(2800)
const held = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const hold = document.querySelector('[data-hold=vol]')
  const samples = []
  const nodes = new Set()
  hold.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  const t0 = performance.now()
  while (performance.now() - t0 < 1100) {
    const pill = document.querySelector('.il-hud .hIn')
    if (pill) {
      pill.__id ??= Math.random()
      nodes.add(pill.__id)
      const fill = pill.querySelector('.hTr i')
      const v = pill.querySelector('.hV')
      const hud = document.querySelector('.il-hud')
      samples.push({ w: parseFloat(getComputedStyle(fill).width), v: Number(v.textContent), op: Number(getComputedStyle(hud).opacity), pillOp: Number(getComputedStyle(pill).opacity) })
    }
    await sleep(16)
  }
  hold.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  return { nodes: nodes.size, samples }
})
const ws = held.samples.map((s) => s.w)
const vs = held.samples.map((s) => s.v)
if (held.nodes !== 1) note(`holding volume: the pill was rebuilt ${held.nodes} times, want 1 element`)
if (ws.some((w, i) => i && w < ws[i - 1] - 0.5)) note('holding volume: the bar moved backwards')
if (vs.some((v, i) => i && v < vs[i - 1])) note('holding volume: the number went down')
if (ws[ws.length - 1] <= ws[0] + 10) note(`holding volume: the bar barely moved ${ws[0]} to ${ws[ws.length - 1]}`)
const steps = new Set(ws.map((w) => Math.round(w))).size
if (steps < 8) note(`holding volume: only ${steps} distinct bar widths, it should slide, not jump`)
// After it has faded in once, the pill must stay at full opacity while the key is held.
const full = held.samples.findIndex((s) => s.op >= 0.99 && s.pillOp >= 0.99)
const dips = full < 0 ? held.samples.length : held.samples.slice(full).filter((s) => s.op < 0.99 || s.pillOp < 0.99).length
if (dips) note(`holding volume: the pill dipped below full opacity ${dips} times (a flash)`)
console.log(`hold: ${held.nodes} element, bar ${ws[0].toFixed(0)} to ${ws[ws.length - 1].toFixed(0)} px over ${held.samples.length} samples, ${steps} distinct widths, ${vs[0]} to ${vs[vs.length - 1]}`)
await page.waitForTimeout(500)
await shot('hud-hold-volume')
await settle(2500)

// ---- 6. Nothing scrolls, and the open window still works
const scrolls = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, tab: [...document.querySelectorAll('.sh-body, .sh-inner')].some((e) => e.scrollHeight > e.clientHeight + 1) }))
if (scrolls.x) note('page scrolls sideways')
await click('.sh-pill'); await settle(900)
const open = await box()
if (open.w !== 600 || open.h !== 290) note(`open window is ${open.w} x ${open.h}`)
await page.keyboard.press('Escape'); await settle(1000)
const closed = await box()
if (closed.w === 600) note('Escape did not close')

await ctx.close()

// ---- 7. Reduced motion: sizes jump, no pulse
const rctx = await browser.newContext({ viewport: { width: 760, height: 380 }, colorScheme: 'dark', reducedMotion: 'reduce' })
const rp = await rctx.newPage()
await rp.goto(url + '?live=leave')
await rp.waitForSelector('.sh'); await rp.waitForTimeout(500)
const anim = await rp.evaluate(() => getComputedStyle(document.querySelector('.sh')).animationName)
if (anim !== 'none') note(`reduced motion: leave now still pulses (${anim})`)
await rctx.close()

// ---- 8. At the NotchPixel web tab size the widest state still fits
const nctx = await browser.newContext({ viewport: { width: 680, height: 420 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const np = await nctx.newPage()
await np.goto(url + '?live=game,leave')
await np.waitForSelector('.sh'); await np.waitForTimeout(900)
const nb = await np.evaluate(() => { const r = document.querySelector('.sh').getBoundingClientRect(); return { w: Math.round(r.width), left: r.left, right: r.right } })
if (nb.left < 0 || nb.right > 680) note(`680 wide: island sticks out ${JSON.stringify(nb)}`)
await np.screenshot({ path: `${dir}/notchpixel-680-leave.png`, clip: { x: 0, y: 0, width: 680, height: 120 } })
await nctx.close()

await browser.close()
await server.close()
if (problems.length) { console.error('PROBLEMS:\n' + problems.map((p) => ' - ' + p).join('\n')); process.exit(1) }
console.log('card 17 screenshots saved to ' + dir + ', all checks passed')
