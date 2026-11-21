import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BANNER, CLOSE_MS, HOLD_MS, OPEN_MS, STACK_MAX, addToStack, bannerAction, bannerModel, createBannerQueue, fanOffsets, holdLeft, newRows, pruneStack } from '../src/lib/banner.ts'
import { pickDisplay } from '../src/lib/island-live.ts'
import type { AlertRow } from '../src/types.ts'

const NOW = new Date('2026-11-21T07:48:00Z')
const row = (id: string, type = 'task_done', minsAgo = 0, extra: Partial<AlertRow> = {}): AlertRow => ({
  id, type, title: id, body: '', action_label: null, action_url: null,
  created_at: new Date(NOW.getTime() - minsAgo * 60_000).toISOString(), read_at: null, ...extra,
})

test('timings and size match the card', () => {
  assert.deepEqual({ w: BANNER.w, h: BANNER.h }, { w: 520, h: 84 })
  assert.equal(OPEN_MS, 520); assert.equal(HOLD_MS, 4000); assert.equal(CLOSE_MS, 380)
})

test('action: link needs a label and a web address, leave reminder snoozes, nothing else', () => {
  assert.deepEqual(bannerAction(row('a', 'new_mark', 0, { action_label: 'Open', action_url: 'https://x.test/a' })), { kind: 'link', label: 'Open', url: 'https://x.test/a' })
  assert.equal(bannerAction(row('a', 'new_mark', 0, { action_label: 'Open', action_url: 'javascript:alert(1)' })), null)
  assert.equal(bannerAction(row('a', 'new_mark', 0, { action_label: 'Open' })), null)
  assert.deepEqual(bannerAction(row('a', 'leave_reminder')), { kind: 'snooze', label: 'Snooze' })
  assert.equal(bannerAction(row('a', 'task_done')), null)
})

test('model carries the type colour and the age', () => {
  const m = bannerModel(row('a', 'battery_low', 4), NOW)
  assert.equal(m.colour, '#FF453A'); assert.equal(m.time, '4m')
})

test('first look only learns, later looks return new rows oldest first', () => {
  const seen = new Set<string>()
  assert.deepEqual(newRows(seen, [row('a'), row('b')], false), [])
  assert.deepEqual(newRows(seen, [row('a'), row('b')], true), [])
  assert.deepEqual(newRows(seen, [row('c', 'x', 1), row('a'), row('d', 'x', 5)], true).map((r) => r.id), ['d', 'c'])
  assert.deepEqual(newRows(seen, [row('c'), row('d')], true), [])
})

test('queue: one at a time, most important first, then oldest, no repeats', () => {
  const q = createBannerQueue()
  q.push(row('t1', 'task_done')); q.push(row('c', 'shift_cover')); q.push(row('t2', 'task_done')); q.push(row('c', 'shift_cover'))
  assert.equal(q.size, 3)
  assert.deepEqual([q.next()?.id, q.next()?.id, q.next()?.id, q.next()], ['c', 't1', 't2', null])
})

test('stack: newest first, no repeats, capped, pruned when read, demo rows kept', () => {
  let s: AlertRow[] = []
  for (let i = 0; i < 8; i++) s = addToStack(s, row(`r${i}`))
  assert.equal(s.length, STACK_MAX); assert.equal(s[0].id, 'r7')
  s = addToStack(s, row('r5')); assert.equal(s[0].id, 'r5'); assert.equal(s.length, STACK_MAX)
  assert.deepEqual(pruneStack(s, new Set(['r7']), new Set(['r6'])).map((r) => r.id), ['r7', 'r6'])
})

test('fan: rows 46 high, the hovered one 84, 6 px gaps', () => {
  assert.deepEqual(fanOffsets(3, null), [0, 52, 104])
  assert.deepEqual(fanOffsets(3, 1), [0, 52, 142])
})

test('hover pauses the hold', () => {
  assert.equal(holdLeft(4000, true, 100), 4000)
  assert.equal(holdLeft(4000, false, 100), 3900)
  assert.equal(holdLeft(50, false, 100), 0)
})

test('a banner sits above every state, including Leave now', () => {
  assert.equal(pickDisplay('leave', true, true), 'banner')
  assert.equal(pickDisplay('music', false, true), 'banner')
  assert.equal(pickDisplay('leave', true), 'leave')
})

test('a row arriving through the store (realtime) comes out as a new banner row straight away', async () => {
  const { createAlertsStore } = await import('../src/lib/alerts.ts')
  let rows: AlertRow[] = [row('old')]
  let fire = () => {}
  const api = { unreadAlerts: async () => rows, markAlertsRead: async () => {}, onAlertsChange: (cb: () => void) => { fire = cb; return () => {} } } as never
  const store = createAlertsStore(api)
  const seen = new Set<string>()
  let seeded = false
  const got: string[] = []
  store.subscribe(() => {
    const fresh = newRows(seen, store.rows(), seeded)
    if (store.status() === 'ok') seeded = true
    got.push(...fresh.map((r) => r.id))
  })
  await store.load()
  assert.deepEqual(got, []) // the alert that was already unread does not pop out at start up
  rows = [row('new', 'new_mark'), row('old')]
  const t0 = Date.now()
  fire()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(got, ['new'])
  assert.ok(Date.now() - t0 < 2000)
  store.destroy()
})
