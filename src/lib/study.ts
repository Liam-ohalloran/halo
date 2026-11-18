// Study maths for the Study panel (card 08). Pure functions, no UI, no Supabase, so they run under `npm test`.
// Times are epoch milliseconds. The week is Monday to Sunday in Perth (UTC+8, no daylight saving).

import { perthWeekStart } from './pay.ts'

const MIN = 60_000
const DAY = 24 * 60 * MIN

/* ---------- Timer state machine ---------- */

export const DEFAULT_TARGET_MIN = 25

export type TimerStatus = 'idle' | 'running' | 'paused'

/**
 * Everything needed to rebuild the timer after a reload. Stored as JSON in localStorage.
 * Focused time = `acc` plus, while running, the time since `segStart`. Time spent paused is never counted.
 */
export interface TimerState {
  status: TimerStatus
  subject: string
  targetMs: number
  /** study_sessions row id, set once the session has been inserted. */
  sessionId: string | null
  /** When the session row started, epoch ms. */
  startedAt: number | null
  /** Focused ms banked before the current run segment. */
  acc: number
  /** Start of the current run segment, epoch ms. Null unless running. */
  segStart: number | null
}

export function idleState(subject: string, targetMin = DEFAULT_TARGET_MIN): TimerState {
  return { status: 'idle', subject, targetMs: targetMin * MIN, sessionId: null, startedAt: null, acc: 0, segStart: null }
}

export function elapsedMs(s: TimerState, now: number): number {
  return s.acc + (s.status === 'running' && s.segStart != null ? Math.max(0, now - s.segStart) : 0)
}

export function remainingMs(s: TimerState, now: number): number {
  return Math.max(0, s.targetMs - elapsedMs(s, now))
}

/** 0 to 1 for the ring. */
export function progress(s: TimerState, now: number): number {
  return s.targetMs > 0 ? Math.min(1, elapsedMs(s, now) / s.targetMs) : 0
}

export function isComplete(s: TimerState, now: number): boolean {
  return s.status !== 'idle' && elapsedMs(s, now) >= s.targetMs
}

/** Begin a session. `startedAt` is the row's started_at. */
export function begin(s: TimerState, sessionId: string, startedAt: number): TimerState {
  return { ...s, status: 'running', sessionId, startedAt, acc: 0, segStart: startedAt }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s
  return { ...s, status: 'paused', acc: Math.min(s.targetMs, elapsedMs(s, now)), segStart: null }
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s
  return { ...s, status: 'running', segStart: now }
}

/**
 * What to write to ended_at when a session finishes. The minutes column is generated from
 * started_at and ended_at, so ending at started_at + focused time makes it count focus only, never paused time.
 * Capped at the target so a tab left open overnight does not log eight hours.
 */
export function endedAt(s: TimerState, now: number): number {
  if (s.startedAt == null) return now
  return s.startedAt + Math.min(s.targetMs, elapsedMs(s, now))
}

/** Rebuild from storage. Returns null for anything that is not a valid state. */
export function parseState(raw: string | null): TimerState | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<TimerState>
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
    if (o.status !== 'idle' && o.status !== 'running' && o.status !== 'paused') return null
    if (typeof o.subject !== 'string' || !o.subject || !num(o.targetMs) || !num(o.acc)) return null
    if (o.status !== 'idle' && (typeof o.sessionId !== 'string' || !num(o.startedAt))) return null
    if (o.status === 'running' && !num(o.segStart)) return null
    return {
      status: o.status,
      subject: o.subject,
      targetMs: o.targetMs as number,
      sessionId: o.sessionId ?? null,
      startedAt: o.startedAt ?? null,
      acc: o.acc as number,
      segStart: o.status === 'running' ? (o.segStart as number) : null,
    }
  } catch {
    return null
  }
}

/* ---------- Subjects ---------- */

export type SubjectKey = 'hb' | 'chem' | 'meth' | 'spec' | 'english' | 'religion'

/** Map a name from the database or TickTick ("Human Biology", "Specialist 3C", "Religion & Life") to a subject key. */
export function subjectKey(name: string): SubjectKey | null {
  const n = name.toLowerCase()
  if (/\b(hb|bio)/.test(n)) return 'hb'
  if (n.includes('chem')) return 'chem'
  if (n.includes('meth')) return 'meth'
  if (n.includes('spec')) return 'spec'
  if (n.includes('eng')) return 'english'
  if (n.includes('relig')) return 'religion'
  return null
}

