import type { Shift, StudySession, Test } from '../types'
import { getNextShift, getNextTest, getShiftsBetween, getStudySessionsBetween, getTestsBetween, perthWeekBounds } from './db'
import { DEFAULT_TRAVEL_MINUTES, perthDayBounds } from './now-model'
import { supabaseBackend } from '../supabase'
import { PREFIX, readThrough } from './offline-cache'
import { connectivity } from './connectivity'

// Everything the Now panel reads, in one load. The source is swappable so the dev preview can use fixtures.

export interface NowData {
  shift: Shift | null
  test: Test | null
  /** Shifts, tests and study sessions for today (Perth). */
  today: { shifts: Shift[]; tests: Test[]; sessions: StudySession[] }
  /** Study sessions this Perth week (Monday to Sunday), for the next test's study minutes. */
  weekSessions: StudySession[]
}

export interface NowSource {
  load(now: Date): Promise<NowData>
  /** Called when shifts change in the database. Returns unsubscribe. */
  onChange(cb: () => void): () => void
}

const loadNow = async (now: Date): Promise<NowData> => {
    const day = perthDayBounds(now)
    const week = perthWeekBounds(now)
    const [shift, test, shifts, tests, weekSessions] = await Promise.all([
      getNextShift(now),
      getNextTest(now),
      getShiftsBetween(day.from, day.to),
      getTestsBetween(day.from, day.to),
      getStudySessionsBetween(week.from, week.to),
    ])
    const sessions = weekSessions.filter((s) => {
      const t = new Date(s.started_at).getTime()
      return t >= day.from.getTime() && t < day.to.getTime()
    })
    return { shift, test, today: { shifts, tests, sessions }, weekSessions }
}

// Card 29: the last answer is kept, so the Now panel fills at once with the Wi-Fi off.
export const supabaseNowSource: NowSource = {
  load: (now) => readThrough(PREFIX + 'now', () => loadNow(now), { online: () => connectivity.offline() === false, report: connectivity.report }),
  onChange: (cb) => supabaseBackend.onShiftsChange(cb),
}

const TRAVEL_KEY = 'halo.travelMinutes'

/** Travel minutes for the leave-by time. Default 25. There is no column for it yet, so it lives on this device. */
export function getTravelMinutes(): number {
  try {
    const n = Number(localStorage.getItem(TRAVEL_KEY))
    if (Number.isFinite(n) && n >= 0 && n <= 240 && localStorage.getItem(TRAVEL_KEY) !== null) return Math.round(n)
  } catch { /* private mode */ }
  return DEFAULT_TRAVEL_MINUTES
}
