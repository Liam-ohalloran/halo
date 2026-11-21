import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EAR, MOVE_MARGIN, STACK_GAP, growOnly, layoutFor, px, shellTarget, stackBox } from '../src/lib/desktop-size.ts'

const closed = { w: 200, h: 34, r: 17 }

test('closed island: the window is the island plus the ears, and only the island takes the mouse', () => {
  const { win, regions } = layoutFor({ island: closed, stack: null }, 'notch')
  assert.deepEqual(win, { w: 200 + 2 * EAR, h: 34 })
  assert.equal(regions.length, 1)
  assert.deepEqual(regions[0], { x: EAR, y: 0, w: 200, h: 34, rt: 0, rb: 17 })
})

test('island style has no ears and rounds the top too', () => {
  const { win, regions } = layoutFor({ island: closed, stack: null }, 'island')
  assert.deepEqual(win, { w: 200, h: 34 })
  assert.equal(regions[0].rt, 17)
})

test('open: 600 x 290 from the CSS state, bigger only by the ears', () => {
  const t = shellTarget(true, 200, 34, 17)
  assert.deepEqual(t, { w: 600, h: 290, r: 26 })
  assert.deepEqual(layoutFor({ island: t, stack: null }, 'notch').win, { w: 600 + 2 * EAR, h: 290 })
})

test('collapsed sizes come from the CSS variables', () => {
  assert.deepEqual(shellTarget(false, 400, 40, 20), { w: 400, h: 40, r: 20 })
})

test('while moving the window gets room for the spring, then it can be taken back', () => {
  const exact = layoutFor({ island: closed, stack: null }, 'notch').win
  const moving = layoutFor({ island: closed, stack: null }, 'notch', MOVE_MARGIN).win
  assert.equal(moving.w, exact.w + 2 * MOVE_MARGIN)
  assert.equal(moving.h, exact.h + MOVE_MARGIN)
  assert.deepEqual(growOnly({ w: 700, h: 100 }, { w: 300, h: 300 }), { w: 700, h: 300 })
})

test('the stack of alert pills adds room under the island and a second region', () => {
  assert.equal(stackBox(0, false), null)
  const s = stackBox(3, false)!
  assert.deepEqual(s, { w: 300, h: 40 + 18 + 22 })
  const { win, regions } = layoutFor({ island: closed, stack: s }, 'notch')
  assert.equal(win.h, 34 + STACK_GAP + s.h)
  assert.equal(win.w, 300)
  assert.equal(regions[1].y, 34 + STACK_GAP)
  // The fanned stack is 520 wide and tall enough for a row each plus the hovered card.
  assert.deepEqual(stackBox(6, true), { w: 520, h: 5 * 52 + 84 + 30 })
})

test('the charging pill pushes the stack down', () => {
  const s = stackBox(1, false)!
  const a = layoutFor({ island: closed, stack: s }, 'notch').win.h
  const b = layoutFor({ island: closed, stack: s, charge: true }, 'notch').win.h
  assert.equal(b - a, 42)
})

test('px parses CSS lengths and falls back', () => {
  assert.equal(px('200px', 1), 200)
  assert.equal(px('', 34), 34)
})
