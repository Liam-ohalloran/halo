// Card 24: Music, Sixers, Controls, Audio and Launch at 600 x 290, with the helper on (a pretend one) and off. Every view is
// screenshotted and the controls are pressed: what the page sends to the helper is checked. Saved to screenshots/card-24/.
// Usage: node scripts/shots-card24.mjs
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { defaultState, mockHelper } from './helper-mock.mjs'

const dir = 'screenshots/card-24'
mkdirSync(dir, { recursive: true })
const server = await createServer({ server: { port: 5259, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = 'http://localhost:5259/halo/'

async function open(tab, { up = true, api = 'full', sixers = 'none', state } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${tab}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(`${tab}: ${m.text()}`))
  const h = await mockHelper(page, { up, state })
  await page.goto(`${BASE}?demo=soon&tab=${tab}&open=1&api=${api}&sixers=${sixers}`)
  await page.waitForSelector('.sh[data-open="true"] .sh-body > *')
  await sleep(1500)
  return { page, ctx, ...h }
}
const win = (page, name) => page.locator('.sh-clip').screenshot({ path: `${dir}/${name}.png` })
const posts = (log, path) => log.filter(([p]) => p === path || p.startsWith(path))

// ================= Music
let t = await open('music')
assert.equal(await t.page.locator('.music-pv [data-k="title"]').innerText(), 'MONTAGEM XONADA')
assert.match(await t.page.locator('.music-pv [data-k="state"]').innerText(), /Spotify/i)
assert.ok(await t.page.locator('.music-pv [data-k="art"]').evaluate((e) => e.style.backgroundImage.includes('blob:')), 'the real cover from the helper')
const [a1, a2] = await t.page.locator('.music-pv').evaluate((e) => [e.style.getPropertyValue('--a1'), e.style.getPropertyValue('--a2')])
assert.match(a1, /^#[0-9a-f]{6}$/); assert.notEqual(a1, '#ff2fa3', 'the accent comes from the cover, not the fallback')
await win(t.page, '1-music-playing')
// Play pause: the button flips at once and the helper is told.
await t.page.locator('.music-pv [data-m="play"]').click()
await sleep(300)
assert.ok(posts(t.log, '/media/toggle').length === 1)
assert.equal(await t.page.locator('.music-pv').evaluate((e) => e.classList.contains('paused')), true)
await win(t.page, '2-music-paused')
await t.page.locator('.music-pv [data-m="next"]').click(); await sleep(100)
assert.equal(posts(t.log, '/media/next').length, 1)
// Seeking: click the wave.
const wv = await t.page.locator('.music-pv [data-k="seek"]').boundingBox()
await t.page.mouse.click(wv.x + wv.width * 0.75, wv.y + wv.height / 2)
await sleep(100)
const seek = posts(t.log, '/media/seek').at(-1)
assert.ok(seek && Math.abs(seek[1].seconds - 140) <= 2, `seeking to 75 percent asks for about 140 seconds, got ${seek?.[1].seconds}`)
// Volume.
await t.page.locator('.music-pv [data-k="vol"]').fill('70'); await sleep(150)
assert.equal(posts(t.log, '/volume').at(-1)[1].level, 70)
await t.ctx.close()

t = await open('music', { state: { ...defaultState(), media: { available: false, title: '', artist: '', album: '', source: '', playing: false, position: 0, duration: 0, has_art: false } } })
assert.match(await t.page.locator('.music-pv .muState').innerText(), /Nothing playing/)
await win(t.page, '3-music-nothing-playing')
await t.ctx.close()
t = await open('music', { up: false })
assert.match(await t.page.locator('.music-pv .muState').innerText(), /Open Halo on your laptop/)
assert.ok(await t.page.locator('.music-pv [data-k="retry"]').isVisible(), 'a retry button')
await win(t.page, '4-music-helper-off')
await t.ctx.close()

// ================= Controls
t = await open('controls')
assert.equal(await t.page.locator('.controls-pv [data-s="vol"]').getAttribute('aria-valuenow'), '42')
assert.equal(await t.page.locator('.controls-pv [data-s="bri"]').getAttribute('aria-valuenow'), '68')
assert.equal(await t.page.locator('.controls-pv [data-k="wifiS"]').innerText(), 'Newman-Home')
assert.equal(await t.page.locator('.controls-pv [data-k="batV"]').innerText(), '74%')
assert.equal(await t.page.locator('.controls-pv [data-k="focusS"]').innerText(), 'Not available yet')
assert.match(await t.page.locator('.controls-pv [data-k="outN"]').innerText(), /Speakers/)
await win(t.page, '5-controls-on')
// Drag the brightness slider to the top third, tap Wi-Fi off, pick Best power.
const sl = await t.page.locator('.controls-pv [data-s="bri"]').boundingBox()
await t.page.mouse.move(sl.x + sl.width / 2, sl.y + sl.height * 0.8); await t.page.mouse.down()
await t.page.mouse.move(sl.x + sl.width / 2, sl.y + sl.height * 0.3, { steps: 6 }); await t.page.mouse.up(); await sleep(250)
const bri = posts(t.log, '/brightness').at(-1)[1].level
assert.ok(bri > 60 && bri < 80, `dragging up sets brightness (${bri})`)
await t.page.locator('.controls-pv [data-t="wifi"]').click(); await sleep(250)
assert.deepEqual(posts(t.log, '/wifi').at(-1)[1], { enabled: false })
await t.page.locator('.controls-pv [data-p="performance"]').click(); await sleep(250)
assert.deepEqual(posts(t.log, '/power-mode').at(-1)[1], { mode: 'performance' })
await t.page.locator('.controls-pv [data-t="mute"]').click(); await sleep(250)
assert.ok(posts(t.log, '/mute').length === 1)
// Focus and Night light are not changeable.
await t.page.locator('.controls-pv [data-t="focus"]').click({ force: true }); await sleep(100)
assert.equal(posts(t.log, '/focus').length, 0)
await win(t.page, '6-controls-changed')
await t.ctx.close()
t = await open('controls', { up: false })
assert.ok(await t.page.locator('.controls-pv.is-off').count(), 'dimmed with the helper off')
assert.ok(await t.page.locator('.controls-pv [data-k="off"]').isVisible())
await win(t.page, '7-controls-helper-off')
await t.ctx.close()

// ================= Audio
t = await open('audio')
assert.equal(await t.page.locator('.audio-pv [data-k="vn"]').innerText(), '42%')
assert.equal(await t.page.locator('.audio-pv .auA').count(), 4)
assert.ok(await t.page.locator('.audio-pv .auLv i.on').count() > 0, 'the mic meter is lit')
assert.equal(await t.page.locator('.audio-pv .auO').count(), 3)
await win(t.page, '8-audio-on')
await t.page.locator('.audio-pv [data-k="mute"]').click(); await sleep(250)
assert.ok(posts(t.log, '/mute').length === 1)
assert.ok(await t.page.locator('.audio-pv .auG.muted').count())
await win(t.page, '9-audio-muted')
await t.page.locator('.audio-pv [data-k="mute"]').click(); await sleep(250)
await t.page.locator('.audio-pv [data-k="micB"]').click(); await sleep(250)
assert.ok(posts(t.log, '/mic/mute').length === 1)
assert.equal((await t.page.locator('.audio-pv [data-k="micT"]').innerText()).toLowerCase(), 'mic · muted')
await win(t.page, '10-audio-mic-muted')
// A mixer slider: drag Chrome to the bottom quarter.
const vt = await t.page.locator('.audio-pv .auA[data-a="chrome"] .vt').boundingBox()
await t.page.mouse.move(vt.x + vt.width / 2, vt.y + vt.height * 0.2); await t.page.mouse.down()
await t.page.mouse.move(vt.x + vt.width / 2, vt.y + vt.height * 0.75, { steps: 6 }); await t.page.mouse.up(); await sleep(250)
const ch = posts(t.log, '/apps/volume/chrome').at(-1)
assert.ok(ch && ch[1].level > 15 && ch[1].level < 35, `dragging down lowers Chrome (${ch?.[1].level})`)
// Master slider.
const ms = await t.page.locator('.audio-pv [data-k="sl"]').boundingBox()
await t.page.mouse.click(ms.x + ms.width * 0.9, ms.y + ms.height / 2); await sleep(250)
assert.ok(posts(t.log, '/volume').at(-1)[1].level >= 85)
// Switching the output: tap the headphones, the helper is told, and the list moves them to the top.
await t.page.locator('.audio-pv .auO[data-o="o2"]').click(); await sleep(400)
assert.deepEqual(posts(t.log, '/outputs/default').at(-1)[1], { id: 'o2' })
assert.match(await t.page.locator('.audio-pv .auO.on b').innerText(), /WH-CH720N/)
assert.match(await t.page.locator('.audio-pv [data-k="vs"]').innerText(), /WH-CH720N/)
await win(t.page, '10b-audio-output-switched')
// Things Windows cannot do say so.
assert.ok(await t.page.locator('.audio-pv .auEq button:disabled').count() === 4)
await t.ctx.close()
t = await open('audio', { up: false })
assert.ok(await t.page.locator('.audio-pv [data-k="off"]').isVisible())
await win(t.page, '11-audio-helper-off')
await t.ctx.close()

// A switch Windows refuses: the old output stays and the page says so.
{
  const st = defaultState(); st.switchFails = true
  t = await open('audio', { state: st })
  await t.page.locator('.audio-pv .auO[data-o="o3"]').click(); await sleep(500)
  assert.match(await t.page.locator('.audio-pv .auO.on b').innerText(), /Speakers/, 'the old output is still in use')
  assert.match(await t.page.locator('.audio-pv .pv-tip').innerText(), /Switch in Windows/)
  await win(t.page, '11b-audio-switch-refused')
  await t.ctx.close()
}

// ================= Launch
t = await open('launch')
await t.page.waitForSelector('.launch-pv .app[data-id]')
assert.equal(await t.page.locator('.launch-pv .app[data-id]').count(), 12)
assert.equal(await t.page.locator('.launch-pv .site').count(), 5)
assert.deepEqual(await t.page.locator('.launch-pv .grp').allInnerTexts(), ['SCHOOL', 'WORK', 'BUILD'], 'sites grouped School, Work, Build')
assert.ok(await t.page.locator('.launch-pv .app .ico img').count() >= 10, 'real icons from the helper')
assert.ok(await t.page.locator('.launch-pv .site .fav img').count() === 5, 'sites use their favicon')
await win(t.page, '12-launch')
await t.page.locator('.launch-pv .app[data-id="la0"]').click(); await sleep(150)
assert.deepEqual(posts(t.log, '/launch/app').at(-1)[1], { id: 'Spotify.lnk' }, 'an app is opened through the helper')
// Search with "/".
await t.page.locator('.sh-body').click({ position: { x: 5, y: 5 } })
await t.page.keyboard.press('/')
assert.equal(await t.page.evaluate(() => document.activeElement?.getAttribute('data-k')), 'q', '/ focuses the search')
await t.page.keyboard.type('chr'); await sleep(100)
assert.equal(await t.page.locator('.launch-pv .app[data-id]').count(), 1)
await win(t.page, '13-launch-search')
await t.page.locator('.launch-pv [data-k="q"]').fill(''); await sleep(100)
// Edit mode: remove one, drag one.
await t.page.locator('.launch-pv [data-k="edit"]').click(); await sleep(150)
await win(t.page, '14-launch-edit')
const first = await t.page.locator('.launch-pv .app[data-id="la0"]').boundingBox()
const third = await t.page.locator('.launch-pv .app[data-id="la3"]').boundingBox()
await t.page.mouse.move(first.x + first.width / 2, first.y + 20); await t.page.mouse.down()
await t.page.mouse.move(first.x + 20, first.y + 20, { steps: 3 })
await t.page.mouse.move(third.x + third.width / 2, third.y + 20, { steps: 8 }); await t.page.mouse.up(); await sleep(300)
const ids = await t.page.locator('.launch-pv .app[data-id]').evaluateAll((els) => els.map((e) => e.dataset.id))
assert.equal(ids[3], 'la0', `dragging Spotify to the fourth place reorders (${ids.slice(0, 5)})`)
await t.page.locator('.launch-pv .app[data-id="la11"]').click(); await sleep(250)
assert.equal(await t.page.locator('.launch-pv .app[data-id]').count(), 11, 'Edit then tap removes')
await t.page.locator('.launch-pv [data-k="edit"]').click()
// Add sheet: a website, then an app from the helper's list.
await t.page.locator('.launch-pv [data-add-open]').click(); await sleep(300)
await t.page.waitForSelector('.launch-pv .pkItem')
await win(t.page, '15-launch-add-app')
await t.page.locator('.launch-pv [data-add="site"]').click()
await t.page.locator('.launch-pv input[name="name"]').fill('Notion')
await t.page.locator('.launch-pv input[name="url"]').fill('nope')
await t.page.locator('.launch-pv .pkGo').click()
assert.match(await t.page.locator('.launch-pv [data-k="pkErr"]').innerText(), /web address/)
await win(t.page, '16-launch-add-site-error')
await t.page.locator('.launch-pv input[name="url"]').fill('notion.so')
await t.page.locator('.launch-pv input[name="grp"]').fill('Work')
await t.page.locator('.launch-pv .pkGo').click(); await sleep(400)
assert.ok((await t.page.locator('.launch-pv .site b').allInnerTexts()).includes('Notion'))
await t.page.locator('.launch-pv [data-add-open]').click(); await sleep(250)
await t.page.locator('.launch-pv .pkItem[data-name="Notepad"]').click(); await sleep(400)
assert.ok((await t.page.locator('.launch-pv .app .nm').allInnerTexts()).includes('Notepad'))
assert.equal(await t.page.locator('.launch-pv .app[data-ic="Notepad.lnk"] img').count(), 0, 'an app with no icon keeps its letter tile')
assert.ok(await t.page.locator('.launch-pv .app[data-ic="Notepad.lnk"] .ico b').count())
await win(t.page, '17-launch-added')
await t.ctx.close()
t = await open('launch', { up: false, api: 'fullempty' })
await sleep(500)
await win(t.page, '18-launch-empty-helper-off')
await t.page.locator('.launch-pv [data-add-open]').click(); await sleep(300)
assert.match(await t.page.locator('.launch-pv .pkNote').innerText(), /Open Halo on your laptop/)
await t.ctx.close()

// ================= Sixers
for (const [key, name] of [['live', '19-sixers-live'], ['final-win', '23-sixers-final'], ['next', '24-sixers-next'], ['none', '25-sixers-none']]) {
  t = await open('sixers', { sixers: key })
  await sleep(300)
  if (key === 'live') {
    assert.match(await t.page.locator('.sixers-pv [data-k="score"]').innerText(), /Q\d/)
    assert.equal(await t.page.locator('.sixers-pv .sxTbl tbody tr').count(), 5)
    await win(t.page, name)
    // Sort by rebounds, then again for the other way.
    await t.page.locator('.sixers-pv [data-sort="reb"]').click()
    assert.equal(await t.page.locator('.sixers-pv .sxTbl tbody tr:first-child td.nm').innerText(), 'J. Embiid')
    await win(t.page, '20-sixers-box-sorted')
    await t.page.locator('.sixers-pv [data-sort="reb"]').click()
    assert.equal(await t.page.locator('.sixers-pv .sxTbl tbody tr:first-child td.nm').innerText(), 'Q. Grimes', 'pressing the same heading again flips the order')
    await t.page.locator('.sixers-pv [data-team="1"]').click()
    assert.match(await t.page.locator('.sixers-pv .sxTbl tbody tr:first-child td.nm').innerText(), /Hale/)
    await t.page.locator('.sixers-pv [data-team="0"]').click()
    await t.page.locator('.sixers-pv tr[data-p="1"]').click()
    assert.match(await t.page.locator('.sixers-pv .sxPc h3').innerText(), /Maxey/)
    await win(t.page, '21-sixers-player-card')
    await t.page.locator('.sixers-pv [data-back]').click()
    await t.page.locator('.sixers-pv [data-v="lead"]').click()
    assert.equal(await t.page.locator('.sixers-pv .sxLd').count(), 6)
    await win(t.page, '22-sixers-leaders')
    await t.page.locator('.sixers-pv [data-v="cmp"]').click()
    assert.equal(await t.page.locator('.sixers-pv .sxCmp').count(), 6)
    await win(t.page, '22b-sixers-team')
    await t.page.locator('.sixers-pv [data-v="form"]').click()
    assert.equal(await t.page.locator('.sixers-pv .sxFg').count(), 5)
    await win(t.page, '22c-sixers-form')
  } else await win(t.page, name)
  await t.ctx.close()
}

assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`)
await browser.close()
await server.close()
console.log('Card 24: all checks passed. Screenshots in', dir)
