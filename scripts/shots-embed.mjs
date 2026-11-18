// Embedded mode screenshots (Halo inside NotchPixel's web tab, ?embed=1) at 684x453 and 600x300.
// Also checks that nothing is clipped or covered. Usage: node scripts/shots-embed.mjs   (saves to screenshots/embed/)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const dir = 'screenshots/embed'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5233, strictPort: true }, logLevel: 'error' })
await server.listen()
const sizes = { '684x453': [684, 453], '600x300': [600, 300] }
const shots = [
  ['now', 'soon', 'now', null], ['study', 'soon', 'study', null], ['pay', 'soon', 'pay', null],
  ['sixers-live', 'soon', 'sixers', 'live'], ['sixers-next', 'soon', 'sixers', 'next'], ['now-empty', 'empty', 'now', null], ['pay-empty', 'empty', 'pay', null],
]
const browser = await chromium.launch()
const problems = []
const report = []
for (const [size, [width, height]] of Object.entries(sizes)) {
  for (const [name, mode, tab, sx] of shots) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => problems.push(`${name} ${size}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fetch/i.test(m.text()) && problems.push(`${name} ${size}: ${m.text()}`))
    await page.goto(`http://localhost:5233/halo/?embed=1&demo=${mode}&tab=${tab}${sx ? `&sixers=${sx}` : ''}`)
    await page.waitForTimeout(2200)
    const r = await page.evaluate(() => {
      const root = document.querySelector('.embed-root')
      const host = document.querySelector('.h-panelhost')
      const panel = host?.querySelector('.h-panel')
      const out = { embed: !!root, shell: !!document.querySelector('.h-island, .h-spill, .h-isl-svg'), bg: getComputedStyle(document.body).backgroundColor, fit: panel?.dataset.fit, host: host && [host.clientWidth, host.clientHeight], panelH: panel?.offsetHeight, scroll: host?.classList.contains('is-scroll'), docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], clipped: [], bar: null }
      const hr = host?.getBoundingClientRect()
      if (hr && panel) {
        // Anything inside the panel that pokes past the host edge is clipped.
        for (const el of panel.querySelectorAll('*')) {
          const b = el.getBoundingClientRect()
          if (!b.width || !b.height) continue
          if (b.right > hr.right + 1 || b.left < hr.left - 1 || b.bottom > hr.bottom + 1 || b.top < hr.top - 1) out.clipped.push(`${el.className || el.tagName}`.toString().slice(0, 40))
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && el.clientWidth) out.clipped.push('h-overflow ' + `${el.className}`.slice(0, 30))
        }
      }
      return out
    })
    report.push(`${size} ${name}: fit=${r.fit} host=${r.host} panel=${r.panelH} scroll=${r.scroll} doc=${r.docScroll} bg=${r.bg} island=${r.shell} clipped=${r.clipped.length ? [...new Set(r.clipped)].slice(0, 6).join('|') : 'none'}`)
    await page.screenshot({ path: `${dir}/${name}-${size}.png` })
    await ctx.close()
  }
  // Settings popover, top padding 24, and the signed-out screen.
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  await page.goto(`http://localhost:5233/halo/?embed=1&demo=soon&tab=pay&top=24`)
  await page.waitForTimeout(1500)
  await page.click('[data-settings]')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/settings-top24-${size}.png` })
  await ctx.close()
  const c2 = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const p2 = await c2.newPage()
  await p2.goto(`http://localhost:5233/halo/?embed=1`)
  await p2.waitForTimeout(1500)
  await p2.screenshot({ path: `${dir}/signin-${size}.png` })
  await c2.close()
}
await browser.close()
await server.close()
console.log(report.join('\n'))
console.log(problems.length ? 'ERRORS:\n' + problems.join('\n') : 'no console errors')
