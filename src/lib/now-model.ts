// Pure logic for the Now panel (card 06). No network and no DOM, so it can be unit tested.
// Every time here is Australia/Perth (UTC+8, no daylight saving), whatever the device clock says.

import type { Shift, StudySession, Test } from '../types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const PERTH = 8 * HOUR

export const DEFAULT_TRAVEL_MINUTES = 25
/** A shift counts as "soon" inside this window, and the compact pill appears. */
export const SOON_MS = 2 * HOUR
/** The countdown ring fills over this long before a shift starts. */
export const RING_WINDOW_MS = 6 * HOUR

// ---- Perth clock ------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const shifted = (t: number | Date): Date => new Date((typeof t === 'number' ? t : t.getTime()) + PERTH)

/** Midnight to midnight in Perth for the day containing `t`. */
export function perthDayBounds(t: number | Date): { from: Date; to: Date } {
  const p = shifted(t)
  const from = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()) - PERTH
  return { from: new Date(from), to: new Date(from + DAY) }
}

/** Whole Perth calendar days from `now` to `t`. 0 is today, 1 is tomorrow, negative is past. */
export function perthDaysBetween(now: number | Date, t: number | Date): number {
  return Math.round((perthDayBounds(t).from.getTime() - perthDayBounds(now).from.getTime()) / DAY)
}

/** `5:30 pm` in prose. */
export function fmtClockPm(t: number | Date): string {
  const p = shifted(t)
  const h = p.getUTCHours()
  const m = p.getUTCMinutes()
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** `Sat 21 Nov`. */
export function fmtDayMonth(t: number | Date): string {
  const p = shifted(t)
  return `${DAYS[p.getUTCDay()]} ${p.getUTCDate()} ${MONTHS[p.getUTCMonth()]}`
}

/** `Today`, `Tomorrow`, or `Sat 21 Nov`. */
export function fmtDayLabel(now: number | Date, t: number | Date): string {
  const d = perthDaysBetween(now, t)
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : fmtDayMonth(t)
}

// ---- Countdowns -------------------------------------------------------------

/** `2d`, `1:42`, `42m`, or `0m`. Minute resolution, rounded up so it never says 0 early. */
export function fmtCountdown(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / MIN))
  if (mins >= 24 * 60) return `${Math.floor(mins / (24 * 60))}d`
  if (mins >= 60) return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
  return `${mins}m`
}

