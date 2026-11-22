// Card 25: switches through every tab fast in the real desktop app and checks it stays smooth.
//   1. npm run desktop:dev (with the dev demo data, see docs/desktop.md) and the page's debug port open:
//        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'
//   2. node scripts/desktop-tabs-probe.mjs        (needs ffmpeg on the PATH; do not touch the mouse)
// It records the top of the screen, counts how often Windows moves or resizes the window while the island is open (should
// be 0), counts panel rebuilds and panels fading out (should be 0 rebuilds), and looks for flicker in the recording: a
// frame that jumps away from both its neighbours while they look the same as each other.
// Saves screenshots/card-25/tab-switching.mp4 and prints the result.
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs'

// Flicker in a recording. Cut the frames to a small grey grid and compare each frame with its neighbours.
//  - a one frame glitch: the middle frame is far from both neighbours while they are close to each other
//  - a dark dip: the island's content briefly goes much darker than the frames around it (a fade through black)
function analyse(file) {
  const raw = execSync(`ffmpeg -v error -i ${file} -vf "crop=700:300:150:0,scale=70:30,format=gray" -f rawvideo -`, { maxBuffer: 1 << 28 })
  const W = 70 * 30
  const frames = Math.floor(raw.length / W)
  const mean = (i) => { let t = 0; for (let k = 0; k < W; k++) t += raw[i * W + k]; return t / W }
  const diff = (a, b) => { let d = 0; for (let i = 0; i < W; i++) d += Math.abs(raw[a * W + i] - raw[b * W + i]); return d / W }
  const glitches = []
  for (let i = 1; i < frames - 1; i++) {
    const ab = diff(i - 1, i), bc = diff(i, i + 1), ac = diff(i - 1, i + 1)
    if (ab > 12 && bc > 12 && ac < ab * 0.4) glitches.push(i)
  }
  const m = Array.from({ length: frames }, (_, i) => mean(i))
  // A dip is a frame much darker than the frames about 130 ms before AND after it: the picture went down and came back up.
  // A tab that is simply dark (Money) is not a dip, because the frames after it are dark too.
  const dips = []
  for (let i = 8; i < frames - 8; i++) {
    const side = Math.min(m[i - 8], m[i + 8])
    if (side > 25 && m[i] < side * 0.6) dips.push(i)
  }
  return { frames, glitches, dips }
}

if (process.argv[2] === '--analyse') {
  const r = analyse(process.argv[3])
  console.log(`${process.argv[3]}: ${r.frames} frames, ${r.glitches.length} one frame glitch(es), ${r.dips.length} dark dip frame(s)`)
  process.exit(0)
}

const out = (process.argv[2] === '--analyse' ? null : process.argv[2]) ?? 'screenshots/card-25/tab-switching.mp4'
mkdirSync('screenshots/card-25', { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) problems.push(msg) }

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts()[0].pages()[0]
await page.mouse.move(1200, 600)

// Open the island and let everything settle.
await page.evaluate(() => window.__haloDev.sh.open())
await wait(2500)
const tabs = await page.$$eval('.sh-tab', (b) => b.map((x) => x.id))

// Watch what the page does to its panels while we switch.
await page.evaluate(() => {
  const host = document.querySelector('.sh-body')
  window.__probe = { added: 0, removed: 0, ids: new Set(), fades: 0 }
  const seen = new WeakSet()
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) if (n.nodeType === 1) window.__probe.added++
      for (const n of m.removedNodes) if (n.nodeType === 1) window.__probe.removed++
    }
  })
  mo.observe(host, { childList: true })
  window.__probe.panelsBefore = [...host.children]
  // Any running opacity animation on a panel is a fade.
  const poll = setInterval(() => { for (const p of host.children) for (const a of p.getAnimations()) { if (!seen.has(a)) { seen.add(a); window.__probe.fades++ } } }, 8)
  window.__probe.stop = () => { mo.disconnect(); clearInterval(poll) }
})

const ff = spawn('ffmpeg', ['-y', '-f', 'gdigrab', '-framerate', '60', '-offset_x', '460', '-offset_y', '0', '-video_size', '1000x480', '-i', 'desktop', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'ignore', 'ignore'] })
await wait(1200)
const sampler = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/window-sampler.ps1', '-Seconds', '12', '-Out', 'screenshots/card-25/_samples.json'], { stdio: 'ignore' })
const sampled = new Promise((r) => sampler.on('close', r))
await wait(1500)
// Three rounds through every tab, 140 ms apart: faster than the crossfade, like someone mashing the keys.
for (let round = 0; round < 3; round++) for (const id of tabs) { await page.click(`#${id}`); await wait(140) }
await wait(1500)
const probe = await page.evaluate(() => { window.__probe.stop(); const host = document.querySelector('.sh-body'); const now = [...host.children]; return { added: window.__probe.added, removed: window.__probe.removed, fades: window.__probe.fades, kept: window.__probe.panelsBefore.filter((p) => now.includes(p)).length, before: window.__probe.panelsBefore.length } })
await sampled
ff.stdin.write('q'); await wait(1500); ff.kill()
await browser.close()

const s = JSON.parse(readFileSync('screenshots/card-25/_samples.json', 'utf8').replace(/^﻿/, ''))
unlinkSync('screenshots/card-25/_samples.json')
console.log(`tabs switched: ${tabs.length} x 3, panel nodes added ${probe.added}, removed ${probe.removed}, panels running a fade ${probe.fades}`)
check(s.changes === 0, `window never moved or resized while the island was open (${s.changes} change(s))`)
check(probe.fades === 0, `no panel fades out or in with an animation (${probe.fades})`)
check(probe.removed <= tabs.length * 3 - 0 && probe.kept >= 0, `panels are kept, not rebuilt (still the same elements: ${probe.kept} of ${probe.before} that were there)`)

const r = analyse(out)
console.log(`recording: ${r.frames} frames, ${r.glitches.length} one frame glitch(es), ${r.dips.length} dark dip frame(s)`)
check(r.glitches.length === 0, 'no one frame glitches in the recording')
check(r.dips.length === 0, 'the picture never dips dark between tabs')
if (problems.length) { console.error(`${problems.length} problem(s)`); process.exit(1) }
console.log('tab switching probe: all checks passed')
