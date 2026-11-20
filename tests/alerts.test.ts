import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PILLS, ago, alertMeta, buildAlertsView, pickHero, safeUrl, createAlertsStore } from '../src/lib/alerts.ts'
import type { AlertRow, Backend } from '../src/types.ts'

const NOW = new Date('2026-11-21T07:48:00Z')
const row = (id: string, type: string, minsAgo: number, read = false): AlertRow => ({
  id, type, title: id, body: '', action_label: null, action_url: null,
  created_at: new Date(NOW.getTime() - minsAgo * 60_000).toISOString(), read_at: read ? NOW.toISOString() : null,
})

test('ago: now, minutes, hours, days, never negative', () => {
  assert.equal(ago(NOW, row('a', 'x', 0).created_at), 'now')
  assert.equal(ago(NOW, row('a', 'x', 4).created_at), '4m')
  assert.equal(ago(NOW, row('a', 'x', 60).created_at), '1h')
  assert.equal(ago(NOW, row('a', 'x', 60 * 49).created_at), '2d')
  assert.equal(ago(NOW, new Date(NOW.getTime() + 5 * 60_000).toISOString()), 'now')
})

test('hero: highest rank wins, then newest, read alerts never', () => {
  assert.equal(pickHero([row('m', 'message', 1), row('c', 'shift_cover', 300), row('t', 'task_done', 0)])?.id, 'c')
  assert.equal(pickHero([row('old', 'new_mark', 90), row('new', 'new_mark', 5)])?.id, 'new')
  assert.equal(pickHero([row('c', 'shift_cover', 1, true), row('m', 'message', 5)])?.id, 'm')
  assert.equal(pickHero([]), null)
})

test('unknown types fall back to a phone alert', () => {
  assert.equal(alertMeta('something_new').cat, 'phone')
  assert.equal(alertMeta('new_mark').cat, 'school')
  assert.equal(alertMeta('shift_cover').cat, 'work')
})

test('view: banner is not repeated as a pill, count includes it, newest first', () => {
  const v = buildAlertsView([row('c', 'shift_cover', 4), row('a', 'message', 120), row('b', 'task_done', 60), row('r', 'call', 1, true)])
  assert.equal(v.hero?.id, 'c')
  assert.deepEqual(v.pills.map((p) => p.id), ['b', 'a'])
  assert.equal(v.unread, 3)
  assert.equal(v.more, 0)
})

test('view: more than six pills shows five and "+N more"', () => {
  const rows = [row('h', 'shift_cover', 1), ...Array.from({ length: 9 }, (_, i) => row(`p${i}`, 'message', 10 + i))]
  const v = buildAlertsView(rows)
  assert.equal(v.pills.length, MAX_PILLS - 1)
  assert.equal(v.more, 9 - (MAX_PILLS - 1))
  assert.equal(v.unread, 10)
})

test('safeUrl only lets web links through', () => {
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x')
  assert.equal(safeUrl('javascript:alert(1)'), null)
  assert.equal(safeUrl('data:text/html,hi'), null)
  assert.equal(safeUrl(null), null)
})

test('store: marking read removes at once and a failed write brings the rows back', async () => {
  let fail = false
  const api = {
    unreadAlerts: async () => [row('a', 'message', 1), row('b', 'call', 2)],
    markAlertsRead: async () => { if (fail) throw new Error('nope') },
    onAlertsChange: () => () => {},
  } as unknown as Backend
  const s = createAlertsStore(api)
  await s.load()
  assert.equal(s.rows().length, 2)
  await s.markRead(['a'])
  assert.deepEqual(s.rows().map((r) => r.id), ['b'])
  fail = true
  await s.markRead(['b'])
  assert.equal(s.rows().length, 1, 'restored after a failed write')
  s.destroy()
})
