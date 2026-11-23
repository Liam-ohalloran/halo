// Card 27: the top bar shows only the pinned tabs, the rest sit under "•••" as a grid, and Settings has a section for each group
// of switches. Checks everything it screenshots: default pinned tabs, the grid, pin and unpin (max 8), drag to reorder, a reload,
// the phone following the same list, and every switch taking effect live. Saved to screenshots/card-27/.
// Usage: node scripts/shots-card27.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-27'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5257, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = 'http://localhost:5257/halo/'

async function newPage(ctx, q) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  await page.goto(`${BASE}?demo=soon&${q}`)
  return page
}
const desktop = () => browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const win = (page, name) => page.locator('.sh-clip').screenshot({ path: `${dir}/${name}.png` })
const bar = (page) => page.evaluate(() => [...document.querySelectorAll('.sh-rail .sh-tab')].map((b) => b.getAttribute('aria-label')))
const gridTiles = (page) => page.evaluate(() => [...document.querySelectorAll('.sh-more .sh-mt')].map((b) => b.getAttribute('aria-label')))
const chips = (page) => page.evaluate(() => [...document.querySelectorAll('.st-chip')].map((c) => c.dataset.id))
const saved = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key)

const ctx = await desktop()
let page = await newPage(ctx, 'tab=home&open=1')
await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
await sleep(1500)

// ---------- 1. The bar: only the pinned tabs, then •••
assert.deepEqual(await bar(page), ['Home', 'Week', 'Pay', 'Study', 'Music', 'Sixers', 'Alerts', 'More tabs'], 'the default bar is the 7 pinned tabs and the More button')
await win(page, '1-bar-default')

// ---------- 2. The ••• grid: every other tab, and Settings
await page.locator('.sh-more-btn').click()
await sleep(450)
assert.deepEqual(await gridTiles(page), ['Money', 'Controls', 'Claude', 'Night', 'Marks', 'Shelf', 'Widgets', 'Settings'])
await win(page, '2-more-grid')
// Escape closes it, and so does a click anywhere else.
await page.keyboard.press('Escape')
assert.equal(await page.locator('.sh-more').isHidden(), true, 'Escape closes the grid')
await page.locator('.sh-more-btn').click()
await page.locator('.sh-body').click({ position: { x: 10, y: 10 } })
assert.equal(await page.locator('.sh-more').isHidden(), true, 'a click outside closes the grid')

// ---------- 3. Pick a tab from the grid: it opens, and the white pill sits on ••• and names it
await page.locator('.sh-more-btn').click()
await page.locator('.sh-more [data-id="money"]').click()
await sleep(500)
assert.equal(await page.locator('.sh').getAttribute('data-tab'), 'money')
assert.equal(await page.locator('.sh-more').isHidden(), true, 'the grid closes after a pick')
assert.equal((await page.locator('.sh-more-btn .lb').innerText()).trim(), 'Money')
assert.ok(await page.locator('.sh-more-btn.on').count(), 'the More button is selected while an unpinned tab is open')
await win(page, '3-from-grid-money')
// Arrow keys step on from there to the first pinned tab.
await page.keyboard.press('ArrowRight')
await sleep(300)
assert.equal(await page.locator('.sh').getAttribute('data-tab'), 'home')

// ---------- 4. Settings, every section
await page.locator('.sh-more-btn').click()
await page.locator('.sh-more [data-id="more"]').click()
await sleep(600)
assert.equal(await page.locator('.sh').getAttribute('data-tab'), 'more')
assert.equal((await page.locator('.sh-more-btn .lb').innerText()).trim(), 'Settings')
for (const sec of ['look', 'island', 'tabs', 'alerts', 'account']) {
  await page.locator(`.st-nb[data-sec="${sec}"]`).click()
  await sleep(250)
  await win(page, `4-settings-${sec}`)
}
// Nothing in Settings scrolls.
for (const sec of ['look', 'island', 'tabs', 'alerts', 'account']) {
  await page.locator(`.st-nb[data-sec="${sec}"]`).click()
  const over = await page.evaluate(() => { const m = document.querySelector('.st-main'); const s = document.querySelector('.st-sec:not([hidden])'); return { main: m.scrollHeight - m.clientHeight, sec: s.scrollHeight - s.clientHeight } })
  assert.ok(over.main <= 1 && over.sec <= 1, `${sec} fits without scrolling (${JSON.stringify(over)})`)
}

