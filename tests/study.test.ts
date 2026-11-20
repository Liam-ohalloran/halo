// Run with: npm test. Times are Perth (+08:00). Week used: Mon 16 Nov 2026 to Sun 22 Nov 2026.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  begin, elapsedMs, endedAt, idleState, isComplete, parseState, pause, progress, remainingMs, resume,
  shortSubject, subjectKey, summariseWeek, weeklyGoal,
} from '../src/lib/study.ts'

const MIN = 60_000
const T0 = Date.parse('2026-11-18T16:00:00+08:00')

test('timer counts focus only, never paused time', () => {
  let s = begin(idleState('Chemistry'), 'a', T0)
  assert.equal(elapsedMs(s, T0 + 10 * MIN), 10 * MIN)
  s = pause(s, T0 + 10 * MIN)
  assert.equal(s.status, 'paused')
  assert.equal(elapsedMs(s, T0 + 40 * MIN), 10 * MIN) // 30 minutes paused do not count
  s = resume(s, T0 + 40 * MIN)
  assert.equal(elapsedMs(s, T0 + 45 * MIN), 15 * MIN)
  assert.equal(remainingMs(s, T0 + 45 * MIN), 10 * MIN)
  assert.equal(progress(s, T0 + 45 * MIN), 0.6)
  assert.equal(isComplete(s, T0 + 54 * MIN + 59_000), false)
  assert.equal(isComplete(s, T0 + 55 * MIN), true)
})

test('ended_at makes the generated minutes equal focused time', () => {
  let s = begin(idleState('Methods'), 'a', T0)
  s = pause(s, T0 + 12 * MIN)
  s = resume(s, T0 + 30 * MIN)
  const end = endedAt(s, T0 + 38 * MIN) // 12 + 8 focused
  assert.equal((end - T0) / MIN, 20)
})

test('a tab left open is capped at the target', () => {
  const s = begin(idleState('English', 25), 'a', T0)
  assert.equal((endedAt(s, T0 + 8 * 60 * MIN) - T0) / MIN, 25)
})

test('state survives a reload (JSON round trip), running and paused', () => {
  const running = begin(idleState('Specialist'), 'abc', T0)
  const back = parseState(JSON.stringify(running))!
  assert.deepEqual(back, running)
  assert.equal(elapsedMs(back, T0 + 7 * MIN), 7 * MIN)
  const paused = pause(running, T0 + 5 * MIN)
  assert.deepEqual(parseState(JSON.stringify(paused)), paused)
})

test('garbage in storage is ignored', () => {
  assert.equal(parseState(null), null)
  assert.equal(parseState('nope'), null)
  assert.equal(parseState('{"status":"running","subject":"x","targetMs":1,"acc":0}'), null) // no session id
  assert.equal(parseState('{"status":"flying","subject":"x","targetMs":1,"acc":0}'), null)
})

test('subject names map to keys', () => {
  assert.equal(subjectKey('Human Biology'), 'hb')
  assert.equal(subjectKey('Human Bio'), 'hb')
  assert.equal(subjectKey('Religion & Life'), 'religion')
  assert.equal(subjectKey('Specialist 3C'), 'spec')
  assert.equal(subjectKey('Woodwork'), null)
  assert.equal(shortSubject('Human Biology'), 'Human Bio')
})

test('goals scale with how close the test is', () => {
  assert.equal(weeklyGoal(0), 120)
  assert.equal(weeklyGoal(7), 120)
  assert.equal(weeklyGoal(8), 60)
  assert.equal(weeklyGoal(21), 60)
  assert.equal(weeklyGoal(22), null)
  assert.equal(weeklyGoal(null), null)
})

const NOW = new Date('2026-11-18T16:00:00+08:00') // Wednesday
const ses = (subject: string, at: string, minutes: number) => ({ subject, started_at: `${at}+08:00`, minutes })
const tst = (subject: string, due: string) => ({ subject, title: `${subject} test`, due_at: `${due}+08:00` })

test('week totals only count Monday to Sunday in Perth, grouped by subject', () => {
  const w = summariseWeek(
    [
      ses('Methods', '2026-11-16T00:30:00', 30), // Monday 12:30 am Perth, counts
      ses('Human Biology', '2026-11-17T10:00:00', 25),
      ses('Human Bio', '2026-11-18T10:00:00', 25), // same subject, other spelling
      ses('Methods', '2026-11-15T23:30:00', 99), // Sunday last week, ignored
      ses('Methods', '2026-11-23T00:00:00', 99), // Monday next week, ignored
    ],
    [],
    NOW,
  )
  assert.equal(w.totalMinutes, 80)
  assert.equal(w.subjects.find((s) => s.subject === 'Human Biology')!.minutes, 50)
  assert.equal(w.subjects.find((s) => s.subject === 'Methods')!.minutes, 30)
  assert.equal(w.subjects[0].subject, 'Human Biology') // busiest first
  assert.equal(w.behind, null) // no tests, nobody behind
})

