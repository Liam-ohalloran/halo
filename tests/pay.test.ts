// Run with: npm test   (Node's built-in test runner, no extra packages)
// Expected values are worked out by hand. Times are Perth (+08:00).
// Week used throughout: Mon 16 Nov 2026 to Sun 22 Nov 2026.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcShift,
  calcWeek,
  estimateTax,
  hourlyRate,
  paidHours,
  perthWeekStart,
  type PayShift,
} from '../src/lib/pay.ts'

// Round numbers so the hand maths is easy: weekday $20, Saturday $20, Sunday x1.25 = $25, holiday x2 = $40.
const S = { weekday_rate: 20, saturday_rate: 20, sunday_multiplier: 1.25, public_holiday_multiplier: 2 }
// The seeded defaults from HALO.md section 4.
const DEFAULTS = { weekday_rate: 17.89, saturday_rate: 17.89, sunday_multiplier: 1.25, public_holiday_multiplier: 2 }

const sh = (start: string, end: string, ph = false): PayShift => ({
  starts_at: `${start}+08:00`,
  ends_at: `${end}+08:00`,
  is_public_holiday: ph,
})
const WEEK = perthWeekStart(new Date('2026-11-18T10:00:00+08:00'))

/* ---------- breaks ---------- */

test('paidHours: 30 minute break only when over 5 hours', () => {
  assert.equal(paidHours(3.5), 3.5)
  assert.equal(paidHours(5), 5)
  assert.equal(paidHours(5.01), 4.51)
  assert.equal(paidHours(6), 5.5)
  assert.equal(paidHours(8), 7.5)
})

test('3.5 hour Saturday shift (SATURDAY PA 5:30-9) has no break', () => {
  const r = calcShift(sh('2026-11-21T17:30', '2026-11-21T21:00'), S)
  assert.equal(r.breakHours, 0)
  assert.equal(r.hours, 3.5)
  assert.equal(r.pay, 70)
})

test('exactly 5 hours has no break', () => {
  const r = calcShift(sh('2026-11-18T17:00', '2026-11-18T22:00'), S)
  assert.equal(r.hours, 5)
  assert.equal(r.pay, 100)
})

test('6 hour weekday shift: 5.5 paid hours', () => {
  const r = calcShift(sh('2026-11-17T12:00', '2026-11-17T18:00'), S)
  assert.equal(r.clockHours, 6)
  assert.equal(r.breakHours, 0.5)
  assert.equal(r.hours, 5.5)
  assert.equal(r.pay, 110)
})

/* ---------- multipliers ---------- */

test('6 hour Sunday shift: 5.5h x $25 = $137.50', () => {
  const r = calcShift(sh('2026-11-22T10:00', '2026-11-22T16:00'), S)
  assert.equal(r.hours, 5.5)
  assert.equal(r.pay, 137.5)
})

test('6 hour public holiday shift: 5.5h x $40 = $220', () => {
  const r = calcShift(sh('2026-11-18T10:00', '2026-11-18T16:00', true), S)
  assert.equal(r.pay, 220)
})

test('public holiday on a Sunday uses the holiday rate, not both multipliers', () => {
  const r = calcShift(sh('2026-11-22T10:00', '2026-11-22T15:00', true), S)
  assert.equal(r.pay, 200) // 5h x $40
})

test('saturday_rate is used on Saturdays', () => {
  const r = calcShift(sh('2026-11-21T10:00', '2026-11-21T14:00'), { ...S, saturday_rate: 22 })
  assert.equal(r.pay, 88)
})

test('hourlyRate by day', () => {
  const mon = WEEK.getTime()
  assert.equal(hourlyRate(mon, false, S), 20)
  assert.equal(hourlyRate(mon + 5 * 864e5, false, S), 20) // Sat
  assert.equal(hourlyRate(mon + 6 * 864e5, false, S), 25) // Sun
  assert.equal(hourlyRate(mon + 2 * 864e5, true, S), 40) // holiday
})

test('seeded default rate: 4 hours = $71.56', () => {
  assert.equal(calcShift(sh('2026-11-17T17:00', '2026-11-17T21:00'), DEFAULTS).pay, 71.56)
})

/* ---------- midnight ---------- */

test('Friday night into Saturday: split at Perth midnight, break comes off the first part', () => {
  // Fri 20:00 to Sat 02:00 = 6h. Fri 4h - 0.5 = 3.5h x 20 = 70. Sat 2h x 20 = 40.
  const r = calcShift(sh('2026-11-20T20:00', '2026-11-21T02:00'), S)
  assert.equal(r.hours, 5.5)
  assert.equal(r.pay, 110)
})

test('Saturday night into Sunday: later part gets the Sunday rate', () => {
  // Sat 3.5h x 20 = 70, Sun 2h x 25 = 50.
  const r = calcShift(sh('2026-11-21T20:00', '2026-11-22T02:00'), S)
  assert.equal(r.pay, 120)
})

test('a negative or empty shift pays nothing', () => {
  assert.equal(calcShift(sh('2026-11-18T10:00', '2026-11-18T10:00'), S).pay, 0)
  assert.equal(calcShift(sh('2026-11-18T12:00', '2026-11-18T10:00'), S).pay, 0)
})

