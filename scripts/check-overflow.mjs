// Card 16: the overflow check. Opens every tab at 600 x 290 and fails if any text is truncated, clipped by its card or
// overlapping other text. Run it on every tab before opening a PR.
//
//   node scripts/check-overflow.mjs                 Home, Pay and Study, filled and empty
//   node scripts/check-overflow.mjs home,pay        only those tabs
//   node scripts/check-overflow.mjs --all           every tab in the rail
//
// The rules, for every visible element with its own text:
//   truncated  scrollWidth > clientWidth (or the height) while overflow is not visible
//   clipped    its text box sticks out of the nearest ancestor with overflow hidden, clip, auto or scroll
//   overlap    its text box intersects another text box that is not its parent or child
// Skipped: panels meant to sit on top while they are closed (player card, add sheet: anything hidden, inert or faded to 0),
// and a title that scrolls (data-marquee) or ends in an ellipsis (data-ellipsis) on purpose.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { mockHelper } from './helper-mock.mjs'

export const ALL_TABS = ['home', 'music', 'study', 'pay', 'sixers', 'week', 'alerts', 'money', 'marks', 'claude', 'night', 'shelf', 'widgets', 'more', 'controls', 'audio', 'launch']
export const DEFAULT_TABS = ['home', 'pay', 'study', 'week', 'alerts', 'money', 'marks', 'claude', 'night', 'shelf', 'widgets', 'more', 'music', 'controls', 'audio', 'launch']
/** The Week tab has its own fixtures: a normal week, and a busy one with clashes and a crowded EARLY row. */
export const API_FOR = (tab, state) => (['money', 'marks', 'claude', 'night', 'shelf', 'widgets'].includes(tab) ? (state === 'busy' ? `${tab}many` : state === 'empty' ? `${tab}empty` : tab) : tab === 'week' && state !== 'empty' ? (state === 'busy' ? 'weekbusy' : 'week') : tab === 'alerts' ? (state === 'busy' ? 'alertsmany' : state === 'empty' ? 'alertsempty' : 'alerts') : state)

