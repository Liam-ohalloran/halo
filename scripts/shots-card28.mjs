// Card 28: the update row in Settings, Laptop, with a pretend app behind it (window.__TAURI__ is stubbed), in each state.
// Checks the wording, that one press does the right thing, and that nothing overflows. Saved to screenshots/card-28/.
// Usage: node scripts/shots-card28.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/card-28'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5264, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A pretend Halo app. `update` is what a check finds (null for none), `fail` makes the check or the install fail. */
async function open(name, { update = null, failCheck = false, failInstall = false, launchEvent = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(`${name}: ${m.text()}`))
  await page.addInitScript(({ update, failCheck, failInstall, launchEvent }) => {
    const listeners = {}
    window.__calls = []
    window.__TAURI__ = {
      core: { invoke: async (cmd) => {
        window.__calls.push(cmd)
        if (cmd === 'app_version') return '0.1.0'
        if (cmd === 'check_update') { await new Promise((r) => setTimeout(r, 400)); if (failCheck) throw new Error('offline'); return update }
        if (cmd === 'install_update') { await new Promise((r) => setTimeout(r, 600)); if (failInstall) throw new Error('nope'); return null }
        if (cmd === 'get_state') return { style: 'notch', monitor: null, monitors: [], paused: false, autostart: true, hotkey: 'Ctrl+Alt+Space', hotkeys: ['Ctrl+Alt+Space', 'Ctrl+Alt+H'] }
        return null
      } },
      event: { listen: async (n, cb) => { (listeners[n] ||= []).push(cb); return () => {} } },
    }
    window.__emit = (n, payload) => (listeners[n] || []).forEach((cb) => cb({ payload }))
    if (launchEvent) setTimeout(() => window.__emit('halo-update', { version: '0.2.0', notes: null }), 1500)
  }, { update, failCheck, failInstall, launchEvent })
  await page.goto('http://localhost:5264/halo/?demo=soon&tab=more&open=1&desktop=1&api=full')
  await page.waitForSelector('.sh[data-open="true"] .st')
  await page.locator('.st-nb[data-sec="laptop"]').click()
  await sleep(500)
  return { page, ctx }
}
const win = (page, n) => page.locator('.sh-clip').screenshot({ path: `${dir}/${n}.png` })
const row = (page) => page.locator('.st-sec[data-sec="laptop"] .st-row', { hasText: 'Halo 0' })
const fits = async (page) => assert.ok(await page.evaluate(() => { const m = document.querySelector('.st-main'); return m.scrollHeight - m.clientHeight <= 1 }), 'the section still fits without scrolling')

// Nothing found yet: the version and a button.
let t = await open('idle')
assert.match(await row(t.page).innerText(), /Halo 0\.1\.0/)
assert.match(await row(t.page).innerText(), /Checks for updates when it starts/)
await fits(t.page); await win(t.page, '1-update-idle')
// Check: up to date.
await t.page.getByRole('button', { name: 'Check for updates' }).click()
await sleep(150)
assert.match(await row(t.page).innerText(), /Looking for an update/)
assert.equal(await t.page.locator('.st-sec[data-sec="laptop"] .st-btn', { hasText: 'Working' }).isDisabled(), true, 'no second press while it looks')
await sleep(600)
assert.match(await row(t.page).innerText(), /You have the newest Halo/)
await win(t.page, '2-update-latest')
await t.ctx.close()

// An update is found: one button installs it and restarts.
t = await open('available', { update: { version: '0.2.0', notes: null } })
await t.page.getByRole('button', { name: 'Check for updates' }).click()
await sleep(900)
assert.match(await row(t.page).innerText(), /Halo 0\.2\.0 is ready/)
await fits(t.page); await win(t.page, '3-update-ready')
await t.page.getByRole('button', { name: 'Install and restart' }).click()
await sleep(200)
assert.match(await row(t.page).innerText(), /Installing Halo 0\.2\.0/)
await win(t.page, '4-update-installing')
await sleep(700)
assert.deepEqual((await t.page.evaluate(() => window.__calls)).filter((c) => c.endsWith('_update')), ['check_update', 'install_update'])
await t.ctx.close()

// The app found one by itself a little after launch.
t = await open('launch', { update: { version: '0.2.0', notes: null }, launchEvent: true })
await sleep(1500)
assert.match(await row(t.page).innerText(), /Halo 0\.2\.0 is ready/)
assert.deepEqual((await t.page.evaluate(() => window.__calls)).filter((c) => c === 'check_update'), [], 'the page did not have to ask')
await t.ctx.close()

// Failures say so and offer a retry. Neither loses the current Halo.
t = await open('failcheck', { failCheck: true })
await t.page.getByRole('button', { name: 'Check for updates' }).click()
await sleep(900)
assert.match(await row(t.page).innerText(), /couldn't check for updates/)
assert.ok(await t.page.getByRole('button', { name: 'Try again' }).count())
await fits(t.page); await win(t.page, '5-update-check-failed')
await t.ctx.close()
t = await open('failinstall', { update: { version: '0.2.0', notes: null }, failInstall: true })
await t.page.getByRole('button', { name: 'Check for updates' }).click(); await sleep(900)
await t.page.getByRole('button', { name: 'Install and restart' }).click(); await sleep(1100)
assert.match(await row(t.page).innerText(), /didn't install/)
await win(t.page, '6-update-install-failed')
await t.ctx.close()

assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`)
await browser.close()
await server.close()
console.log('Card 28: all checks passed. Screenshots in', dir)
