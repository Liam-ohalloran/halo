import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EAR, GLOW, ISLAND_GAP, STACK_GAP, CHARGE_DROP, regionsFor, windowSize, px, shellTarget, stackBox } from '../src/lib/desktop-size.ts'
import { readFileSync } from 'node:fs'

const closed = { w: 200, h: 34, r: 17 }

test('the window is one fixed size: the open island, the ears and the glow margin all round', () => {
  const w = windowSize()
  assert.ok(w.w >= 600 + 2 * EAR + 2 * GLOW)
  assert.ok(w.h >= ISLAND_GAP + 290 + GLOW)
  assert.deepEqual(windowSize(), windowSize())
  assert.equal(GLOW, 24)
})

test('the window also holds the fanned stack of alert pills (6) under the tallest closed island', () => {
  const s = stackBox(6, true)!
  const w = windowSize()
  assert.ok(w.w >= s.w + 2 * GLOW)
  assert.ok(w.h >= ISLAND_GAP + 46 + STACK_GAP + CHARGE_DROP + s.h + GLOW)
})

test('closed island: one region, centred in the big window, top squared in Notch style', () => {
  const win = windowSize()
  const [r] = regionsFor({ island: closed, stack: null }, 'notch')
  assert.deepEqual(r, { x: (win.w - 200) / 2, y: 0, w: 200, h: 34, rt: 0, rb: 17 })
})

test('island style floats 8 px down, has no ears and rounds the top too', () => {
  const win = windowSize()
  const regions = regionsFor({ island: closed, stack: null }, 'island')
  assert.equal(ISLAND_GAP, 8)
  assert.deepEqual(regions[0], { x: (win.w - 200) / 2, y: 8, w: 200, h: 34, rt: 17, rb: 17 })
  assert.equal(regions.length, 1)
})

test('open: 600 x 290 from the CSS state, caught in the middle of the same window', () => {
  const t = shellTarget(true, 200, 34, 17)
  assert.deepEqual(t, { w: 600, h: 290, r: 26 })
  const win = windowSize()
  assert.deepEqual(regionsFor({ island: t, stack: null }, 'notch')[0], { x: (win.w - 600) / 2, y: 0, w: 600, h: 290, rt: 0, rb: 26 })
})

test('collapsed sizes come from the CSS variables', () => {
  assert.deepEqual(shellTarget(false, 400, 40, 20), { w: 400, h: 40, r: 20 })
})

test('the stack of alert pills adds a second region under the island, and the charging pill pushes it down', () => {
  assert.equal(stackBox(0, false), null)
  const s = stackBox(3, false)!
  assert.deepEqual(s, { w: 300, h: 40 + 18 + 22 })
  assert.deepEqual(stackBox(6, true), { w: 520, h: 5 * 52 + 84 + 30 })
  const a = regionsFor({ island: closed, stack: s }, 'notch')[1]
  const b = regionsFor({ island: closed, stack: s, charge: true }, 'notch')[1]
  assert.equal(a.y, 34 + STACK_GAP)
  assert.equal(b.y - a.y, CHARGE_DROP)
})

test('px parses CSS lengths and falls back', () => {
  assert.equal(px('200px', 1), 200)
  assert.equal(px('', 34), 34)
})

test('the page never resizes the window after startup: no grow, shrink or settle logic is left', () => {
  const src = readFileSync(new URL('../src/lib/desktop.ts', import.meta.url), 'utf8')
  assert.equal((src.match(/'set_island'/g) ?? []).length, 2) // the window at startup, and the sign-in card
  assert.doesNotMatch(src, /setTimeout|growOnly|SETTLE|MOVE_MARGIN/)
})