// ---------- 5. Look: every control works at once
await page.locator('.st-nb[data-sec="look"]').click()
const root = () => page.evaluate(() => { const s = document.documentElement.style; return { glow: s.getPropertyValue('--glow-strength'), blur: s.getPropertyValue('--halo-blur'), speed: s.getPropertyValue('--halo-speed') } })
assert.deepEqual(await root(), { glow: '1', blur: '1', speed: '1' })
const speed = (v) => page.locator(`[aria-label="Animation speed"] .st-seg-b[data-v="${v}"]`)
const size = (v) => page.locator(`[aria-label="Island size"] .st-seg-b[data-v="${v}"]`)
await speed('slow').click()
assert.equal((await root()).speed, '1.6')
await speed('fast').click()
assert.equal((await root()).speed, '0.6')
await speed('normal').click()
await page.locator('.st-range[aria-label="Glow"]').fill('150')
assert.equal((await root()).glow, '1.5')
await page.locator('.st-range[aria-label="Blur"]').fill('0')
assert.equal((await root()).blur, '0')
const cw = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.sh')).getPropertyValue('--cw')))
const before = await cw()
await size('large').click()
assert.equal(await cw(), Math.round(before * 1.1), 'Large makes the closed island 10 percent bigger')
await size('larger').click()
assert.equal(await cw(), Math.round(before * 1.2), 'Larger makes it 20 percent bigger')
await size('large').click()
await win(page, '5-look-changed')
assert.equal((await saved(page, 'halo.ui')).glow, 150, 'saved on this device')
await size('normal').click()

// ---------- 6. Island: a live state switched off is skipped
await page.evaluate(() => window.__haloDev.live.update({ leave: null, game: null, timer: null, shift: null, music: { title: 'Song', art: null, playing: true } }))
assert.equal(await page.evaluate(() => window.__haloDev.live.shown), 'music')
await page.locator('.st-nb[data-sec="island"]').click()
await page.locator('.st-sw[aria-label="Music"]').click()
assert.notEqual(await page.evaluate(() => window.__haloDev.live.shown), 'music', 'with Music switched off the island skips it (it falls back to the next thing: unread or resting)')
await win(page, '6-island-music-off')
await page.locator('.st-sw[aria-label="Music"]').click()
await page.evaluate(() => window.__haloDev.live.update({ leave: null, game: null, timer: null, shift: null }))
assert.equal(await page.evaluate(() => window.__haloDev.live.shown), 'music', 'and switching it on again brings it back, no restart')
await page.evaluate(() => window.__haloDev.live.update({ music: null }))
await page.locator('.st-sw[aria-label="Volume and output"]').click()
assert.equal((await saved(page, 'halo.ui')).hud.sound, false)
await page.locator('.st-sw[aria-label="Volume and output"]').click()

// ---------- 7. Alerts: sources and clipboard
await page.locator('.st-nb[data-sec="alerts"]').click()
await page.locator('.st-sw[aria-label="Phone Link"]').click()
await page.locator('.st-sw[aria-label="Keep clipboard history"]').click()
const ui = await saved(page, 'halo.ui')
assert.equal(ui.sources.phone, false)
assert.equal(ui.clipboard, false)
assert.equal(await page.locator('.st-sw[aria-label="Keep clipboard history"]').getAttribute('aria-checked'), 'false')
await win(page, '7-alerts-off')
await page.locator('.st-sw[aria-label="Phone Link"]').click()
await page.locator('.st-sw[aria-label="Keep clipboard history"]').click()

