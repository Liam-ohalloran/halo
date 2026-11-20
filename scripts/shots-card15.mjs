// Card 15 (updated for card 15b: the island is the window): screenshots of the 600 x 290 shell, one per tab, plus checks that it
// matches the board and does not freeze. Embedded, the window is always open and the bottom corners are the rounded ones.
// Usage: node scripts/shots-card15.mjs   (saves to screenshots/card-15/, exits 1 on any problem)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/card-15'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5235 }, logLevel: 'error' })
await server.listen()
const base = `http://localhost:${server.httpServer.address().port}/halo/`
const TABS = ['home', 'music', 'study', 'pay', 'sixers', 'week', 'more', 'controls']
const RAIL = ['Home', 'Music', 'Study', 'Pay', 'Sixers', 'Week', 'More tabs', 'Controls']
const browser = await chromium.launch()
const problems = []
const note = (m) => problems.push(m)

async function open(url, viewport = { width: 600, height: 290 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark', ...extra })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => note(`${url}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch/i.test(m.text()) && note(`${url}: ${m.text()}`))
  await page.goto(base + url)
  await page.waitForSelector('.sh')
  await page.waitForTimeout(900)
  return { ctx, page }
}

// ---- 1. Each tab's shell at 600 x 290 (embedded, the way NotchPixel shows it)
for (const tab of TABS) {
  const { ctx, page } = await open(`?embed=1&demo=soon&tab=${tab}`)
  await page.screenshot({ path: `${dir}/${tab}.png` })
  const r = await page.evaluate(() => {
    const sh = document.querySelector('.sh')
    const cs = getComputedStyle(sh)
    const settings = !!document.querySelector('.set-panel')
    const b = sh.getBoundingClientRect()
    const rail = [...document.querySelectorAll('.sh-tab')].map((t) => t.getAttribute('aria-label'))
    const sel = document.querySelector('.sh-tab[aria-selected="true"]')
    const body = document.querySelector('.sh-body')
    const bad = []
    // Text that wraps or pokes out of the header is a miss against the board.
    for (const el of document.querySelectorAll('.sh-head *')) {
      const r = el.getBoundingClientRect()
      if (r.right > b.right + 0.5 || r.left < b.left - 0.5) bad.push(el.className || el.tagName)
    }
    const h1 = document.querySelector('.sh-title').getBoundingClientRect().height
    return {
      w: b.width, h: b.height, radius: cs.borderBottomLeftRadius, settings, rail, selected: sel?.getAttribute('aria-label'), selColour: sel && getComputedStyle(sel).color,
      title: document.querySelector('.sh-title').textContent, meta: document.querySelector('.sh-meta').textContent,
      soon: document.querySelector('.sh-soon-t')?.textContent ?? null, fit: body.querySelector('.h-panel')?.dataset.fit, bad, h1,
      docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      hasIsland: !!document.querySelector('.h-island, .h-isl-svg, .home-shell, .signed-note, .embed-slot'),
      glow: !!document.querySelector(`.sh-skin.is-on .sh-glow`),
    }
  })
  const want = RAIL[TABS.indexOf(tab)]
  if (r.w !== 600 || r.h !== 290) note(`${tab}: panel is ${r.w} x ${r.h}, want 600 x 290`)
  if (r.radius !== '26px') note(`${tab}: radius ${r.radius}`)
  if (r.rail.join('|') !== RAIL.join('|')) note(`${tab}: rail ${r.rail}`)
  if (r.selected !== want) note(`${tab}: selected ${r.selected}, want ${want}`)
  if (r.bad.length) note(`${tab}: header pokes out ${r.bad}`)
  if (r.hasIsland) note(`${tab}: embed still shows island chrome`)
  if (!r.glow) note(`${tab}: glow missing`)
  if (r.docScroll[0] > 600 || r.docScroll[1] > 290) note(`${tab}: page scrolls ${r.docScroll}`)
  const builtTab = ['home', 'study', 'pay', 'sixers', 'more'].includes(tab)
  if (tab === 'more' && !r.settings) note('more: Settings panel missing')
  if (!builtTab && r.soon !== 'Coming soon') note(`${tab}: missing "Coming soon" (${r.soon})`)
  console.log(tab.padEnd(9), `${r.w}x${r.h}`, r.radius, r.title, '|', r.meta || '-', '|', r.soon ?? `fit ${r.fit}`, '|', r.selColour)
  await ctx.close()
}

// ---- 2. Empty states of the three live tabs
for (const tab of ['home', 'study', 'pay']) {
  const { ctx, page } = await open(`?embed=1&demo=empty&tab=${tab}`)
  await page.screenshot({ path: `${dir}/${tab}-empty.png` })
  await ctx.close()
}

// ---- 3. Switching tabs crossfades in 180 ms, never freezes, and never leaves a panel at opacity 0
{
  const { ctx, page } = await open('?embed=1&demo=soon&tab=home')
  const t0 = await page.evaluate(async () => {
    const out = {}
    const click = (n) => document.querySelector(`.sh-tab[aria-label="${n}"]`).click()
    // a normal switch: both panels are on screen mid-fade, only the new one at the end
    click('Pay')
    await new Promise((r) => setTimeout(r, 90))
    out.mid = [...document.querySelectorAll('.sh-body > *')].map((p) => Number(getComputedStyle(p).opacity).toFixed(2))
    await new Promise((r) => setTimeout(r, 260))
    out.after = [...document.querySelectorAll('.sh-body > *')].map((p) => getComputedStyle(p).opacity)
    // hammer every tab twice, quickly, then settle
    for (let i = 0; i < 2; i++) for (const n of ['Home', 'Music', 'Study', 'Pay', 'Sixers', 'Week', 'More tabs', 'Controls']) { click(n); await new Promise((r) => setTimeout(r, 25)) }
    click('Home')
    await new Promise((r) => setTimeout(r, 400))
    out.panels = [...document.querySelectorAll('.sh-body > *')].map((p) => ({ cls: p.className, op: getComputedStyle(p).opacity, anims: p.getAnimations().length }))
    // back and forth a second time to prove nothing is pinned invisible
    click('Pay'); await new Promise((r) => setTimeout(r, 300)); click('Home'); await new Promise((r) => setTimeout(r, 300))
    out.home = getComputedStyle(document.querySelector('.sh-body > *')).opacity
    return out
  })
  console.log('crossfade', JSON.stringify(t0))
  if (t0.after.length !== 1 || t0.after[0] !== '1') note(`crossfade: after switch ${t0.after}`)
  if (t0.mid.length < 2) note(`crossfade: no overlap mid fade ${t0.mid}`)
  if (t0.panels.length !== 1 || t0.panels[0].op !== '1' || t0.panels[0].anims) note(`crossfade: stuck after hammering ${JSON.stringify(t0.panels)}`)
  if (t0.home !== '1') note(`crossfade: Home pinned at opacity ${t0.home}`)
  // keyboard: arrows move between tabs and keep focus
  await page.focus('.sh-tab[aria-selected="true"]')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(260)
  const k = await page.evaluate(() => ({ sel: document.querySelector('.sh-tab[aria-selected="true"]').getAttribute('aria-label'), focus: document.activeElement?.getAttribute('aria-label') }))
  if (k.sel !== 'Music' || k.focus !== 'Music') note(`keyboard: ${JSON.stringify(k)}`)
  await ctx.close()
}

// ---- 4. Hover and focus-visible states of the rail (zoomed), and the same page not embedded
{
  const { ctx, page } = await open('?embed=1&demo=soon&tab=pay')
  await page.hover('.sh-tab[aria-label="Sixers"]')
  await page.waitForTimeout(220)
  await page.screenshot({ path: `${dir}/rail-hover.png`, clip: { x: 300, y: 0, width: 300, height: 48 } })
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(220)
  await page.screenshot({ path: `${dir}/rail-focus.png`, clip: { x: 300, y: 0, width: 300, height: 48 } })
  await ctx.close()
}
{
  const { ctx, page } = await open('?demo=soon&tab=study&open=1', { width: 1000, height: 460 })
  await page.screenshot({ path: `${dir}/desktop-not-embedded.png` })
  const r = await page.evaluate(() => ({ old: !!document.querySelector('.h-island, .home-shell'), shell: !!document.querySelector('.sh'), open: document.querySelector('.sh')?.dataset.open }))
  if (r.old || !r.shell || r.open !== 'true') note(`desktop: ${JSON.stringify(r)}`)
  await ctx.close()
}
// A window smaller than the panel scales it down instead of cutting it off
{
  const { ctx, page } = await open('?embed=1&demo=soon&tab=home', { width: 480, height: 232 })
  await page.screenshot({ path: `${dir}/small-window.png` })
  const b = await page.evaluate(() => { const r = document.querySelector('.sh').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round) })
  if (b[0] < 0 || b[2] > 480 || b[3] > 233) note(`small window: panel at ${b}`)
  await ctx.close()
}

await browser.close()
await server.close()
if (problems.length) { console.error('\nPROBLEMS\n' + problems.join('\n')); process.exit(1) }
console.log('\nok: all checks passed. Screenshots in', dir)