/* ---------- tax ---------- */

test('tax: nothing up to $350, then 15 cents per dollar over', () => {
  assert.equal(estimateTax(0), 0)
  assert.equal(estimateTax(340), 0)
  assert.equal(estimateTax(350), 0)
  assert.equal(estimateTax(450), 15)
  assert.equal(estimateTax(425), 11.25)
})

/* ---------- weeks ---------- */

test('perthWeekStart is Monday 00:00 Perth', () => {
  assert.equal(WEEK.toISOString(), '2026-11-15T16:00:00.000Z')
  // Sunday night is still the same week, Monday 00:00 starts the next.
  assert.equal(perthWeekStart(new Date('2026-11-22T23:30:00+08:00')).getTime(), WEEK.getTime())
  assert.equal(perthWeekStart(new Date('2026-11-23T00:00:00+08:00')).getTime(), WEEK.getTime() + 7 * 864e5)
  // 01:00 Monday Perth is still Sunday in UTC.
  assert.equal(perthWeekStart(new Date('2026-11-15T17:00:00Z')).getTime(), WEEK.getTime())
  assert.equal(perthWeekStart(new Date('2026-11-18T10:00:00+08:00'), -1).toISOString(), '2026-11-08T16:00:00.000Z')
  assert.equal(perthWeekStart(new Date('2026-11-18T10:00:00+08:00'), 1).toISOString(), '2026-11-22T16:00:00.000Z')
})

test('empty week', () => {
  const w = calcWeek([], WEEK, S)
  assert.equal(w.hours, 0)
  assert.equal(w.gross, 0)
  assert.equal(w.tax, 0)
  assert.equal(w.net, 0)
  assert.equal(w.days.length, 7)
})

test('sample week 1: Mon 4h, Wed 6h, Sat 6h, Sun 5h', () => {
  const w = calcWeek(
    [
      sh('2026-11-16T17:00', '2026-11-16T21:00'), //  4h        = 80
      sh('2026-11-18T12:00', '2026-11-18T18:00'), //  6h -> 5.5 = 110
      sh('2026-11-21T12:00', '2026-11-21T18:00'), //  6h -> 5.5 = 110
      sh('2026-11-22T10:00', '2026-11-22T15:00'), //  5h Sunday = 125
    ],
    WEEK,
    S,
  )
  assert.equal(w.hours, 20)
  assert.equal(w.gross, 425)
  assert.equal(w.tax, 11.25) // (425 - 350) x 0.15
  assert.equal(w.net, 413.75)
  assert.deepEqual(
    w.days.map((d) => d.gross),
    [80, 0, 110, 0, 0, 110, 125],
  )
  assert.equal(w.shifts.length, 4)
})

test('sample week 2: under the threshold pays no tax', () => {
  const w = calcWeek(
    [sh('2026-11-17T17:00', '2026-11-17T21:00'), sh('2026-11-21T17:30', '2026-11-21T21:00')],
    WEEK,
    S,
  )
  assert.equal(w.hours, 7.5)
  assert.equal(w.gross, 150)
  assert.equal(w.tax, 0)
  assert.equal(w.net, 150)
})

test('sample week 3: a public holiday in the week', () => {
  const w = calcWeek(
    [
      sh('2026-11-18T10:00', '2026-11-18T16:00', true), // 5.5h x 40 = 220
      sh('2026-11-20T17:00', '2026-11-20T22:00'), //        5h x 20  = 100
      sh('2026-11-21T09:00', '2026-11-21T17:00'), //        7.5h x 20 = 150
    ],
    WEEK,
    S,
  )
  assert.equal(w.hours, 18)
  assert.equal(w.gross, 470)
  assert.equal(w.tax, 18) // 120 x 0.15
  assert.equal(w.net, 452)
})

test('a shift over the week boundary splits between the two weeks', () => {
  // Sun 15 Nov 22:00 to Mon 16 Nov 04:00 = 6h. Sunday part 2h - 0.5 = 1.5h x 25 = 37.50. Monday part 4h x 20 = 80.
  const shifts = [sh('2026-11-15T22:00', '2026-11-16T04:00')]
  const thisWeek = calcWeek(shifts, WEEK, S)
  assert.equal(thisWeek.hours, 4)
  assert.equal(thisWeek.gross, 80)
  const prev = calcWeek(shifts, perthWeekStart(WEEK, -1), S)
  assert.equal(prev.hours, 1.5)
  assert.equal(prev.gross, 37.5)
})

test('shifts outside the week are ignored and the list is in time order', () => {
  const w = calcWeek(
    [
      sh('2026-11-21T12:00', '2026-11-21T16:00'),
      sh('2026-11-09T12:00', '2026-11-09T16:00'),
      sh('2026-11-17T12:00', '2026-11-17T16:00'),
    ],
    WEEK,
    S,
  )
  assert.equal(w.shifts.length, 2)
  assert.equal(w.shifts[0].shift.starts_at, '2026-11-17T12:00+08:00')
  assert.equal(w.gross, 160)
})
