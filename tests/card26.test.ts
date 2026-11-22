import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STEP, clampVolume, wheelDelta } from '../src/lib/scroll-volume.ts'
import { createWinNotes, isWinNote, toAlertRow } from '../src/lib/win-notifications.ts'
import { clipToItem } from '../src/lib/shelf.ts'
import { bannerModel } from '../src/lib/banner.ts'

test('scroll volume: up is louder, a notch is 4 points, trackpads add up, never outside 0 to 100', () => {
  assert.equal(wheelDelta(-100), STEP)
  assert.equal(wheelDelta(100), -STEP)
  assert.equal(wheelDelta(-25), STEP / 4)
  assert.equal(wheelDelta(-3, 1), STEP) // lines
  assert.equal(clampVolume(104), 100)
  assert.equal(clampVolume(-3), 0)
  assert.equal(STEP, 4)
})

test('a Windows notification becomes a banner row, a message keeps only what the helper left in', () => {
  const msg = { id: 'win-9', type: 'message', title: 'New message', body: 'WhatsApp', app: 'WhatsApp', hidden: true }
  const row = toAlertRow(msg, new Date('2026-11-21T08:00:00Z'))
  assert.deepEqual({ id: row.id, type: row.type, title: row.title, body: row.body, action: row.action_label, url: row.action_url }, { id: 'win-9', type: 'message', title: 'New message', body: 'WhatsApp', action: null, url: null })
  const m = bannerModel(row, new Date('2026-11-21T08:00:30Z'))
  assert.equal(m.action, null) // nothing to post, reply to or open
  assert.equal(m.title, 'New message')
})

test('notification store: dedupes, newest first, keeps 20, mark read removes', () => {
  const s = createWinNotes()
  let hits = 0
  s.subscribe(() => hits++)
  for (let i = 0; i < 25; i++) s.add({ id: `win-${i}`, type: 'notification', title: `n${i}`, body: 'b' })
  s.add({ id: 'win-24', type: 'notification', title: 'again', body: 'b' })
  assert.equal(s.rows().length, 20)
  assert.equal(s.rows()[0].id, 'win-24')
  assert.equal(hits, 25)
  s.markRead(['win-24', 'win-1'])
  assert.equal(s.rows()[0].id, 'win-23')
  s.add('nonsense'); s.add(null); s.add({ id: 1 })
  assert.equal(s.rows().length, 19)
  assert.ok(isWinNote({ id: 'a', type: 'b', title: 'c', body: 'd' }) && !isWinNote({}))
})

test('clipboard entries show on the Shelf as text, link or image tiles', () => {
  assert.deepEqual({ k: clipToItem({ id: 'c1', kind: 'text', text: 'hello\nworld', at: 1 }).kind, n: clipToItem({ id: 'c1', kind: 'text', text: 'hello\nworld', at: 1 }).name }, { k: 'text', n: 'hello' })
  const link = clipToItem({ id: 'c2', kind: 'text', text: 'https://example.com/a', at: 1 })
  assert.equal(link.kind, 'link'); assert.equal(link.content, 'https://example.com/a')
  const img = clipToItem({ id: 'c3', kind: 'image', w: 800, h: 400, at: 1 })
  assert.equal(img.kind, 'file'); assert.equal(img.name, 'Image 800 × 400')
  assert.equal(clipToItem({ id: 'c4', kind: 'text', text: '   ', at: 1 }).name, 'Empty')
})
