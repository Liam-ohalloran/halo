import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWeek, fmtHour, fmtRange, layoutBlocks, shiftEvent, testEvent, subjectColour, type WeekEvent } from '../src/lib/week.ts'

// Sat 21 Nov 2026, 10:00 am Perth.
const NOW = new Date('2026-11-21T02:00:00Z')
const perth = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, 21 + d, h - 8, m)).toISOString()
const shift = (id: string, d: number, a: number, b: number, station = 'PA') =>
  shiftEvent({ id, title: `SHIFT ${id}`, station, starts_at: perth(d, Math.floor(a), (a % 1) * 60), ends_at: perth(d, Math.floor(b), (b % 1) * 60), is_public_holiday: false })

test('seven days from today, today first and flagged', () => {
  const w = buildWeek(NOW, [])
  assert.equal(w.days.length, 7)
  assert.deepEqual(w.days.map((d) => d.dow), ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI'])
  assert.deepEqual(w.days.map((d) => d.num), [21, 22, 23, 24, 25, 26, 27])
  assert.equal(w.days[0].isToday, true)
  assert.equal(w.days.filter((d) => d.isToday).length, 1)
  assert.equal(w.month, 'Nov')
  assert.equal(w.range, '21 to 27')
})

test('a week that crosses a month names both', () => {
  assert.equal(buildWeek(new Date('2026-11-28T02:00:00Z'), []).range, '28 to 4 Dec')
})

test('a shift lands on its day with Perth hours, whatever the browser time zone', () => {
  const w = buildWeek(NOW, [shift('a', 0, 6.5, 15)])
  assert.equal(w.days[0].blocks.length, 1)
  assert.equal(w.days[0].blocks[0].from, 6.5)
  assert.equal(w.days[0].blocks[0].to, 15)
  assert.equal(w.total, 1)
})

test('before 6am goes in the EARLY row', () => {
  const w = buildWeek(NOW, [shift('a', 5, 5.5, 9)])
  assert.equal(w.days[5].early.length, 1)
  assert.equal(w.days[5].blocks.length, 0)
})

test('a task with no time (Perth midnight) goes in the EARLY row', () => {
  const ev = testEvent({ id: 't', subject: 'English', title: 'Text response', due_at: perth(4, 0) })
  assert.equal(ev.timed, false)
  const w = buildWeek(NOW, [ev])
  assert.equal(w.days[4].early[0].title, 'Text response')
  assert.equal(fmtRange(ev), 'No time')
})

test('a test is a one hour block in its subject colour', () => {
  const ev = testEvent({ id: 't', subject: 'Chemistry', title: 'Organic chemistry test', due_at: perth(2, 10, 15) })
  assert.equal(ev.short, 'Chem')
  assert.equal(ev.colour, subjectColour('Chemistry'))
  assert.equal(ev.colour, '#3D9BFF')
  const b = buildWeek(NOW, [ev]).days[2].blocks[0]
  assert.equal(b.from, 10.25)
  assert.equal(b.to, 11.25)
})

test('clashing events sit side by side, others keep the full width', () => {
  const w = buildWeek(NOW, [shift('a', 3, 7.5, 12), testEvent({ id: 't', subject: 'Methods', title: 'Calculus', due_at: perth(3, 8) }), shift('b', 3, 15, 18)])
  const [a, b, c] = w.days[3].blocks
  assert.equal(a.lanes, 2); assert.equal(b.lanes, 2)
  assert.notEqual(a.lane, b.lane)
  assert.equal(c.lanes, 1); assert.equal(c.lane, 0)
})

test('three way clash uses three lanes, and a freed lane is reused', () => {
  const mk = (id: string, from: number, to: number): { ev: WeekEvent; from: number; to: number } => ({ ev: { id } as WeekEvent, from, to })
  const out = layoutBlocks([mk('a', 8, 12), mk('b', 9, 10), mk('c', 9.5, 11), mk('d', 10.5, 11.5)])
  assert.equal(out.every((b) => b.lanes === 3), true)
  assert.equal(new Set(out.map((b) => b.lane)).size, 3)
})

test('a shift that crosses midnight shows on both days', () => {
  const ev = shiftEvent({ id: 'n', title: 'LATE', station: 'CL', starts_at: perth(0, 20), ends_at: perth(1, 1), is_public_holiday: false })
  const w = buildWeek(NOW, [ev])
  assert.equal(w.days[0].blocks[0].from, 20)
  assert.equal(w.days[0].blocks[0].to, 22) // clamped to the 10pm edge of the grid
  assert.equal(w.days[1].early.length, 1) // 12am to 1am is before 6am
})

test('events outside the seven days are ignored', () => {
  assert.equal(buildWeek(NOW, [shift('x', 8, 9, 12), shift('y', -1, 9, 12)]).total, 0)
})

test('a short event is never thinner than the minimum block', () => {
  const b = buildWeek(NOW, [shift('s', 1, 9, 9.25)]).days[1].blocks[0]
  assert.equal(b.to - b.from, 0.75)
})

test('time formatting', () => {
  assert.equal(fmtHour(6.5), '6:30 am')
  assert.equal(fmtHour(12), '12 pm')
  assert.equal(fmtHour(0), '12 am')
  assert.equal(fmtRange(shift('a', 0, 6.5, 15)), '6:30 am to 3 pm')
})