/** `1 h 25 min`, `45 min`. Used for study time. */
export function fmtStudy(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

// ---- Subjects ---------------------------------------------------------------

export type SubjectKey = 'hb' | 'chem' | 'meth' | 'spec' | 'english' | 'religion'

/** Map the subject text from TickTick and study sessions to a chip colour. Unknown subjects return null. */
export function subjectKey(subject: string): SubjectKey | null {
  const s = subject.toLowerCase()
  if (/\bbio|\bhb\b/.test(s)) return 'hb'
  if (/chem/.test(s)) return 'chem'
  if (/meth/.test(s)) return 'meth'
  if (/spec/.test(s)) return 'spec'
  if (/eng/.test(s)) return 'english'
  if (/relig/.test(s)) return 'religion'
  return null
}

const sameSubject = (a: string, b: string): boolean => {
  const ka = subjectKey(a)
  const kb = subjectKey(b)
  return ka && kb ? ka === kb : a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Minutes studied for `subject`. A running session counts up to `now`. */
export function studyMinutesFor(subject: string, sessions: StudySession[], now: number | Date): number {
  const nowMs = typeof now === 'number' ? now : now.getTime()
  let total = 0
  for (const s of sessions) {
    if (!sameSubject(s.subject, subject)) continue
    if (s.minutes != null) total += s.minutes
    else if (!s.ended_at) total += Math.max(0, (nowMs - new Date(s.started_at).getTime()) / MIN)
  }
  return Math.round(total)
}

// ---- Shift ------------------------------------------------------------------

export interface ShiftView {
  shift: Shift
  /** upcoming: not started. live: on shift right now. */
  phase: 'upcoming' | 'live'
  start: number
  end: number
  /** When to leave the house. */
  leaveBy: number
  msToStart: number
  msToEnd: number
  /** Ring fill, 0 to 1. Fills as the shift approaches, or as the shift goes while live. */
  ring: number
  /** Within two hours of the start, or on shift. The compact pill shows. */
  soon: boolean
  /** Text for the pill and ring. */
  countdown: string
  /** `PA shift`. Falls back to `Shift`. */
  pillLabel: string
}

export function shiftView(shift: Shift, now: number | Date, travelMinutes = DEFAULT_TRAVEL_MINUTES): ShiftView {
  const t = typeof now === 'number' ? now : now.getTime()
  const start = new Date(shift.starts_at).getTime()
  const end = new Date(shift.ends_at).getTime()
  const live = t >= start
  const msToStart = Math.max(0, start - t)
  const msToEnd = Math.max(0, end - t)
  const ring = live ? (end > start ? (t - start) / (end - start) : 1) : 1 - Math.min(msToStart, RING_WINDOW_MS) / RING_WINDOW_MS
  const station = shift.station?.trim()
  return {
    shift,
    phase: live ? 'live' : 'upcoming',
    start,
    end,
    leaveBy: start - travelMinutes * MIN,
    msToStart,
    msToEnd,
    ring: Math.min(1, Math.max(0, ring)),
    soon: live || msToStart <= SOON_MS,
    countdown: fmtCountdown(live ? msToEnd : msToStart),
    pillLabel: station ? `${station} shift` : 'Shift',
  }
}

// ---- Test -------------------------------------------------------------------

export interface TestView {
  test: Test
  daysLeft: number
  /** `Today`, `Tomorrow` or `Sat 21 Nov`. */
  when: string
  subject: SubjectKey | null
  studyMinutes: number
}

export function testView(test: Test, sessionsThisWeek: StudySession[], now: number | Date): TestView {
  return {
    test,
    daysLeft: Math.max(0, perthDaysBetween(now, new Date(test.due_at))),
    when: fmtDayLabel(now, new Date(test.due_at)),
    subject: subjectKey(test.subject),
    studyMinutes: studyMinutesFor(test.subject, sessionsThisWeek, now),
  }
}

// ---- Today timeline ---------------------------------------------------------

export type TimelineKind = 'shift' | 'test' | 'study'
export interface TimelineItem {
  kind: TimelineKind
  id: string
  title: string
  /** Second line, e.g. `5:30 pm to 9:00 pm`. */
  sub: string
  /** Start, in ms. */
  at: number
  end: number | null
  subject: SubjectKey | null
  /** past: finished. now: happening. next: still to come. */
  status: 'past' | 'now' | 'next'
}

export interface RawToday {
  shifts: Shift[]
  tests: Test[]
  sessions: StudySession[]
}

/** Today's shifts, tests and study sessions in time order. */
export function buildTimeline(raw: RawToday, now: number | Date): TimelineItem[] {
  const t = typeof now === 'number' ? now : now.getTime()
  const items: TimelineItem[] = []
  for (const s of raw.shifts) {
    const at = new Date(s.starts_at).getTime()
    const end = new Date(s.ends_at).getTime()
    items.push({
      kind: 'shift', id: `shift-${s.id}`, title: s.title, sub: `${fmtClockPm(at)} to ${fmtClockPm(end)}`,
      at, end, subject: null, status: t >= end ? 'past' : t >= at ? 'now' : 'next',
    })
  }
  for (const x of raw.tests) {
    const at = new Date(x.due_at).getTime()
    items.push({
      kind: 'test', id: `test-${x.id}`, title: x.title, sub: `${x.subject}, due ${fmtClockPm(at)}`,
      at, end: null, subject: subjectKey(x.subject), status: t >= at ? 'past' : 'next',
    })
  }
  for (const s of raw.sessions) {
    const at = new Date(s.started_at).getTime()
    const end = s.ended_at ? new Date(s.ended_at).getTime() : null
    const mins = s.minutes ?? Math.max(0, Math.round(((end ?? t) - at) / MIN))
    items.push({
      kind: 'study', id: `study-${s.id}`, title: s.subject, sub: `Study, ${fmtStudy(mins)}`,
      at, end, subject: subjectKey(s.subject), status: end == null ? 'now' : 'past',
    })
  }
  return items.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind))
}
