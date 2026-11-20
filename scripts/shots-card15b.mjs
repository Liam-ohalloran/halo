// Card 15b: the island is the window. Screenshots of collapsed, mid grow and expanded for each tab, a short recording
// of open and close, and checks that nothing scrolls and the island keeps its ears and flat top.
// Usage: node scripts/shots-card15b.mjs   (saves to screenshots/card-15b/, exits 1 on any problem)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'

const dir = 'screenshots/card-15b'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5236, strictPort: true }, logLevel: 'error' })
await server.listen()
const base = 'http://localhost:5236/halo/'
const ALL = ['home', 'music', 'study', 'pay', 'sixers', 'week', 'more', 'controls']
const BUILT = ['home', 'study', 'pay', 'sixers', 'more']
const browser = await chromium.launch()
const problems = []
const note = (m) => problems.push(m)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(url, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark', ...extra })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => note(`${url}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch/i.test(m.text()) && note(`${url}: ${m.text()}`))
  await page.goto(base + url)
  await page.waitForSelector('.sh')
  await page.waitForTimeout(900)
  return { ctx, page }
}
// Freeze every running transition at t ms, so the mid grow frame is the same every time.
const freezeAt = (page, t) => page.evaluate((t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t } }, t)
const box = (page) => page.evaluate(() => { const r = document.querySelector('.sh').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, left: r.left } })

// ---- 1. Collapsed, mid grow, expanded for every tab. Desktop page, so the object sits on a plain background.
const VIEW = { width: 760, height: 400 }
const CLIP = { x: 60, y: 0, width: 640, height: 390 }
const CLIP_SMALL = { x: 60, y: 0, width: 640, height: 90 }
for (const tab of ALL) {
  const { ctx, page } = await open(`?demo=soon&tab=${tab}`, VIEW)
  const c = await box(page)
  await page.screenshot({ path: `${dir}/${tab}-1-collapsed.png`, clip: CLIP_SMALL })
  if (c.w !== 300 || c.h !== 40 || c.top !== 0) note(`${tab}: collapsed is ${c.w} x ${c.h} at top ${c.top}, want the 300 x 40 shift pill at 0`)
  await page.click('.sh-pill')
  await page.waitForTimeout(40)
  await freezeAt(page, 70)
  const m = await box(page)
  await page.screenshot({ path: `${dir}/${tab}-2-growing.png`, clip: CLIP })
  if (!(m.w > 200 && m.w < 640 && m.h > 34)) note(`${tab}: mid grow looks wrong ${JSON.stringify(m)}`)
  await ctx.close()

  const e = await open(`?demo=soon&tab=${tab}&open=1`, VIEW)
  await e.page.waitForTimeout(700)
  await e.page.screenshot({ path: `${dir}/${tab}-3-expanded.png`, clip: CLIP })
  const r = await e.page.evaluate(() => {
    const sh = document.querySelector('.sh')
    const b = sh.getBoundingClientRect()
    const cs = getComputedStyle(sh)
    const ear = getComputedStyle(sh, '::before')
    const clipEl = document.querySelector('.sh-clip')
    const scrollers = []
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el)
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && el !== document.documentElement && el !== document.body && el.scrollHeight > el.clientHeight + 1) scrollers.push(el.className || el.tagName)
    }
    const host = document.querySelector('.sh-body')
    const panel = host.firstElementChild
    return {
      w: b.width, h: b.height, top: b.top, shadow: cs.boxShadow, glowVar: cs.getPropertyValue('--glow').trim(), radius: cs.borderBottomLeftRadius, topRadius: cs.borderTopLeftRadius,
      earW: ear.width, earContent: ear.content, shOverflow: cs.overflow, clipOverflow: getComputedStyle(clipEl).overflow,
      docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight],
      scrollers, hostOverflow: getComputedStyle(host).overflowY, hostH: host.clientHeight, panelH: panel?.scrollHeight ?? 0, fit: panel?.dataset?.fit,
    }
  })
  if (r.w !== 600 || r.h !== 290 || r.top !== 0) note(`${tab}: open is ${r.w} x ${r.h} at ${r.top}`)
  if (r.radius !== '26px' || r.topRadius !== '0px') note(`${tab}: radii bottom ${r.radius} top ${r.topRadius}`)
  if (r.earW !== '10px' || r.shOverflow !== 'visible' || r.clipOverflow !== 'hidden') note(`${tab}: ears or overflow wrong ${JSON.stringify([r.earW, r.shOverflow, r.clipOverflow])}`)
  if (r.shadow === 'none' || !r.glowVar) note(`${tab}: glow outside the bottom edge is missing (${r.shadow})`)
  if (r.scrollers.length) note(`${tab}: scrolling element ${r.scrollers}`)
  if (r.docScroll[0] > r.docScroll[2] || r.docScroll[1] > r.docScroll[3]) note(`${tab}: page scrolls ${r.docScroll}`)
  if (r.panelH > r.hostH + 1) note(`${tab}: panel is ${r.panelH}px in a ${r.hostH}px window, content is cut off`)
  console.log(tab.padEnd(9), `${r.w}x${r.h}`, r.radius, 'host', r.hostH, 'panel', r.panelH, 'fit', r.fit)
  await e.ctx.close()
}

// The resting island, nothing live: 200 x 34
{
  const { ctx, page } = await open('?demo=empty&tab=home', VIEW)
  const c = await box(page)
  await page.screenshot({ path: `${dir}/resting-200x34.png`, clip: CLIP_SMALL })
  if (c.w !== 200 || c.h !== 34 || c.top !== 0) note(`resting island is ${c.w} x ${c.h} at ${c.top}`)
  await ctx.close()
}