// ---------- 8. Tabs: pin, the limit of 8, unpin, keyboard and drag to reorder
await page.locator('.st-nb[data-sec="tabs"]').click()
await sleep(200)
assert.deepEqual(await chips(page), ['home', 'week', 'pay', 'study', 'music', 'sixers', 'alerts'])
assert.equal((await page.locator('.st-n').innerText()).trim(), '7 of 8')
await page.locator('.st-tile[data-id="money"]').click()
assert.deepEqual(await bar(page), ['Home', 'Week', 'Pay', 'Study', 'Music', 'Sixers', 'Alerts', 'Money', 'More tabs'], 'pinning shows in the bar at once')
assert.equal((await page.locator('.st-n').innerText()).trim(), '8 of 8')
assert.equal(await page.locator('.st-tile:not(:disabled)').count(), 0, 'with 8 pinned every other tile is switched off')
await win(page, '8-tabs-eight-pinned')
await page.locator('.st-chip[data-id="money"] .st-x').click()
assert.deepEqual(await bar(page), ['Home', 'Week', 'Pay', 'Study', 'Music', 'Sixers', 'Alerts', 'More tabs'])
assert.equal(await page.locator('.st-chip[data-id="home"] .st-x').count(), 0, 'Home has no unpin button')
// Keyboard: focus a chip and move it with the arrow keys.
await page.locator('.st-chip[data-id="alerts"]').focus()
await page.keyboard.press('ArrowLeft')
assert.deepEqual((await chips(page)).slice(-3), ['music', 'alerts', 'sixers'])
await page.keyboard.press('ArrowRight')
assert.deepEqual((await chips(page)).slice(-2), ['sixers', 'alerts'])
// Drag: take Alerts and drop it right after Home.
const from = await page.locator('.st-chip[data-id="alerts"]').boundingBox()
const to = await page.locator('.st-chip[data-id="home"]').boundingBox()
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
await page.mouse.down()
await page.mouse.move(from.x + from.width / 2 - 40, from.y + from.height / 2, { steps: 4 })
await page.mouse.move(to.x + to.width + 24, to.y + to.height / 2, { steps: 10 })
await win(page, '9-tabs-dragging')
await page.mouse.up()
await sleep(200)
assert.deepEqual((await chips(page)).slice(0, 3), ['home', 'alerts', 'week'], 'dragging Alerts next to Home reorders the bar')
assert.deepEqual((await bar(page)).slice(0, 3), ['Home', 'Alerts', 'Week'])
await win(page, '10-tabs-reordered')
assert.deepEqual((await saved(page, 'halo.tabprefs')).pinned.slice(0, 3), ['home', 'alerts', 'week'])

// ---------- 9. A reload keeps all of it (the mock settings row stands in for Supabase)
await page.reload()
await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
await sleep(900)
assert.deepEqual((await bar(page)).slice(0, 3), ['Home', 'Alerts', 'Week'], 'the order survives a reload')
await page.close()

// ---------- 10. The phone follows the same list
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true })
const pp = await newPage(phone, 'api=full')
await pp.waitForSelector('.h-tabbar')
await sleep(800)
const phoneTabs = await pp.evaluate(() => [...document.querySelectorAll('.h-tabbar .h-tab')].map((b) => b.getAttribute('aria-label')))
assert.ok(phoneTabs.length >= 1 && !phoneTabs.includes('Money') && !phoneTabs.includes('Controls'), `the phone shows only its own tabs that are pinned: ${phoneTabs}`)
await pp.screenshot({ path: `${dir}/11-phone.png` })
await phone.close()

// ---------- 11. Laptop section (the desktop app only)
const dctx = await desktop()
const dp = await newPage(dctx, 'tab=more&open=1&desktop=1')
await dp.waitForSelector('.sh[data-open="true"] .st')
await sleep(600)
await dp.locator('.st-nb[data-sec="laptop"]').click()
await sleep(250)
assert.ok(await dp.locator('.st-sec[data-sec="laptop"]:not([hidden])').count())
await win(dp, '12-settings-laptop')
await dctx.close()

await ctx.close()
await browser.close()
await server.close()
assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`)
console.log('Card 27: all checks passed. Screenshots in', dir)
