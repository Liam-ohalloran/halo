// Card 21: Money and Marks screenshots at 600 x 290: filled, many rows with long names, empty, loading, error, the entry sheets,
// and a row added and removed. Also checks that a press never rebuilds the other tiles and that an added row shows at once.
// Saved to screenshots/card-21/. Usage: node scripts/shots-card21.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-21'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5254, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(tab, api, { w = 760, h = 400, demo = 'soon' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${api}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${api}: ${m.text()}`))
  await page.goto(`http://localhost:5254/halo/?demo=${demo}&tab=${tab}&open=1&api=${api}`)
  await page.waitForSelector(`.sh[data-open="true"] .${tab}-pv`)
  return page
}
const win = (page, name) => page.locator('.sh-clip').screenshot({ path: `${dir}/${name}.png` })

// ---------- Money
let page = await open('money', 'money')
await page.waitForSelector('.money-pv:not(.is-loading)')
await sleep(1700)
await win(page, '1-money-filled')
assert.match(await page.locator('.money-pv [data-k="earned"]').innerText(), /^\$\d/)
assert.equal(await page.locator('.money-pv .g').count(), 3, 'three goals')
assert.equal(await page.locator('.money-pv .subsL .r').count(), 4, 'four subscriptions')

// Add a spend: only the tiles it touches change, the rest are the same elements.
await page.evaluate(() => { document.querySelector('.money-pv [data-k="goals"] .goals3').dataset.marker = 'same' })
await page.locator('.money-pv [data-act="add"]').click()
await page.waitForSelector('.money-pv .sheet.open')
await sleep(500)
await win(page, '2-money-add-sheet')
await page.fill('.money-pv [name="name"]', 'Zambrero')
await page.fill('.money-pv [name="amount"]', '12.5')
await page.locator('.money-pv .sBtn.go').click()
await page.waitForSelector('.money-pv .sheet', { state: 'detached' })
await sleep(600)
assert.equal(await page.evaluate(() => document.querySelector('.money-pv [data-k="goals"] .goals3').dataset.marker), 'same', 'adding a spend must not rebuild the goals tile')
assert.match(await page.locator('.money-pv [data-k="recent"]').innerText(), /Zambrero/)
await win(page, '3-money-after-add')

// A bad amount shows a plain sentence and keeps the sheet open.
await page.locator('.money-pv [data-act="add"]').click()
await page.waitForSelector('.money-pv .sheet.open')
await page.fill('.money-pv [name="name"]', 'Oops')
await page.locator('.money-pv .sBtn.go').click()
await sleep(200)
assert.match(await page.locator('.money-pv .sErr').innerText(), /Amount/)
await win(page, '4-money-sheet-problem')
await page.keyboard.press('Escape')
await sleep(400)
assert.equal(await page.locator('.sh').getAttribute('data-open'), 'true', 'Escape closes the sheet, not the island')

// Edit a goal, then remove the spend that was added.
await page.locator('.money-pv .g').first().click()
await page.waitForSelector('.money-pv .sheet.open')
await sleep(500)
await win(page, '5-money-goal-sheet')
await page.fill('.money-pv [name="saved"]', '2000')
await page.locator('.money-pv .sBtn.go').click()
await page.waitForSelector('.money-pv .sheet', { state: 'detached' })
await sleep(600)
assert.match(await page.locator('.money-pv [data-k="goals"]').innerText(), /2,000/)
await page.locator('.money-pv [data-k="recent"] .r', { hasText: 'Zambrero' }).click()
await page.waitForSelector('.money-pv .sheet.open')
await page.locator('.money-pv .sBtn.rm').click()
await page.waitForSelector('.money-pv .sheet', { state: 'detached' })
await sleep(600)
assert.doesNotMatch(await page.locator('.money-pv [data-k="recent"]').innerText(), /Zambrero/)
await page.context().close()

page = await open('money', 'moneymany')
await page.waitForSelector('.money-pv:not(.is-loading)')
await sleep(1700)
await win(page, '6-money-many-long')
await page.context().close()

page = await open('money', 'moneyempty')
await page.waitForSelector('.money-pv:not(.is-loading)')
await sleep(1500)
await win(page, '7-money-empty')
await page.context().close()

page = await open('money', 'loading'); await sleep(700); await win(page, '8-money-loading'); await page.context().close()
page = await open('money', 'error'); await page.waitForSelector('.money-pv.is-err'); await sleep(400); await win(page, '9-money-error'); await page.context().close()

// ---------- Marks
page = await open('marks', 'marks')
await page.waitForSelector('.marks-pv:not(.is-loading)')
await sleep(1700)
await win(page, '10-marks-filled')
assert.equal(await page.locator('.marks-pv .tile[data-subject]').count() >= 6, true)
await page.evaluate(() => { document.querySelector('.marks-pv .tile').dataset.marker = 'same' })
await page.locator('.marks-pv .tile[data-subject]', { hasText: 'Chem' }).first().click()
await page.waitForSelector('.marks-pv .sheet.open')
await sleep(500)
await win(page, '11-marks-subject-sheet')
await page.fill('.marks-pv [name="assessment"]', 'Titration prac')
await page.fill('.marks-pv [name="score"]', '90')
await page.locator('.marks-pv .sBtn.go').click()
await page.waitForSelector('.marks-pv .sheet', { state: 'detached' })
await sleep(600)
assert.equal(await page.evaluate(() => document.querySelector('.marks-pv .tile').dataset.marker !== 'same'), true, 'the Chemistry tile changed')
await win(page, '12-marks-after-add')
await page.context().close()

page = await open('marks', 'marksmany'); await page.waitForSelector('.marks-pv:not(.is-loading)'); await sleep(1700); await win(page, '13-marks-many-long'); await page.context().close()
page = await open('marks', 'marksempty'); await page.waitForSelector('.marks-pv:not(.is-loading)'); await sleep(1500); await win(page, '14-marks-empty'); await page.context().close()
page = await open('marks', 'loading'); await sleep(700); await win(page, '15-marks-loading'); await page.context().close()
page = await open('marks', 'error'); await page.waitForSelector('.marks-pv.is-err'); await sleep(400); await win(page, '16-marks-error'); await page.context().close()

await browser.close()
await server.close()
if (errors.length) { console.log(errors.join('\n')); process.exit(1) }
console.log('Saved to', dir)