/** Runs inside the page. Returns a list of problems. */
export function auditInPage(rootSelector = '.sh-body') {
  const root = document.querySelector(rootSelector)
  const problems = []
  if (!root) return [`no ${rootSelector}: the window is not open`]
  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`
  }
  const shown = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || n.hasAttribute('inert') || n.hasAttribute('data-audit-skip')) return false
    }
    return true
  }
  // A title that ends in an ellipsis on purpose (a song title in a small widget) is skipped: data-ellipsis.
  const marquee = (el) => !!el.closest('[data-marquee], [data-ellipsis]')
  const ownTextRect = (el) => {
    const r = document.createRange()
    let any = false
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { r.selectNodeContents(n); any = true }
    if (!any) return null
    // Select just the text nodes, not the whole element, so a child's box is not counted.
    const rects = []
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rr = document.createRange(); rr.selectNodeContents(n); rects.push(...rr.getClientRects()) }
    if (!rects.length) return null
    const l = Math.min(...rects.map((x) => x.left)), t = Math.min(...rects.map((x) => x.top))
    const rt = Math.max(...rects.map((x) => x.right)), b = Math.max(...rects.map((x) => x.bottom))
    return { left: l, top: t, right: rt, bottom: b, width: rt - l, height: b - t }
  }
  const clipper = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX) || ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowY)) return n
      if (n === document.body) break
    }
    return null
  }
  const items = []
  for (const el of root.querySelectorAll('*')) {
    if (!shown(el)) continue
    const rect = ownTextRect(el)
    if (!rect || rect.width < 1) continue
    // truncated: only for boxes that lay out their own width (not inline)
    const cs = getComputedStyle(el)
    if (!marquee(el) && cs.display !== 'inline') {
      const hidden = (v) => v !== 'visible'
      if (hidden(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) problems.push(`truncated: ${label(el)} is ${el.scrollWidth}px of text in ${el.clientWidth}px`)
      else if (hidden(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) problems.push(`truncated (height): ${label(el)} is ${el.scrollHeight}px in ${el.clientHeight}px`)
    }
    // clipped by the nearest overflow ancestor
    const c = marquee(el) ? null : clipper(el)
    if (c) {
      const b = c.getBoundingClientRect()
      const out = Math.max(b.left - rect.left, rect.right - b.right, b.top - rect.top, rect.bottom - b.bottom)
      if (out > 1) problems.push(`clipped: ${label(el)} sticks out ${out.toFixed(1)}px past ${label(c)}`)
    }
    if (marquee(el)) { const eb = el.getBoundingClientRect(); rect.left = Math.max(rect.left, eb.left); rect.right = Math.min(rect.right, eb.right); rect.top = Math.max(rect.top, eb.top); rect.bottom = Math.min(rect.bottom, eb.bottom) }
    items.push({ el, rect })
  }
  // overlap: shrink each box a touch so neighbouring lines of text, which share a few px of line height, do not count
  const inset = (r) => ({ left: r.left + 1, right: r.right - 1, top: r.top + Math.min(2.5, r.height * 0.2), bottom: r.bottom - Math.min(2.5, r.height * 0.2) })
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]
      if (a.el.contains(b.el) || b.el.contains(a.el) || (marquee(a.el) && marquee(b.el))) continue
      const A = inset(a.rect), B = inset(b.rect)
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left)
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top)
      if (ox > 1 && oy > 1) problems.push(`overlap: ${label(a.el)} and ${label(b.el)}`)
    }
  }
  return problems
}

/** Nothing in Settings scrolls: the section must fit its box. Runs inside the page. */
export function settingsFit() {
  const out = []
  const m = document.querySelector('.st-main')
  const s = document.querySelector('.st-sec:not([hidden])')
  if (m && m.scrollHeight - m.clientHeight > 1) out.push(`scrolls: the section is ${m.scrollHeight}px in a ${m.clientHeight}px box`)
  if (s && s.scrollHeight - s.clientHeight > 1) out.push(`scrolls: ${s.dataset.sec} is ${s.scrollHeight}px in ${s.clientHeight}px`)
  for (const el of document.querySelectorAll('.st-sec:not([hidden]) *')) {
    const b = el.getBoundingClientRect(), r = m.getBoundingClientRect()
    if (b.width && (b.bottom > r.bottom + 1 || b.right > r.right + 1)) { out.push(`sticks out of the section: ${el.className} "${(el.textContent || '').trim().slice(0, 24)}"`); break }
  }
  return out
}

export async function checkTab(browser, base, tab, state) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 400 }, colorScheme: 'dark', reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Card 24: the helper tabs are checked with a pretend helper on (full) and with it off (empty).
  await mockHelper(page, { up: state !== 'empty' })
  await page.goto(`${base}?demo=soon&tab=${tab}&open=1&home=${state}&api=${tab === 'launch' && state === 'empty' ? 'fullempty' : API_FOR(tab, state)}&sixers=${state === 'empty' ? 'none' : state === 'busy' ? 'live' : 'final-win'}${tab === 'more' ? '&account=1' : ''}`)
  await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
  await page.waitForTimeout(1600)
  const problems = await page.evaluate(auditInPage)
  // Card 27: Settings shows one section at a time, so every section is checked. So is the "•••" grid under the top bar.
  if (tab === 'more') {
    for (const sec of await page.locator('.st-nb').evaluateAll((bs) => bs.map((b) => b.dataset.sec))) {
      await page.locator(`.st-nb[data-sec="${sec}"]`).click()
      await page.waitForTimeout(150)
      problems.push(...(await page.evaluate(auditInPage, '.st-main')).map((p) => `[${sec}] ${p}`))
      problems.push(...(await page.evaluate(settingsFit)).map((p) => `[${sec}] ${p}`))
    }
    // The Laptop section only exists inside the desktop app (?desktop=1).
    const dp = await ctx.newPage()
    await dp.goto(`${base}?demo=soon&tab=more&open=1&desktop=1&api=more&account=1`)
    await dp.waitForSelector('.sh[data-open="true"] .st')
    await dp.locator('.st-nb[data-sec="laptop"]').click()
    await dp.waitForTimeout(300)
    problems.push(...(await dp.evaluate(auditInPage, '.st-main')).map((p) => `[laptop] ${p}`))
    problems.push(...(await dp.evaluate(settingsFit)).map((p) => `[laptop] ${p}`))
  }
  if (tab === 'home') {
    await page.locator('.sh-more-btn').click()
    await page.waitForTimeout(350)
    problems.push(...(await page.evaluate(auditInPage, '.sh-more')).map((p) => `[more grid] ${p}`))
  }
  await ctx.close()
  return [...errors.map((e) => `page error: ${e}`), ...problems]
}

async function main() {
  const args = process.argv.slice(2)
  const tabs = args.includes('--all') ? ALL_TABS : (args.find((a) => !a.startsWith('--'))?.split(',') ?? DEFAULT_TABS)
  const PORT = Number(process.env.OVERFLOW_PORT) || 5251
  const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
  await server.listen()
  const browser = await chromium.launch()
  // A cold dev server optimises its dependencies on the first page load, which can take over a minute on a slow disk.
  // Do that once here with a long timeout so the first real check does not hit the 30 second default.
  const warm = await browser.newPage()
  await warm.goto(`http://localhost:${PORT}/halo/?demo=soon&tab=home&open=1`, { timeout: 240000 })
  await warm.waitForSelector('.sh[data-open="true"] .sh-body > *', { timeout: 120000 })
  await warm.close()
  let failed = 0
  for (const tab of tabs) {
    for (const state of tab === 'sixers' ? ['full', 'busy', 'empty'] : tab === 'week' || ['alerts', 'money', 'marks', 'claude', 'night', 'shelf', 'widgets'].includes(tab) ? ['full', 'busy', 'empty'] : ['full', 'empty']) {
      const problems = await checkTab(browser, `http://localhost:${PORT}/halo/`, tab, state)
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${tab} (${state})`)
      for (const p of problems) console.log(`       ${p}`)
      failed += problems.length
    }
  }
  await browser.close()
  await server.close()
  if (failed) { console.log(`\n${failed} problem${failed === 1 ? '' : 's'}`); process.exit(1) }
  console.log('\nNo text is truncated, clipped or overlapping.')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
