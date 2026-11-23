// Card 27 prep: the permanent border glow in the web half of the desktop app (?desktop=1, no Tauri), in every state and
// both styles, over a busy backdrop. Saves to screenshots/card-27/. Exits 1 on a page error.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/card-27'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5271, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const problems = []
const ctx = await browser.newContext({ viewport: { width: 720, height: 330 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
const wait = (ms) => page.waitForTimeout(ms)

for (const style of ['notch', 'island']) {
  await page.goto('http://localhost:5271/halo/?desktop=1&demo=soon&api=full')
  await page.waitForSelector('.sh')
  await page.evaluate((s) => { document.documentElement.dataset.deskStyle = s; document.body.style.background = 'repeating-conic-gradient(#3a3a44 0 25%, #26262c 0 50%) 0 0 / 24px 24px' }, style)
  await page.mouse.move(700, 320)
  await wait(900)
  const shot = (n) => page.screenshot({ path: `${dir}/${style}-${n}.png` })
  const live = (part) => page.evaluate((p) => window.__haloDev.live.update(p), part)
  await shot('idle')
  await live({ leave: { sub: 'Shift at 4:30', chip: 'Leave now' } }); await wait(1400); await shot('leave'); await live({ leave: null })
  await live({ shift: { label: 'SHIFT SOON', big: '1h 20m', rightLabel: 'STARTS', rightValue: '4:30 pm' } }); await wait(1400); await shot('shift'); await live({ shift: null })
  await live({ music: { title: 'Song', art: null, playing: true } }); await wait(1400); await shot('music'); await live({ music: null })
  await live({ charge: { pct: 64, toFull: '40 min' } }); await wait(1400); await shot('charge'); await wait(3300)
  await page.evaluate(() => window.__haloDev.live.hud({ key: 'vol', kind: 'slider', label: 'Speakers', icon: { name: 'vol', level: 62 }, value: 62, from: 40, colour: '#2f86ff', hold: 3000, wide: false })); await wait(900); await shot('hud'); await wait(3500)
  await page.evaluate(() => window.__haloDev.banners.play({ id: 'g-1', type: 'new_mark', title: 'Chem test marked', body: 'SEQTA · tap to see your result', action_label: 'Open', action_url: 'https://example.com', created_at: new Date().toISOString(), read_at: null })); await wait(1200); await shot('banner'); await wait(5000)
  await page.evaluate(() => window.__haloDev.sh.open()); await wait(1400); await shot('open')
  await page.evaluate(() => document.querySelector('.sh-seg button:nth-child(2)')?.click()); await wait(700); await shot('open-tab2')
}
await browser.close(); await server.close()
if (problems.length) { console.log(problems.join('\n')); process.exit(1) }
console.log('saved to', dir)
