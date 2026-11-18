// Run with: npm test. Expected values are worked out by hand. Times are Perth (+08:00), Sat 21 Nov 2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTimeline, fmtClockPm, fmtCountdown, fmtDayLabel, fmtDayMonth, fmtStudy, perthDayBounds, perthDaysBetween,
  shiftView, studyMinutesFor, subjectKey, testView,
} from '../src/lib/now-model.ts'

const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, day, h - 8, m))
const shift = { id: 's', title: 'SATURDAY PA 5:30-9', station: 'PA', starts_at: at(21, 17, 30).toISOString(), ends_at: at(21, 21).toISOString(), is_public_holiday: false }
const session = (id: string, subject: string, minutes: number | null, h = 10, ended = true) => ({
  id, subject, started_at: at(21, h).toISOString(), ended_at: ended ? at(21, h, minutes ?? 0).toISOString() : null, minutes,
})

test('Perth day bounds follow Perth midnight, not UTC', () => {
  const { from, to } = perthDayBounds(at(21, 0, 30)) // 00:30 Perth is 16:30 UTC the day before
  assert.equal(from.toISOString(), at(21, 0).toISOString())
  assert.equal(to.toISOString(), at(22, 0).toISOString())
  assert.equal(perthDaysBetween(at(21, 23, 59), at(22, 0, 1)), 1)
})

test('formatting', () => {
  assert.equal(fmtClockPm(at(21, 17, 30)), '5:30 pm')
  assert.equal(fmtClockPm(at(21, 0, 5)), '12:05 am')
  assert.equal(fmtClockPm(at(21, 12)), '12:00 pm')
  assert.equal(fmtDayMonth(at(21, 9)), 'Sat 21 Nov')
  assert.equal(fmtDayLabel(at(21, 9), at(21, 17)), 'Today')
  assert.equal(fmtDayLabel(at(21, 9), at(22, 8)), 'Tomorrow')
  assert.equal(fmtDayLabel(at(21, 9), at(24, 8)), 'Tue 24 Nov')
  assert.equal(fmtCountdown(102 * 60_000), '1:42')
  assert.equal(fmtCountdown(42 * 60_000), '42m')
  assert.equal(fmtCountdown(61_000), '2m') // rounds up, never says 0 early
  assert.equal(fmtCountdown(1), '1m')
  assert.equal(fmtCountdown(30 * 3600_000), '1d')
  assert.equal(fmtStudy(45), '45 min')
  assert.equal(fmtStudy(85), '1 h 25 min')
  assert.equal(fmtStudy(120), '2 h')
})

test('shift 1:42 away, leave by 5:05 with 25 minutes of travel', () => {
  const sv = shiftView(shift, at(21, 15, 48), 25)
  assert.equal(sv.phase, 'upcoming')
  assert.equal(sv.countdown, '1:42')
  assert.equal(fmtClockPm(sv.leaveBy), '5:05 pm')
  assert.equal(sv.soon, true)
  assert.equal(sv.pillLabel, 'PA shift')
  // 6 hour ring window, 1:42 left: 1 - 102/360
  assert.ok(Math.abs(sv.ring - (1 - 102 / 360)) < 1e-9)
})

test('travel minutes change the leave-by time', () => {
  assert.equal(fmtClockPm(shiftView(shift, at(21, 12), 40).leaveBy), '4:50 pm')
})

test('soon is exactly inside two hours', () => {
  assert.equal(shiftView(shift, at(21, 15, 30)).soon, true) // 2:00 away
  assert.equal(shiftView(shift, at(21, 15, 29)).soon, false) // 2:01 away
  assert.equal(shiftView(shift, at(21, 9)).soon, false)
})

test('a shift in progress counts down to the end and fills the ring by elapsed time', () => {
  const sv = shiftView(shift, at(21, 19, 15), 25) // halfway through 5:30 to 9
  assert.equal(sv.phase, 'live')
  assert.equal(sv.soon, true)
  assert.equal(sv.countdown, '1:45')
  assert.equal(sv.ring, 0.5)
})

test('shift with no station falls back to a plain label', () => {
  assert.equal(shiftView({ ...shift, station: null }, at(21, 16)).pillLabel, 'Shift')
})

test('subject keys', () => {
  assert.equal(subjectKey('Human Biology'), 'hb')
  assert.equal(subjectKey('Chemistry'), 'chem')
  assert.equal(subjectKey('Methods'), 'meth')
  assert.equal(subjectKey('Specialist'), 'spec')
  assert.equal(subjectKey('English'), 'english')
  assert.equal(subjectKey('Religion & Life'), 'religion')
  assert.equal(subjectKey('Woodwork'), null)
})

test('study minutes match subjects loosely and count a running session', () => {
  const sessions = [session('a', 'Human Biology', 40), session('b', 'Human Bio', 45), session('c', 'Methods', 30), session('d', 'Human Biology', null, 15, false)]
  // d started 15:00, now is 15:20: 20 running minutes
  assert.equal(studyMinutesFor('Human Biology', sessions, at(21, 15, 20)), 40 + 45 + 20)
  assert.equal(studyMinutesFor('Chemistry', sessions, at(21, 15, 20)), 0)
})

test('test view: days left in Perth calendar days, plus study minutes', () => {
  const t = { id: 't', subject: 'Human Biology', title: 'Unit 1 and 2 exam', due_at: at(24, 8, 30).toISOString() }
  const tv = testView(t, [session('a', 'Human Biology', 40), session('b', 'Human Biology', 45)], at(21, 23, 59))
  assert.equal(tv.daysLeft, 3)
  assert.equal(tv.when, 'Tue 24 Nov')
  assert.equal(tv.subject, 'hb')
  assert.equal(tv.studyMinutes, 85)
  assert.equal(testView(t, [], at(24, 7)).daysLeft, 0)
})

test('timeline is in time order with the right status', () => {
  const quiz = { id: 'q', subject: 'Methods', title: 'Calculus quiz', due_at: at(21, 13).toISOString() }
  const items = buildTimeline({ shifts: [shift], tests: [quiz], sessions: [session('a', 'Human Biology', 40, 10)] }, at(21, 15, 48))
  assert.deepEqual(items.map((i) => [i.kind, i.status]), [['study', 'past'], ['test', 'past'], ['shift', 'next']])
  assert.equal(items[0].sub, 'Study, 40 min')
  assert.equal(items[2].sub, '5:30 pm to 9:00 pm')
  assert.equal(buildTimeline({ shifts: [shift], tests: [], sessions: [] }, at(21, 18))[0].status, 'now')
  assert.deepEqual(buildTimeline({ shifts: [], tests: [], sessions: [] }, at(21, 9)), [])
})
