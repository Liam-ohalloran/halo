// Card 16: behaviour checks for Home, Pay and Study. A press must change only what moved (the same DOM nodes stay in
// place, the panel is never rebuilt or faded), and the entrance must play when a tab is switched to.
// Usage: node scripts/test-card16.mjs   (exits 1 on any failure)
import { createServer } from 'vite'
import { chromium } from 'playwright'

const server = await createServer({ server: { port: 5254, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const fails = []
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`) }

const ctx = await browser.newContext({ viewport: { width: 700, height: 340 }, colorScheme: 'dark' })
const page = await ctx.newPage()
page.on('pageerror', (e) => fails.push(`page error: ${e.message}`))
await page.goto('http://localhost:5254/halo/?demo=soon&open=1&tab=pay&home=full&sixers=final-win')
await page.waitForSelector('.pay-pv .payHero')
await page.waitForTimeout(1800)

// ---- Pay: the week switch updates in place
const tag = (sel) => page.evaluate((s) => { const e = document.querySelector(s); e.__mark = e.__mark ?? Math.random(); return e.__mark }, sel)
const same = (sel, mark) => page.evaluate(([s, m]) => document.querySelector(s)?.__mark === m, [sel, mark])
const hero = await tag('.pay-pv .payHero'), pill = await tag('.pay-pv .sp'), panel = await tag('.pay-pv')
const amt0 = await page.textContent('.pay-pv [data-k="amt"]')
await page.click('.pay-pv .toggle button[data-w="1"]')
await page.waitForTimeout(1300)
check(await same('.pay-pv .payHero', hero) && await same('.pay-pv .sp', pill) && await same('.pay-pv', panel), 'Pay: THIS to NEXT keeps the same tiles (no rebuild)')
check((await page.textContent('.pay-pv [data-k="amt"]')) !== amt0, 'Pay: the amount changed to next week')
check((await page.textContent('.pay-pv [data-k="cap"]')).includes('NEXT') || (await page.textContent('.pay-pv [data-k="cap"]')).toLowerCase().includes('next'), 'Pay: the caption says next week')
check(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.pay-pv')).opacity) === 1), 'Pay: the panel never faded out on a press')
await page.click('.pay-pv [data-k="swap"]')
await page.waitForTimeout(1300)
check((await page.textContent('.pay-pv [data-k="amt"]')) === amt0, 'Pay: the arrow pill switches back to this week')

// ---- Study: subject, length, start and pause update in place
await page.click('.sh-tab[aria-label="Study"]')
await page.waitForSelector('.study-pv .grid')
await page.waitForTimeout(1800)
const sPanel = await tag('.study-pv'), sGrid = await tag('.study-pv .grid'), sTile = await tag('.study-pv .t')
await page.click('.study-pv [data-k="len"] button[data-m="50"]')
await page.click('.study-pv .sr[data-n="Methods"]')
check((await page.textContent('.study-pv [data-k="time"]')) === '50:00', 'Study: 50 MIN sets the timer to 50:00')
check((await page.textContent('.study-pv [data-k="cap"]')).includes('Methods'), 'Study: tapping a subject focuses it')
await page.click('.study-pv [data-k="play"]')
await page.waitForTimeout(2300)
check(/^49:5\d$|^49:4\d$/.test(await page.textContent('.study-pv [data-k="time"]')), 'Study: the timer counts down')
check(await same('.study-pv', sPanel) && await same('.study-pv .grid', sGrid) && await same('.study-pv .t', sTile), 'Study: starting the timer keeps the same tiles (no rebuild)')
check((await page.locator('.study-pv svg.dots circle').count()) === 60, 'Study: the dotted ring has its 60 dots')
await page.click('.study-pv [data-k="play"]')
check((await page.textContent('.study-pv [data-k="state"]')) === 'Paused', 'Study: pause shows Paused')
const left = await page.textContent('.study-pv [data-k="time"]')
await page.reload()
await page.waitForSelector('.sh-tab[aria-label="Study"]')
await page.click('.sh-tab[aria-label="Study"]')
await page.waitForSelector('.study-pv .grid')
await page.waitForTimeout(1500)
check((await page.textContent('.study-pv [data-k="time"]')) === left, 'Study: a reload mid session keeps the time')
await page.click('.study-pv [data-k="stop"]')
await page.waitForTimeout(600)
check((await page.textContent('.study-pv [data-k="state"]')) === 'Ready', 'Study: stop logs the session and goes back to Ready')

// ---- Entrance plays when the tab is switched to, not on a press
await page.click('.sh-tab[aria-label="Home"]')
await page.waitForTimeout(60)
const early = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.home-pv .dp')).opacity))
await page.waitForTimeout(1500)
const late = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.home-pv .dp')).opacity))
check(early < 1 && late === 1, `Home: tiles pop in on switch (opacity ${early.toFixed(2)} then ${late})`)
const wMark = await tag('.home-pv .dp[data-widget="shift"]')
await page.waitForTimeout(1200)
check(await same('.home-pv .dp[data-widget="shift"]', wMark), 'Home: a data refresh keeps the widgets in place')

// ---- Home widgets open their tabs
await page.click('.home-pv .dp[data-widget="pay"]')
await page.waitForSelector('.pay-pv')
check(await page.evaluate(() => document.querySelector('.sh').dataset.tab === 'pay'), 'Home: the Pay widget opens the Pay tab')
await page.click('.sh-tab[aria-label="Home"]')
await page.click('.home-pv .dp[data-widget="streak"]')
check(await page.evaluate(() => document.querySelector('.sh').dataset.tab === 'study'), 'Home: the Streak widget opens the Study tab')

// ---- Reduced motion: nothing is left hidden
const rm = await browser.newContext({ viewport: { width: 700, height: 340 }, reducedMotion: 'reduce' })
const p2 = await rm.newPage()
await p2.goto('http://localhost:5254/halo/?demo=soon&open=1&tab=home&home=full')
await p2.waitForSelector('.home-pv .dp')
await p2.waitForTimeout(500)
check(await p2.evaluate(() => [...document.querySelectorAll('.home-pv .dp')].every((e) => Number(getComputedStyle(e).opacity) === 1)), 'Reduced motion: every Home widget is visible straight away')

await browser.close(); await server.close()
if (fails.length) { console.log(`\n${fails.length} failed`); process.exit(1) }
console.log('\nAll checks passed.')
