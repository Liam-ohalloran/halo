// Card 19: Week tab screenshots at 600 x 290, busy week, normal week, empty week, a selected day, a tapped event,
// loading and error. Saved to screenshots/card-19/. Usage: node scripts/shots-card19.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-19'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5252, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(api) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${api}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${api}: ${m.text()}`))
  await page.goto(`http://localhost:5252/halo/?demo=soon&tab=week&open=1&api=${api}`)
  await page.waitForSelector('.sh[data-open="true"] .week-pv')
  return page
}
const win = (page, name) => page.locator('.sh-clip').screenshot({ path: `${dir}/${name}.png` })

let page = await open('weekbusy')
await page.waitForSelector('.week-pv .calEv')
await sleep(1800)
await win(page, '1-busy-week')
assert.equal(await page.locator('.calD').count(), 7)
assert.equal(await page.locator('.calD b.tm').count(), 1, 'one red circle')
assert.equal(await page.locator('.calD.on').count(), 1, 'one selected day')
// Tap a day: the highlight moves, nothing is rebuilt.
await page.evaluate(() => { document.querySelector('.week-pv .calEv').dataset.marker = 'same' })
await page.locator('.calD[data-i="3"]').click()
await sleep(400)
assert.equal(await page.locator('.calD.on').getAttribute('data-i'), '3')
assert.equal(await page.evaluate(() => document.querySelector('.week-pv .calEv').dataset.marker), 'same', 'tapping a day must not rebuild the events')
await win(page, '2-day-selected')
// Tap an event: its full title and time.
await page.locator('.calEv[data-ev="sw3"]').click()
await sleep(500)
const tipText = await page.locator('.week-pv .pv-tip').innerText()
assert.match(tipText, /TUESDAY PI 7:30-12/)
assert.match(tipText, /7:30 am to 12 pm/)
await win(page, '3-event-tapped')
await page.context().close()

page = await open('week')
await page.waitForSelector('.week-pv .calEv')
await sleep(1800)
await win(page, '4-normal-week')
await page.context().close()

page = await open('empty')
await page.waitForSelector('.week-pv:not(.is-loading)')
await sleep(1200)
await win(page, '5-empty-week')
assert.equal(await page.locator('.week-pv.is-empty').count(), 1)
await page.context().close()

page = await open('loading')
await sleep(600)
await win(page, '6-loading')
await page.context().close()

page = await open('error')
await page.waitForSelector('.week-pv.is-err')
await sleep(500)
await win(page, '7-error')
await page.context().close()

await browser.close()
await server.close()
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log('Saved to', dir)
