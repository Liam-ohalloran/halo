import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HUD_LOOK, LOOK, PRIORITY, fmtToFull, gameStatus, leaveChip, mmss, pickDisplay, pickLive, pillTime, type LiveFlags, type LiveKind } from '../src/lib/island-live.ts'

const MIN = 60_000

test('priority order is leave, game, timer, shift, music, charge, unread, idle', () => {
  assert.deepEqual([...PRIORITY], ['leave', 'game', 'timer', 'shift', 'music', 'charge', 'unread', 'idle'])
})

test('with everything on, leave wins, and each one wins once the ones above it are off', () => {
  const f: LiveFlags = { leave: true, game: true, timer: true, shift: true, music: true, charge: true, unread: 4 }
  const order: LiveKind[] = []
  for (const k of ['leave', 'game', 'timer', 'shift', 'music', 'charge'] as const) {
    order.push(pickLive(f))
    f[k] = false
  }
  order.push(pickLive(f)) // only unread left
  f.unread = 0
  order.push(pickLive(f))
  assert.deepEqual(order, ['leave', 'game', 'timer', 'shift', 'music', 'charge', 'unread', 'idle'])
})

test('every pair: the higher priority always wins', () => {
  const keys = ['leave', 'game', 'timer', 'shift', 'music', 'charge'] as const
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      assert.equal(pickLive({ [keys[i]]: true, [keys[j]]: true }), keys[i], `${keys[i]} beats ${keys[j]}`)
    }
  }
})

test('unread only shows when nothing is live, and zero unread is plain idle', () => {
  assert.equal(pickLive({}), 'idle')
  assert.equal(pickLive({ unread: 0 }), 'idle')
  assert.equal(pickLive({ unread: 2 }), 'unread')
  assert.equal(pickLive({ unread: 2, music: true }), 'music')
})

test('sizes match the prototype', () => {
  const size = (k: LiveKind) => `${LOOK[k].w}x${LOOK[k].h}`
  assert.equal(size('idle'), '200x34')
  assert.equal(size('unread'), '200x34')
  assert.equal(size('leave'), '400x46')
  assert.equal(size('game'), '400x40')
  assert.equal(size('timer'), '380x64')
  assert.equal(size('shift'), '380x64')
  assert.equal(size('music'), '300x38')
  assert.equal(size('charge'), '220x34')
  assert.equal(LOOK.timer.ring && LOOK.shift.ring, true)
  assert.equal(LOOK.music.ring || LOOK.game.ring || LOOK.leave.ring, false)
  assert.deepEqual([HUD_LOOK.narrow.w, HUD_LOOK.wide.w, HUD_LOOK.narrow.h], [310, 360, 44])
})

test('a HUD pill sits above every state except leave now', () => {
  for (const k of PRIORITY) assert.equal(pickDisplay(k, true), k === 'leave' ? 'leave' : 'hud', k)
  for (const k of PRIORITY) assert.equal(pickDisplay(k, false), k)
})

test('leave now shows from 10 minutes before leave-by until the shift starts', () => {
  const start = 1_000 * MIN
  const leaveBy = start - 25 * MIN
  assert.equal(leaveChip(leaveBy, start, leaveBy - 11 * MIN), null)
  assert.equal(leaveChip(leaveBy, start, leaveBy - 10 * MIN), '10 min')
  assert.equal(leaveChip(leaveBy, start, leaveBy - 3.5 * MIN), '4 min')
  assert.equal(leaveChip(leaveBy, start, leaveBy), 'Now')
  assert.equal(leaveChip(leaveBy, start, leaveBy + 5 * MIN), 'Now')
  assert.equal(leaveChip(leaveBy, start, start), null)
})

test('copy helpers', () => {
  assert.equal(pillTime('5:30 pm'), '5:30')
  assert.equal(pillTime('12:05 am'), '12:05')
  assert.equal(fmtToFull(65), '~1h 05m')
  assert.equal(fmtToFull(25), '~25m')
  assert.equal(fmtToFull(null), null)
  assert.equal(fmtToFull(-1), null)
  assert.equal(gameStatus('Q3 5:21'), 'Q3 · 5:21')
  assert.equal(gameStatus('2OT 1:10'), '2OT · 1:10')
  assert.equal(gameStatus('Halftime'), 'Halftime')
  assert.equal(mmss(24 * 60_000 + 12_000), '24:12')
  assert.equal(mmss(0), '0:00')
  assert.equal(mmss(61_000), '1:01')
})