test('furthest behind is the biggest shortfall against its goal', () => {
  const w = summariseWeek(
    [ses('Chemistry', '2026-11-17T10:00:00', 90), ses('Methods', '2026-11-17T11:00:00', 20)],
    [
      tst('Chemistry', '2026-11-20T09:00:00'), // 2 days, goal 120, done 90, short 30
      tst('Methods', '2026-11-24T09:00:00'), // 6 days, goal 120, done 20, short 100
      tst('English', '2026-12-07T09:00:00'), // 19 days, goal 60, done 0, short 60
    ],
    NOW,
  )
  assert.equal(w.behind!.subject, 'Methods')
  assert.equal(w.behind!.deficit, 100)
  assert.equal(w.behind!.daysToTest, 6)
})

test('a tie goes to the sooner test, and a met goal is never flagged', () => {
  const tie = summariseWeek(
    [],
    [tst('Chemistry', '2026-11-26T09:00:00'), tst('Methods', '2026-11-20T09:00:00')],
    NOW,
  )
  assert.equal(tie.behind!.subject, 'Methods') // both short 120, Methods is sooner
  const met = summariseWeek([ses('Chemistry', '2026-11-17T10:00:00', 120)], [tst('Chemistry', '2026-11-20T09:00:00')], NOW)
  assert.equal(met.behind, null)
})

test('past tests and far off tests are ignored', () => {
  const w = summariseWeek([], [tst('Chemistry', '2026-11-10T09:00:00'), tst('Methods', '2027-02-01T09:00:00')], NOW)
  assert.equal(w.behind, null)
  assert.equal(w.subjects.find((s) => s.subject === 'Chemistry')!.test, null)
})

// ---- Card 16: today, streak and dots ----
import { dotsFor, studyStreak, todayMinutes } from '../src/lib/study.ts'

// Perth is UTC+8. "Now" is Sat 21 Nov 2026, 10 am Perth.
const SAT = new Date('2026-11-21T10:00:00+08:00')
const at = (iso: string, minutes: number | null = 30) => ({ subject: 'Methods', started_at: iso, minutes })

test('todayMinutes counts only the Perth day, even near midnight UTC', () => {
  const s = [at('2026-11-21T07:30:00+08:00', 25), at('2026-11-20T23:50:00+08:00', 40), at('2026-11-21T09:00:00+08:00', null)]
  assert.equal(todayMinutes(s, SAT), 25)
  // 7 am Perth is 11 pm the day before in UTC: still today in Perth.
  assert.equal(todayMinutes([at('2026-11-20T23:30:00Z', 10)], SAT), 10)
})

test('studyStreak counts days in a row ending today', () => {
  const s = [at('2026-11-21T08:00:00+08:00'), at('2026-11-20T20:00:00+08:00'), at('2026-11-19T07:00:00+08:00'), at('2026-11-17T07:00:00+08:00')]
  const r = studyStreak(s, SAT)
  assert.equal(r.days, 3)
  // Week of Mon 16 Nov: Tue 17, Thu 19, Fri 20, Sat 21 studied.
  assert.deepEqual(r.week, [false, true, false, true, true, true, false])
})

test('studyStreak is not broken until a whole day passes with no study', () => {
  const s = [at('2026-11-20T20:00:00+08:00'), at('2026-11-19T07:00:00+08:00')]
  assert.equal(studyStreak(s, SAT).days, 2) // nothing yet today, yesterday still counts
  assert.equal(studyStreak([at('2026-11-18T07:00:00+08:00')], SAT).days, 0) // missed yesterday
  assert.equal(studyStreak([], SAT).days, 0)
})

test('a session with no minutes does not count towards a streak', () => {
  assert.equal(studyStreak([at('2026-11-21T08:00:00+08:00', 0), at('2026-11-20T08:00:00+08:00', null)], SAT).days, 0)
})

test('dotsFor is one dot per 15 minutes, up to ten', () => {
  assert.equal(dotsFor(0), 0)
  assert.equal(dotsFor(48), 3)
  assert.equal(dotsFor(150), 10)
  assert.equal(dotsFor(400), 10)
})
