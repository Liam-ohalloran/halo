// Card 29: records the closed island cycling, then a HUD pill interrupting it and the cycle carrying on.
// Saves screenshots/card-29/closed-island-cycle.webm (and a still of every mode, with the pips, in closed-*.png).
// The cycle moves on every 4 seconds here (the setting's shortest choice) so the whole loop fits in a short clip.
// Usage: node scripts/record-card29.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync, renameSync, rmSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-29'
const tmp = `${dir}/_rec`
rmSync(tmp, { recursive: true, force: true }) // a clip left behind by an earlier run
mkdirSync(tmp, { recursive: true })
const server = await createServer({ server: { port: 5261, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const size = { width: 640, height: 150 }
const errors = []
const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: 'dark', timezoneId: 'Australia/Perth', recordVideo: { dir: tmp, size } })
await ctx.addInitScript(() => { try { localStorage.setItem('halo.ui', JSON.stringify({ cycleEvery: 4 })) } catch {} })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
await page.goto('http://localhost:5261/halo/?demo=base&base=proto&tab=base')
await page.waitForSelector('.sh[data-open="false"] .il-cycle')
const shown = () => page.evaluate(() => window.__haloDev.live.shown)
const key = () => page.evaluate(() => window.__haloDev.live.cycleKey)


await sleep(1500)
assert.equal(await shown(), 'cycle', 'nothing live, so the closed island cycles instead of resting blank')

// One loop: a still of every mode as it comes round (the keys follow the prototype's order).
const seen = []
for (let i = 0; i < 6; i++) {
  await sleep(i === 0 ? 800 : 4000)
  const k = await key()
  seen.push(k)
  await page.screenshot({ path: `${dir}/closed-${i + 1}-${k}.png`, clip: { x: 0, y: 0, width: 640, height: 70 } })
}
assert.equal(seen.length, 6)
assert.equal(new Set(seen).size, 6, 'six different modes in one loop')

// Hover pauses it. (A real hover for 300 ms also opens the window, so the pointer is faked here for 250 ms.) The cycle restarts its
// full interval when the pointer leaves, so the next mode comes 4 s after that instead of 4 s after the last change.
const first = await key()
while ((await key()) === first) await sleep(100)
const stepped = await key()
await sleep(1000)
await page.evaluate(() => document.querySelector('.sh').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })))
await sleep(250)
await page.evaluate(() => document.querySelector('.sh').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })))
await sleep(3500)
assert.equal(await key(), stepped, 'hovering pauses the cycle, so it has not moved on 4.7 s after the last change')
await sleep(1100)
assert.notEqual(await key(), stepped, 'and it carries on after the pointer leaves')
await sleep(300)

// A HUD pill interrupts it, and the cycle carries on afterwards.
await page.evaluate(() => window.__haloDev.live.hud({ key: 'vol', kind: 'slider', label: 'Speakers', icon: { name: 'vol', level: 62 }, value: 62, from: 40, colour: '#2f86ff', hold: 1700, wide: false }))
await sleep(900)
assert.equal(await shown(), 'hud', 'the HUD pill wins over the cycle')
await page.screenshot({ path: `${dir}/closed-hud-interrupt.png`, clip: { x: 0, y: 0, width: 640, height: 70 } })
await sleep(3400)
assert.equal(await shown(), 'cycle', 'and the cycle resumes')
await page.screenshot({ path: `${dir}/closed-resumed.png`, clip: { x: 0, y: 0, width: 640, height: 70 } })
await sleep(4600)

await ctx.close()
const file = readdirSync(tmp).find((f) => f.endsWith('.webm'))
renameSync(`${tmp}/${file}`, `${dir}/closed-island-cycle.webm`)
rmSync(tmp, { recursive: true, force: true })
await browser.close(); await server.close()
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1) }
console.log('saved to', dir)
