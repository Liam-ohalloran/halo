// Card 08 check: drives /study with the dev mock backend, asserts the timer behaves, and saves screenshots
// at both HALO.md test sizes to screenshots/08/. Usage: npm run shots:study
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/08'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const URL = (mode) => `http://localhost:5199/halo/study/?mock=${mode}`
const sizes = { 'notchpixel-680x420': [680, 420], 'iphone-390x844': [390, 844] }
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(size, mode, ctx) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${size} ${mode}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${size} ${mode}: ${m.text()}`))
  await page.goto(URL(mode))
  await page.waitForFunction(() => window.__halo?.timer?.ready, null, { timeout: 8000 }).catch(() => {})
  return page
}
const clock = (page) => page.locator('.s-ring .h-ring-txt').innerText()
// The clip covers the stage but only the island's shape takes clicks, so click its top centre like a user would.
const poke = async (page) => { const b = await page.locator('.h-island').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + 14) }
const openIsland = async (page) => { await poke(page); await sleep(1100) }
const shot = (page, name, size) => page.screenshot({ path: `${dir}/${name}-${size}.png` })

for (const [size, [width, height]] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })

  // 1. Idle, expanded
  let page = await open(size, 'full', ctx)
  await shot(page, '1-resting', size)
  await openIsland(page)
  assert.equal(await clock(page), '25:00')
  await shot(page, '2-idle', size)

  // 2. Start, let it run, then pause. Paused time must not count.
  await page.getByRole('button', { name: 'Start' }).click()
  await sleep(3200)
  const running = await clock(page)
  assert.match(running, /^24:5[0-9]$/, `running clock ${running}`)
  await shot(page, '3-running', size)
  await page.getByRole('button', { name: 'Pause' }).click()
  const pausedAt = await clock(page)
  await sleep(2500)
  assert.equal(await clock(page), pausedAt, 'paused clock must not move')
  await shot(page, '4-paused', size)

  // 3. Reload while paused: same time, still paused.
  await page.reload()
  await page.waitForFunction(() => window.__halo?.timer?.ready)
  await openIsland(page)
  assert.equal(await clock(page), pausedAt, 'reload while paused keeps the time')
  assert.ok(await page.getByRole('button', { name: 'Resume' }).isVisible())

  // 4. Resume, reload mid run: time keeps counting through the reload.
  await page.getByRole('button', { name: 'Resume' }).click()
  await sleep(1500)
  const before = await clock(page)
  await page.reload()
  await page.waitForFunction(() => window.__halo?.timer?.ready)
  await openIsland(page)
  const after = await clock(page)
  const secs = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1])
  assert.ok(secs(after) <= secs(before) && secs(before) - secs(after) <= 6, `reload mid run ${before} -> ${after}`)
  await shot(page, '5-after-reload', size)

  // 5. Close the island: the compact pill shows subject and time left.
  await poke(page)
  await sleep(900)
  await shot(page, '6-pill', size)
  const pill = await page.locator('.s-pill-t').innerText()
  assert.equal(pill, 'Human Bio')

  // 6. Reset logs what was focused.
  await openIsland(page)
  await page.getByRole('button', { name: 'Reset' }).click()
  await page.getByText(/Logged|Under a minute/).waitFor({ timeout: 4000 })
  assert.equal(await clock(page), '25:00')
  await sleep(500)
  await shot(page, '7-logged', size)
  await ctx.close()

  // 7. A session past its goal finishes by itself and logs exactly 25 minutes.
  const ctx2 = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
  page = await ctx2.newPage()
  await page.addInitScript(() => {
    const started = Date.now() - 24 * 60_000 - 57_000
    const row = { id: 'x', subject: 'Chemistry', started_at: new Date(started).toISOString(), ended_at: null, minutes: null }
    localStorage.setItem('halo.mock.active', JSON.stringify(row))
    localStorage.setItem('halo.study.timer.v1', JSON.stringify({ status: 'running', subject: 'Chemistry', targetMs: 25 * 60_000, sessionId: 'x', startedAt: started, acc: 0, segStart: started }))
  })
  await page.goto(URL('full'))
  await page.waitForFunction(() => window.__halo?.timer?.ready)
  await openIsland(page)
  await shot(page, '8-near-goal', size)
  await page.getByText(/Goal hit/).waitFor({ timeout: 8000 })
  assert.equal(await clock(page), '25:00')
  assert.match(await page.locator('.s-note').innerText(), /25m of Chemistry/)
  await shot(page, '9-goal-hit', size)
  await ctx2.close()

  // 8. Other states: empty, error, loading.
  for (const mode of ['empty', 'error', 'loading']) {
    const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
    const p = await c.newPage()
    p.on('pageerror', (e) => errors.push(`${size} ${mode}: ${e.message}`))
    await p.goto(URL(mode))
    await p.waitForSelector('.h-isl-clip')
    await sleep(mode === 'loading' ? 900 : 1500)
    await poke(p)
    await sleep(1200)
    await shot(p, `10-${mode}`, size)
    await c.close()
  }
}
await browser.close()
await server.close()
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1 } else console.log(`All checks passed. Screenshots in ${dir}`)
