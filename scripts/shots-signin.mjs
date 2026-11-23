// Sign-in: email and password, the magic link underneath, the remembered email, and "Set a sign-in code" in Settings.
// Supabase is mocked at the network, so no real account is touched. Also checks the password is never stored anywhere.
// Screenshots go to screenshots/signin/. Usage: node scripts/shots-signin.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const dir = 'screenshots/signin'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5261, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const BASE = 'http://localhost:5261/halo/'
const PASSWORD = 'correct-horse-9'
const errors = []

// A fake JWT is enough: supabase-js reads expires_at from the response.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', email: 'liam@example.com', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.sig`
const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'liam@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const seen = { password: 0, otp: 0 }

async function mock(ctx) {
  await ctx.route('**/auth/v1/**', async (route) => {
    const req = route.request()
    const url = req.url()
    const body = req.postData() ?? ''
    if (url.includes('grant_type=password')) {
      seen.password++
      const ok = JSON.parse(body).password === PASSWORD
      return route.fulfill(ok
        ? { status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user }) }
        : { status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) })
    }
    if (url.includes('/otp')) { seen.otp++; return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) }
    if (url.includes('/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  // Everything else Halo asks Supabase for (rows, realtime) just comes back empty.
  await ctx.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
}
const shot = (page, name) => page.locator('.signin-card').screenshot({ path: `${dir}/${name}.png` })

async function open(ctx, size, q = '') {
  const page = await ctx.newPage()
  page.setDefaultTimeout(120000) // a cold dev server needs a while to optimise on the first page
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize(size)
  await page.goto(`${BASE}${q}`, { timeout: 240000 })
  return page
}

// ---------- 1. Desktop sized card: password first, link underneath
let ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: 'dark' })
await mock(ctx)
let page = await open(ctx, { width: 460, height: 440 })
await page.waitForSelector('.signin-card input[type=password]')
assert.equal(await page.locator('.signin-card input[type=email]').inputValue(), '', 'nothing remembered yet')
assert.equal(await page.locator('.signin-card .signin-btn').innerText(), 'Sign in')
assert.equal(await page.locator('.signin-link', { hasText: 'Email me a link instead' }).count(), 1, 'the link option sits underneath')
assert.equal(await page.locator('input[type=password]').getAttribute('autocomplete'), 'current-password')
await shot(page, '1-signin-card')

// ---------- 2. Wrong password: plain words, field cleared, nothing remembered
await page.fill('input[type=email]', 'liam@example.com')
await page.fill('input[type=password]', 'not-the-one-1')
await page.click('.signin-btn')
await page.waitForSelector('.signin-msg.err')
assert.match(await page.locator('.signin-msg').innerText(), /Wrong email or password/)
assert.equal(await page.locator('input[type=password]').inputValue(), '', 'the password field is cleared after sending')
assert.equal(await page.evaluate(() => localStorage.getItem('halo.email')), null, 'a failed sign in does not remember the email')
await shot(page, '2-wrong-password')

// ---------- 3. Right password: signs in, remembers only the email
await page.fill('input[type=password]', PASSWORD)
await page.click('.signin-btn')
await page.waitForFunction(() => !document.documentElement.classList.contains('signin'), null, { timeout: 30000 })
assert.equal(await page.evaluate(() => localStorage.getItem('halo.email')), 'liam@example.com')
assert.equal(seen.password, 2)
const dump = await page.evaluate(() => JSON.stringify({ ...localStorage, session: { ...sessionStorage } }))
assert.ok(!dump.includes(PASSWORD) && !dump.includes('not-the-one-1'), 'no password is in localStorage or sessionStorage')
assert.ok(dump.includes('sb-') && dump.includes('refresh_token'), 'the session itself is kept (persistSession)')

// Reload: still signed in, no sign-in card (the session persists until Sign out).
await page.reload({ timeout: 240000 })
await page.waitForSelector('html:not(.signin) .sh, html:not(.signin) #app > *', { timeout: 60000 })
assert.equal(await page.locator('.signin-card').count(), 0, 'a reload keeps the session')
await page.close()

// ---------- 4. Signed out later: the email is filled in and the cursor waits in the password field
page = await open(ctx, { width: 460, height: 440 })
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k) })
await page.reload({ timeout: 240000 })
await page.waitForSelector('.signin-card input[type=password]')
assert.equal(await page.locator('input[type=email]').inputValue(), 'liam@example.com', 'last email is prefilled')
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'password')
await shot(page, '3-email-remembered')

// ---------- 5. "Email me a link instead", and back
await page.click('.signin-link:has-text("Email me a link instead")')
await page.waitForSelector('.signin-btn:has-text("Send magic link")')
assert.equal(await page.locator('input[type=email]').inputValue(), 'liam@example.com')
assert.equal(await page.locator('.signin-link', { hasText: 'Use a password instead' }).count(), 1)
await shot(page, '4-magic-link')
await page.click('.signin-btn')
await page.waitForSelector('.signin-title:has-text("Check your inbox")')
assert.equal(seen.otp, 1)
await page.close()

// ---------- 6. Phone width
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark', isMobile: true, hasTouch: true })
await mock(phone)
page = await open(phone, { width: 390, height: 844 })
await page.waitForSelector('.signin-card input[type=password]')
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll on the phone')
await page.screenshot({ path: `${dir}/5-phone.png` })
await phone.close()

// ---------- 7. Settings > Account: Set a sign-in code (fixtures, signed in)
const dctx = await browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark' })
page = await dctx.newPage()
page.setDefaultTimeout(120000)
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}?demo=soon&tab=more&open=1&api=more&account=1`, { timeout: 240000 })
await page.waitForSelector('.sh[data-open="true"] .st')
await page.locator('.st-nb[data-sec="account"]').click()
const snap = (n) => page.locator('.sh-clip').screenshot({ path: `${dir}/${n}.png` })
await snap('6-settings-account')
await page.click('.st-btn:has-text("Set a sign-in code")')
const pw = page.locator('.st-pw')
assert.equal(await pw.getAttribute('type'), 'password', 'hidden by default')
await pw.fill('short')
await page.click('.st-pwform .st-btn:has-text("Save")')
assert.match(await page.locator('.st-msg').innerText(), /at least 8/)
await snap('7-settings-too-short')
await page.click('.st-pwform .st-btn:has-text("Show")')
assert.equal(await pw.getAttribute('type'), 'text', 'Show reveals it')
await pw.fill('longenough-1')
await snap('8-settings-show')
await page.click('.st-pwform .st-btn:has-text("Hide")')
assert.equal(await pw.getAttribute('type'), 'password', 'Hide hides it again')
await pw.fill('fail-me-now')
await page.click('.st-pwform .st-btn:has-text("Save")')
await page.waitForFunction(() => /Could not save/.test(document.querySelector('.st-msg')?.textContent ?? ''))
await pw.fill('longenough-1')
await page.click('.st-pwform .st-btn:has-text("Save")')
await page.waitForSelector('.st-row:has-text("Saved. Use it next time")')
await snap('9-settings-saved')
const leftover = await page.evaluate(() => JSON.stringify({ ...localStorage }) + document.querySelector('.st')?.innerHTML)
assert.ok(!leftover.includes('longenough-1') && !leftover.includes('fail-me-now'), 'the new password is not kept anywhere')
await dctx.close()

await browser.close()
await server.close()
assert.deepEqual(errors, [], 'no page errors')
console.log('sign-in: all checks passed. Screenshots in', dir)
