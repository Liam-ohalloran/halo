import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMoneyView, byCategory, daysLeftInMonth, dollars, earnedBetween, goalFraction, nextRenewal, perthDate, perthMonthStart, safeToSpend, subscriptions, type MoneyItem } from '../src/lib/money.ts'
import { abbrSubject, average, buildMarksView, markProblem, percent, type Mark } from '../src/lib/marks.ts'
import { DEFAULT_SETTINGS } from '../src/types.ts'

// "Now" is Sat 21 Nov 2026, 3:48 pm Perth, the same clock the dev fixtures use.
const NOW = new Date('2026-11-21T07:48:00Z')
const shift = (start: string, end: string) => ({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), is_public_holiday: false })
const item = (id: string, kind: 'spend' | 'sub', amount: number, on_date: string, category = 'Food', name = id): MoneyItem => ({ id, kind, name, amount, category, on_date })

test('Perth dates and months do not depend on the machine time zone', () => {
  assert.equal(perthDate(new Date('2026-11-21T17:00:00Z')), '2026-11-22') // 1 am Sunday in Perth
  assert.equal(perthMonthStart(NOW).toISOString(), '2026-10-31T16:00:00.000Z')
  assert.equal(perthMonthStart(NOW, 1).toISOString(), '2026-11-30T16:00:00.000Z')
  assert.equal(daysLeftInMonth(NOW), 10) // 21 to 30 Nov, today counts
})

test('earned: this week matches the Pay tab maths and the month adds the earlier shifts', () => {
  // Saturday 6:30 to 3 pm Perth = 8.5 h, minus a 30 minute break = 8 paid hours at the Saturday rate.
  const sat = shift('2026-11-20T22:30:00Z', '2026-11-21T07:00:00Z')
  const early = shift('2026-11-07T22:30:00Z', '2026-11-08T07:00:00Z') // Sun 8 Nov in Perth, 8 hours at the Sunday rate
  const wk = earnedBetween([sat, early], new Date('2026-11-15T16:00:00Z'), new Date('2026-11-22T16:00:00Z'), DEFAULT_SETTINGS)
  assert.equal(wk.gross, Math.round(8 * 17.89 * 100) / 100)
  const mo = earnedBetween([sat, early], perthMonthStart(NOW), perthMonthStart(NOW, 1), DEFAULT_SETTINGS)
  assert.equal(mo.gross, Math.round((8 * 17.89 + 8 * 17.89 * 1.25) * 100) / 100)
  assert.ok(mo.net <= mo.gross && mo.net > 0)
  assert.deepEqual(earnedBetween([], perthMonthStart(NOW), perthMonthStart(NOW, 1), DEFAULT_SETTINGS), { gross: 0, net: 0 })
})

test('spending groups by category, biggest first, unknown goes to Other', () => {
  const t = byCategory([item('a', 'spend', 10, '2026-11-20', 'Food'), item('b', 'spend', 30, '2026-11-20', 'Fun'), item('c', 'spend', 5, '2026-11-20', 'Mystery'), item('d', 'spend', 5, '2026-11-20', 'Food')])
  assert.deepEqual(t.map((c) => [c.name, c.total]), [['Fun', 30], ['Food', 15], ['Other', 5]])
})

test('subscriptions: monthly total and the next renewal, short months clamp', () => {
  const r = subscriptions([item('s', 'sub', 13.99, '2026-09-09', 'Subscription', 'Spotify'), item('t', 'sub', 4.49, '2026-01-31', 'Subscription', 'iCloud'), item('x', 'spend', 99, '2026-11-20')], NOW)
  assert.equal(r.monthly, 18.48)
  assert.equal(r.rows.length, 2)
  assert.equal(perthDate(nextRenewal('2026-09-09', NOW)), '2026-12-09')
  assert.equal(perthDate(nextRenewal('2026-01-31', NOW)), '2026-11-30') // 31st lands on the last day of November
  assert.equal(perthDate(nextRenewal('2026-09-21', NOW)), '2026-11-21') // today still counts
  assert.equal(perthDate(nextRenewal('2026-09-31'.replace('31', '28'), new Date('2026-12-29T00:00:00Z'))), '2027-01-28')
})