// ---- 2. Embedded: only the object, transparent page, no scrollbar at exactly 600 x 290
for (const tab of ALL) {
  const { ctx, page } = await open(`?embed=1&demo=soon&tab=${tab}`, { width: 600, height: 290 })
  await page.screenshot({ path: `${dir}/embed-${tab}.png`, omitBackground: true })
  const r = await page.evaluate(() => ({
    bg: [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.embed-root')).backgroundColor],
    doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    sh: (({ width, height, top }) => [width, height, top])(document.querySelector('.sh').getBoundingClientRect()),
    extra: !!document.querySelector('.h-island, .home-shell, .signed-note, .embed-slot'),
  }))
  if (r.bg.some((c) => c !== 'rgba(0, 0, 0, 0)')) note(`embed ${tab}: not transparent ${r.bg}`)
  if (r.doc[0] > 600 || r.doc[1] > 290) note(`embed ${tab}: scrolls ${r.doc}`)
  if (r.sh[0] !== 600 || r.sh[1] !== 290 || r.sh[2] !== 0) note(`embed ${tab}: object ${r.sh}`)
  if (r.extra) note(`embed ${tab}: shows more than the object`)
  await ctx.close()
}

// ---- 3. Behaviour: hover 300 ms opens, click opens, Escape / outside click / leaving for 1 s close, and the timings
{
  const { ctx, page } = await open('?demo=soon&tab=home', { width: 900, height: 400 })
  const state = () => page.evaluate(() => document.querySelector('.sh').dataset.open)
  await page.mouse.move(450, 17)
  await wait(150); if ((await state()) !== 'false') note('hover opened before 300 ms')
  await wait(250); if ((await state()) !== 'true') note('hover did not open after 300 ms')
  await wait(700) // settled
  await page.mouse.move(450, 380) // away
  await wait(600); if ((await state()) !== 'true') note('closed before 1 s of leaving')
  await wait(600); if ((await state()) !== 'false') note('did not close after 1 s of leaving')
  await wait(700)
  await page.click('.sh-pill'); await wait(100); if ((await state()) !== 'true') note('click did not open')
  await wait(700)
  await page.keyboard.press('Escape'); await wait(100); if ((await state()) !== 'false') note('Escape did not close')
  await wait(600)
  await page.click('.sh-pill'); await wait(700)
  await page.mouse.click(40, 380); await wait(100); if ((await state()) !== 'false') note('click outside did not close')
  // coming back before 1 s cancels the close
  await wait(600)
  await page.mouse.move(450, 17); await wait(450); await wait(700)
  await page.mouse.move(450, 380); await wait(500); await page.mouse.move(450, 100); await wait(900)
  if ((await state()) !== 'true') note('coming back inside 1 s should keep it open')
  // transition timings and curves as built
  const t = await page.evaluate(() => {
    const sh = document.querySelector('.sh')
    const open = getComputedStyle(sh)
    return { grow: [open.transitionDuration.split(',')[0], open.transitionTimingFunction.split('),')[0] + ')'] }
  })
  console.log('grow', JSON.stringify(t))
  if (t.grow[0] !== '0.52s' || !/cubic-bezier\(0\.34, 1\.45, 0\.5, 1\)/.test(t.grow[1])) note(`grow timing ${JSON.stringify(t.grow)}`)
  await page.keyboard.press('Escape'); await wait(300)
  const sh = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.sh')); return [cs.transitionDuration.split(',')[0], cs.transitionTimingFunction.split('),')[0] + ')', cs.transitionDelay.split(',')[0]] })
  console.log('shrink', JSON.stringify(sh))
  if (sh[0] !== '0.38s' || !/cubic-bezier\(0\.4, 0, 0\.2, 1\)/.test(sh[1])) note(`shrink timing ${JSON.stringify(sh)}`)
  await ctx.close()
}

// ---- 4. Reduced motion: the size jumps and only the content fades
{
  const { ctx, page } = await open('?demo=soon&tab=home', { width: 760, height: 330 }, { reducedMotion: 'reduce' })
  await page.click('.sh-pill'); await wait(60)
  const b = await box(page)
  if (b.w !== 600 || b.h !== 290) note(`reduced motion: size animates ${JSON.stringify(b)}`)
  await ctx.close()
}

// ---- 5. Recording: open and close, a few seconds
{
  const tmp = `${dir}/_rec`
  rmSync(tmp, { recursive: true, force: true })
  const ctx = await browser.newContext({ viewport: { width: 760, height: 330 }, colorScheme: 'dark', recordVideo: { dir: tmp, size: { width: 760, height: 330 } } })
  const page = await ctx.newPage()
  await page.goto(base + '?demo=soon&tab=home')
  await page.waitForSelector('.sh')
  await wait(1200)
  await page.mouse.move(380, 17); await wait(1600) // hover opens
  for (const t of ['Study', 'Pay', 'Sixers', 'Home']) { await page.click(`.sh-tab[aria-label="${t}"]`); await wait(600) }
  await page.keyboard.press('Escape'); await wait(1300) // closes
  await page.click('.sh-pill'); await wait(1400) // click opens
  await page.mouse.click(40, 300); await wait(1400) // outside closes
  await ctx.close()
  const f = readdirSync(tmp).find((n) => n.endsWith('.webm'))
  renameSync(`${tmp}/${f}`, `${dir}/open-close.webm`)
  rmSync(tmp, { recursive: true, force: true })
}

await browser.close()
await server.close()
if (problems.length) { console.error('\nPROBLEMS\n' + problems.join('\n')); process.exit(1) }
console.log('\nok: all checks passed. Screenshots in', dir)
