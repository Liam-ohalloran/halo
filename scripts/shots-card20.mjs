// Card 20: Alerts tab screenshots at 600 x 290: with alerts, many alerts, long text, filtered, after a tap, after CLEAR ALL,
// empty, loading, error, and the island's gold dot. Also checks that a press never rebuilds the tab and that a row
// inserted while the tab is open shows within 2 seconds. Saved to screenshots/card-20/. Usage: node scripts/shots-card20.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-20'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5253, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(api, { tab = 'alerts', opened = true, w = 760, h = 400, demo = 'soon' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${api}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${api}: ${m.text()}`))
  await page.goto(`http://localhost:5253/halo/?demo=${demo}&tab=${tab}${opened ? '&open=1' : ''}&api=${api}`)
  if (opened) await page.waitForSelector('.sh[data-open="true"] .alerts-pv')
  return page
}
const win = (page, name) => page.locator('.sh-clip').screenshot({ path: `${dir}/${name}.png` })

let page = await open('alerts')
await page.waitForSelector('.alerts-pv .ip')
await sleep(1500)
await win(page, '1-with-alerts')
assert.equal(await page.locator('.alerts-pv .ip:not(.more)').count(), 5, 'six alerts: one is the banner, five are pills')
assert.equal(await page.locator('.alerts-pv [data-k="n"]').innerText(), '6')
assert.match(await page.locator('.alerts-pv [data-k="cap"]').innerText(), /SHIFT COVER · 1H|SHIFT COVER · 4M/i)

// A filter only changes classes: no pill is rebuilt.
await page.evaluate(() => { document.querySelector('.alerts-pv .ip').dataset.marker = 'same' })
await page.locator('.alerts-pv [data-f="school"]').click()
await sleep(400)
assert.equal(await page.evaluate(() => document.querySelector('.alerts-pv .ip').dataset.marker), 'same', 'a filter must not rebuild the pills')
assert.ok((await page.locator('.alerts-pv .ip.dim').count()) > 0)
await win(page, '2-filter-school')
await page.locator('.alerts-pv [data-f="all"]').click()

// Tap a pill: it shrinks away, the others stay the same elements, the count drops.
await page.locator('.alerts-pv .ip[data-id="a3"]').click()
await sleep(700)
assert.equal(await page.locator('.alerts-pv .ip[data-id="a3"]').count(), 0)
assert.equal(await page.evaluate(() => document.querySelector('.alerts-pv .ip').dataset.marker), 'same', 'a tap must not rebuild the other pills')
assert.equal(await page.locator('.alerts-pv [data-k="n"]').innerText(), '5')
await win(page, '3-after-tap')

// An alert inserted while the tab is open (the scheduled task) shows within 2 seconds, without rebuilding the rest.
const t0 = Date.now()
await page.evaluate(() => globalThis.__mockAlerts.insert({ id: 'live1', type: 'call', title: 'Missed call', body: 'Mum' }))
await page.waitForSelector('.alerts-pv .ip[data-id="live1"], .alerts-pv [data-k="title"]:text("Missed call")', { timeout: 2000 })
assert.ok(Date.now() - t0 < 2000, 'a new row shows within 2 seconds')
assert.equal(await page.evaluate(() => document.querySelector('.alerts-pv .ip').dataset.marker), 'same')
await sleep(700)
await win(page, '4-new-alert-arrived')

// The banner action opens a link only. Tapping the banner dismisses it and the next most important one takes over.
await page.locator('.alerts-pv [data-k="hero"]').click()
await sleep(700)
await win(page, '5-banner-dismissed')

// CLEAR ALL.
await page.locator('.alerts-pv [data-k="clear"]').click()
await sleep(1200)
assert.equal(await page.locator('.alerts-pv .ip:not(.more)').count(), 0)
assert.equal(await page.locator('.alerts-pv [data-k="n"]').innerText(), '0')
await win(page, '6-after-clear-all')
await page.context().close()

page = await open('alertsmany')
await page.waitForSelector('.alerts-pv .ip')
await sleep(1500)
await win(page, '7-many-alerts')
assert.equal(await page.locator('.alerts-pv .ip.more:not([hidden])').count(), 1, 'more than six shows +N more')
await page.context().close()

page = await open('alertslong')
await page.waitForSelector('.alerts-pv .ip')
await sleep(1500)
await win(page, '8-long-text')
await page.context().close()

page = await open('alertsempty')
await page.waitForSelector('.alerts-pv:not(.is-loading)')
await sleep(1200)
await win(page, '9-no-alerts')
assert.equal(await page.locator('.alerts-pv.is-empty').count(), 1)
await page.context().close()

page = await open('loading')
await sleep(700)
await win(page, '10-loading')
await page.context().close()

page = await open('error')
await page.waitForSelector('.alerts-pv.is-err')
await sleep(500)
await win(page, '11-error')
await page.context().close()

// The island: resting with unread shows the gold dot, with none it does not.
page = await open('alerts', { tab: 'home', opened: false, demo: 'empty' })
await sleep(1500)
assert.equal(await page.locator('.sh').getAttribute('data-unread'), '1')
await page.locator('.sh').screenshot({ path: `${dir}/12-island-gold-dot.png` })
await page.context().close()
page = await open('alertsempty', { tab: 'home', opened: false, demo: 'empty' })
await sleep(1500)
assert.equal(await page.locator('.sh').getAttribute('data-unread'), '0')
await page.locator('.sh').screenshot({ path: `${dir}/13-island-no-dot.png` })
await page.context().close()

await browser.close()
await server.close()
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log('Saved to', dir)
