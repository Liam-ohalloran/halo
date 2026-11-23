// Card 25: records the real desktop app over other windows: hover open, close, a HUD pill and a notification banner.
// 1. Start the app with the page's debug port open and the dev demo data:
//      $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; npm run desktop:dev
//    (use a window url override with ?desktop=1&demo=full, see docs/desktop.md)
// 2. node scripts/desktop-demo.mjs        saves screenshots/card-27/recording.mp4 (needs ffmpeg on the PATH)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

mkdirSync('screenshots/card-27', { recursive: true })
const out = 'screenshots/card-27/recording.mp4'
const ff = spawn('ffmpeg', ['-y', '-f', 'gdigrab', '-framerate', '30', '-offset_x', '0', '-offset_y', '0', '-video_size', '1920x640', '-i', 'desktop', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'ignore', 'ignore'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const p = b.contexts()[0].pages()[0]
await wait(1500)
const dev = (fn, arg) => p.evaluate(fn, arg)
// Open and close with the shell's own handle (the probe script covers the real pointer).
await dev(() => window.__haloDev.sh.open()); await wait(2200)
// Tab switches, fast, then close.
for (const n of [2, 4, 6, 3, 1]) { await dev((i) => document.querySelector(`.sh-seg button:nth-child(${i})`)?.click(), n); await wait(550) }
await wait(600)
await dev(() => window.__haloDev.sh.close()); await wait(1800)
// A volume HUD pill.
await dev(() => window.__haloDev.live.hud({ key: 'vol', kind: 'slider', label: 'Speakers', icon: { name: 'vol', level: 62 }, value: 62, from: 40, colour: '#2f86ff', hold: 1700, wide: false })); await wait(2600)
// A banner, then the stack.
await dev(() => window.__haloDev.banners.play({ id: 'rec-1', type: 'new_mark', title: 'Chem test marked', body: 'SEQTA · tap to see your result', action_label: 'Open', action_url: 'https://example.com', created_at: new Date().toISOString(), read_at: null })); await wait(6200)
await dev(() => window.__haloDev.banners.play({ id: 'rec-2', type: 'call', title: 'Mum calling', body: 'Mobile · answer on your phone', action_label: null, action_url: null, created_at: new Date().toISOString(), read_at: null })); await wait(6800)
ff.stdin.write('q'); await wait(1500); ff.kill()
await b.close()
console.log('saved', out)
