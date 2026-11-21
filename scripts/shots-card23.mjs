// Card 23: Night tab, the prototype top bar, edit mode and Night mode, at 600 x 290 (and the phone at 390 x 844).
// Checks: arrow keys step through tabs (skipping hidden ones), the order and hidden tabs survive a reload and carry over to the
// phone, Night mode dims and mutes the unread dot. Saved to screenshots/card-23/. Usage: node scripts/shots-card23.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-23'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5256, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = 'http://localhost:5256/halo/'

async function newPage(ctx, api, q) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${api}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${api}: ${m.text()}`))
  await page.goto(`${BASE}?demo=soon&api=${api}&${q}`)
  return page
}
const desktop = (opts = {}) => browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark', ...opts })
async function open(tab, api, opts) {
  const ctx = await desktop(opts)
  const page = await newPage(ctx, api, `tab=${tab}&open=1`)
  await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
  return page
}
const win = (page, name) => page.locator('.sh-clip').screenshot({ path: `${dir}/${name}.png` })
const bar = (page) => page.evaluate(() => [...document.querySelectorAll('.sh-tab')].map((b) => b.getAttribute('aria-label')))
const activeTab = (page) => page.locator('.sh').getAttribute('data-tab')

// ---------- Night tab
let page = await open('night', 'night')
await page.waitForSelector('.night-pv:not(.is-loading)')
await sleep(1700)
await win(page, '1-night-filled')
assert.match(await page.locator('.night-pv [data-k="lt"]').innerText(), /9:00\s*pm/i, 'a 6 am shift means lights out at 9 pm')
assert.equal(await page.locator('.night-pv .nck').count(), 4)
// A tick changes only its own card.
await page.evaluate(() => { document.querySelector('.night-pv .nightSky').dataset.marker = 'same' })
await page.locator('.night-pv .nck').nth(1).click()
await sleep(400)
assert.equal(await page.locator('.night-pv .nck.done').count(), 1)
assert.equal(await page.evaluate(() => document.querySelector('.night-pv .nightSky').dataset.marker), 'same')
await win(page, '2-night-tick')
// Night mode: dims the window and sets the flag the island reads.
await page.locator('.night-pv [data-k="nm"]').click()
await sleep(500)
assert.equal(await page.evaluate(() => document.documentElement.dataset.night), '1')
await win(page, '3-night-mode-on')
await page.reload()
await page.waitForSelector('.night-pv:not(.is-loading)')
assert.equal(await page.evaluate(() => document.documentElement.dataset.night), '1', 'Night mode survives a reload')
await page.locator('.night-pv [data-k="nm"]').click()
assert.equal(await page.evaluate(() => document.documentElement.dataset.night), '0')
await page.context().close()

page = await open('night', 'nightmany'); await page.waitForSelector('.night-pv:not(.is-loading)'); await sleep(1700); await win(page, '4-night-test-tomorrow'); await page.context().close()
page = await open('night', 'nightempty'); await page.waitForSelector('.night-pv:not(.is-loading)'); await sleep(1700); await win(page, '5-night-nothing-tomorrow')
assert.match(await page.locator('.night-pv [data-k="lt"]').innerText(), /11:00\s*pm/i)
await page.context().close()
page = await open('night', 'loading'); await sleep(600); await win(page, '6-night-loading'); await page.context().close()
page = await open('night', 'error'); await page.waitForSelector('.night-pv.is-err'); await sleep(400); await win(page, '7-night-error'); await page.context().close()

// Night mode mutes the closed island's unread dot, and turning it off brings the dot back.
{
  const ctx = await desktop()
  const p = await newPage(ctx, 'alerts', 'tab=home&home=empty')
  await p.waitForSelector('.sh')
  await sleep(1500)
  assert.equal(await p.locator('.sh').getAttribute('data-unread'), '1')
  await p.evaluate(() => localStorage.setItem('halo.night', '1'))
  await p.reload(); await p.waitForSelector('.sh'); await sleep(1500)
  assert.equal(await p.locator('.sh').getAttribute('data-unread'), '0', 'Night mode mutes the unread dot')
  await p.locator('.sh').screenshot({ path: `${dir}/8-island-night-muted.png` })
  await ctx.close()
}

// ---------- The top bar
page = await open('home', 'full')
await sleep(1500)
await win(page, '9-topbar-home')
assert.deepEqual((await bar(page)).slice(0, 4), ['Home', 'Pay', 'Week', 'Study'], 'the prototype order')
assert.equal((await page.locator('.sh-time').innerText()).trim(), '3:48 pm')
assert.equal(await page.locator('.sh-tab.on .lb').innerText(), 'Home')
// Arrow keys step through the tabs.
await page.keyboard.press('ArrowRight'); await sleep(500)
assert.equal(await activeTab(page), 'pay')
await win(page, '10-topbar-pay')
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await sleep(500)
assert.equal(await activeTab(page), 'pay')
await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await sleep(500)
assert.equal(await activeTab(page), 'more', 'the last tab is after the first')

// ---------- Edit mode: hide Money, move Pay later, then check the order, the arrow keys and a reload.
await page.locator('.sh-pen').click()
await page.waitForSelector('.sh-edit:not([hidden]) .ec')
await sleep(300)
await win(page, '11-edit-mode')
assert.equal(await page.locator('.sh-edit .ec').count(), 15)
await page.locator('.sh-edit [data-id="money"] [data-a="eye"]').click()
await page.locator('.sh-edit [data-id="pay"] [data-a="r"]').click()
await page.locator('.sh-edit [data-id="marks"] [data-a="eye"]').click()
await sleep(300)
await win(page, '12-edit-mode-changed')
assert.equal(await page.locator('.sh-edit [data-id="home"] [data-a="eye"]').isDisabled(), true, 'Home cannot be hidden')
await page.locator('.sh-edit [data-e="done"]').click()
await sleep(500)
const edited = await bar(page)
assert.deepEqual(edited.slice(0, 4), ['Home', 'Week', 'Pay', 'Study'])
assert.ok(!edited.includes('Money') && !edited.includes('Marks'))
await win(page, '13-topbar-after-edit')
// Arrow keys skip the hidden tabs: from Sixers the next one is Controls, not Money.
await page.locator('.sh-tab[aria-label="Sixers"]').click(); await sleep(400)
await page.keyboard.press('ArrowRight'); await sleep(400)
assert.equal(await activeTab(page), 'controls')
// A long press on the bar opens edit mode too, and Escape leaves it without closing the island.
const rb = await page.locator('.sh-rail').boundingBox()
await page.mouse.move(rb.x + rb.width - 6, rb.y + rb.height / 2); await page.mouse.down(); await sleep(700); await page.mouse.up()
await page.waitForSelector('.sh-edit:not([hidden])')
await page.keyboard.press('Escape')
await sleep(300)
assert.equal(await page.locator('.sh-edit').isHidden(), true)
assert.equal(await page.locator('.sh').getAttribute('data-open'), 'true')
const state = await page.context().storageState()
// Reload on the same device.
await page.reload()
await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
await sleep(800)
assert.deepEqual((await bar(page)).slice(0, 4), ['Home', 'Week', 'Pay', 'Study'], 'the order survives a reload')
assert.ok(!(await bar(page)).includes('Money'))
await page.context().close()

// The other device reads the same saved prefs: the phone shows the same order and hides the same tabs.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true, storageState: state })
  const p = await newPage(ctx, 'full', 'tab=home&home=full')
  await p.waitForSelector('.h-tab')
  await sleep(1500)
  const ids = await p.evaluate(() => [...document.querySelectorAll('.h-tab[data-id]')].map((b) => b.dataset.id))
  assert.deepEqual(ids, ['now', 'pay', 'study', 'sixers'], 'the phone follows the saved order (Week is not on the phone)')
  await p.screenshot({ path: `${dir}/14-phone-order.png` })
  await ctx.close()
}

// Reset puts everything back.
page = await open('home', 'full')
await page.locator('.sh-pen').click()
await page.waitForSelector('.sh-edit:not([hidden]) .ec')
await page.locator('.sh-edit [data-id="money"] [data-a="eye"]').click()
await page.locator('.sh-edit [data-e="reset"]').click()
await sleep(300)
await page.locator('.sh-edit [data-e="done"]').click()
await sleep(400)
assert.deepEqual((await bar(page)).slice(0, 4), ['Home', 'Pay', 'Week', 'Study'])
assert.ok((await bar(page)).includes('Money'))
await page.context().close()

await browser.close()
await server.close()
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log('Saved to', dir)