/** Short name for the compact pill, which only has room for about 9 characters. */
export function shortSubject(name: string): string {
  const k = subjectKey(name)
  if (k === 'hb') return 'Human Bio'
  if (k === 'religion') return 'Religion'
  return name.length > 10 ? name.slice(0, 9).trimEnd() + '.' : name
}

/** The six subjects, in the order the chips show them. */
export const SUBJECT_LIST: { key: SubjectKey; name: string }[] = [
  { key: 'hb', name: 'Human Biology' },
  { key: 'chem', name: 'Chemistry' },
  { key: 'meth', name: 'Methods' },
  { key: 'spec', name: 'Specialist' },
  { key: 'english', name: 'English' },
  { key: 'religion', name: 'Religion' },
]

/* ---------- This week, and who is furthest behind ---------- */

export interface SessionLike { subject: string; started_at: string; minutes: number | null }
export interface TestLike { subject: string; title: string; due_at: string }

/**
 * Weekly goal for a subject with a test coming up, in minutes.
 * Test within 7 days: 120. Within 21 days: 60. Further out or no test: no goal, so it is never flagged.
 */
export function weeklyGoal(daysToTest: number | null): number | null {
  if (daysToTest == null) return null
  if (daysToTest <= 7) return 120
  if (daysToTest <= 21) return 60
  return null
}

export interface SubjectWeek {
  subject: string
  key: SubjectKey | null
  minutes: number
  /** Next test for this subject, if any. */
  test: TestLike | null
  /** Whole days from `now` to the test, rounded up, never below 0. */
  daysToTest: number | null
  goal: number | null
  /** Minutes still needed to reach the goal. 0 when there is no goal or it is met. */
  deficit: number
}

export interface WeekSummary {
  from: Date
  to: Date
  totalMinutes: number
  subjects: SubjectWeek[]
  /** The subject furthest behind for its next test, or null when everyone with a test is on track. */
  behind: SubjectWeek | null
}

/** Group sessions by canonical subject, so "Human Biology" and "Human Bio" land in one bar. */
function canonical(name: string): string {
  const k = subjectKey(name)
  return k ? SUBJECT_LIST.find((s) => s.key === k)!.name : name
}

export function summariseWeek(sessions: SessionLike[], tests: TestLike[], now: Date): WeekSummary {
  const from = perthWeekStart(now)
  const to = new Date(from.getTime() + 7 * DAY)
  const minutes = new Map<string, number>()
  for (const s of sessions) {
    const t = Date.parse(s.started_at)
    if (t < from.getTime() || t >= to.getTime()) continue
    const name = canonical(s.subject)
    minutes.set(name, (minutes.get(name) ?? 0) + (s.minutes ?? 0))
  }

  // Soonest upcoming test per subject.
  const nextTest = new Map<string, TestLike>()
  for (const t of [...tests].sort((a, b) => a.due_at.localeCompare(b.due_at))) {
    if (Date.parse(t.due_at) <= now.getTime()) continue
    const name = canonical(t.subject)
    if (!nextTest.has(name)) nextTest.set(name, t)
  }

  const names = new Set<string>([...SUBJECT_LIST.map((s) => s.name), ...minutes.keys(), ...nextTest.keys()])
  const subjects: SubjectWeek[] = [...names].map((subject) => {
    const test = nextTest.get(subject) ?? null
    const daysToTest = test ? Math.max(0, Math.ceil((Date.parse(test.due_at) - now.getTime()) / DAY)) : null
    const goal = weeklyGoal(daysToTest)
    const mins = minutes.get(subject) ?? 0
    return { subject, key: subjectKey(subject), minutes: mins, test, daysToTest, goal, deficit: goal == null ? 0 : Math.max(0, goal - mins) }
  })

  // Bars: busiest first, then subjects with a test, then the usual chip order.
  const order = (s: SubjectWeek) => SUBJECT_LIST.findIndex((x) => x.name === s.subject)
  subjects.sort((a, b) => b.minutes - a.minutes || Number(!!b.test) - Number(!!a.test) || order(a) - order(b))

  // Furthest behind = biggest shortfall against its goal. A sooner test wins a tie.
  const behind = subjects
    .filter((s) => s.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit || (a.daysToTest ?? 99) - (b.daysToTest ?? 99))[0] ?? null

  return { from, to, totalMinutes: [...minutes.values()].reduce((a, b) => a + b, 0), subjects, behind }
}