test('safe to spend: never negative, spread over the days left', () => {
  assert.equal(safeToSpend(800, 100, 50, NOW), 65) // 650 over 10 days
  assert.equal(safeToSpend(100, 400, 50, NOW), 0)
  assert.equal(safeToSpend(0, 0, 0, NOW), 0)
})

test('goals and money formatting', () => {
  assert.equal(goalFraction({ saved: 1840, target: 5000 }), 0.368)
  assert.equal(goalFraction({ saved: 9000, target: 5000 }), 1)
  assert.equal(goalFraction({ saved: 10, target: 0 }), 0)
  assert.equal(dollars(1840), '$1,840')
  assert.equal(dollars(9.5), '$9.50')
  assert.equal(dollars(0), '$0')
})

test('money view: week and month spend are separate, subscriptions are not spending', () => {
  const items = [item('a', 'spend', 20, '2026-11-18'), item('b', 'spend', 15, '2026-11-02'), item('c', 'spend', 7, '2026-10-30'), item('s', 'sub', 10, '2026-09-05', 'Subscription')]
  const v = buildMoneyView([], items, [], DEFAULT_SETTINGS, NOW)
  assert.equal(v.spentWeek, 20)
  assert.equal(v.categories[0].total, 20)
  assert.equal(v.subs.monthly, 10)
  assert.equal(v.safe, 0)
  assert.equal(v.recent[0].id, 'a')
})

const mk = (id: string, subject: string, score: number, date: string, out_of = 100, weighting: number | null = null): Mark => ({ id, subject, assessment: id, score, out_of, weighting, date })

test('marks: percentages, weighted average, empty', () => {
  assert.equal(percent({ score: 41, out_of: 50 }), 82)
  assert.equal(percent({ score: 5, out_of: 0 }), 0)
  assert.equal(average([]), null)
  assert.equal(average([mk('a', 'X', 80, '2026-01-01'), mk('b', 'X', 60, '2026-01-02')]), 70)
  assert.equal(average([mk('a', 'X', 80, '2026-01-01', 100, 30), mk('b', 'X', 60, '2026-01-02', 100, 10)]), 75)
})

test('marks view: subjects keep their order, best and most improved', () => {
  const rows = [
    mk('1', 'Chemistry', 72, '2026-02-01'), mk('2', 'Chemistry', 84, '2026-03-01'),
    mk('3', 'Human Biology', 90, '2026-02-01'), mk('4', 'Human Biology', 88, '2026-03-01'),
    mk('5', 'Zoology', 60, '2026-03-01'),
  ]
  const v = buildMarksView(rows)
  assert.deepEqual(v.stats.map((s) => s.subject), ['Chemistry', 'Human Biology', 'Zoology'])
  assert.equal(v.best?.subject, 'Human Biology')
  assert.equal(v.improved?.subject, 'Chemistry')
  assert.equal(v.stats[0].delta, 12)
  assert.equal(v.stats[2].delta, null)
  assert.equal(buildMarksView([mk('a', 'X', 50, '2026-01-01')]).improved, null)
  assert.equal(buildMarksView([]).best, null)
  assert.equal(abbrSubject('Human Biology'), 'Bio')
})

test('marks entry is checked with plain sentences', () => {
  const ok = { subject: 'Chem', assessment: 'Test', score: 40, out_of: 50, weighting: 10, date: '2026-11-21' }
  assert.equal(markProblem(ok), null)
  assert.match(markProblem({ ...ok, subject: ' ' })!, /subject/i)
  assert.match(markProblem({ ...ok, out_of: 0 })!, /Out of/)
  assert.match(markProblem({ ...ok, score: -1 })!, /Score/)
  assert.match(markProblem({ ...ok, score: 500 })!, /more than the total/)
  assert.match(markProblem({ ...ok, weighting: 150 })!, /Weighting/)
  assert.match(markProblem({ ...ok, date: '' })!, /date/i)
})
