import { supabase } from './supabase'
import type { Settings, Shift, StudySession, Test } from '../types'
import { DEFAULT_SETTINGS } from '../types'

const SHIFT_COLS = 'id,title,station,starts_at,ends_at,is_public_holiday,ticktick_id'
const TEST_COLS = 'id,subject,title,due_at,ticktick_id'
const SESSION_COLS = 'id,subject,started_at,ended_at,minutes'

const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000 // Australia/Perth is UTC+8 all year, no daylight saving.
const DAY_MS = 24 * 60 * 60 * 1000

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** Monday 00:00 to next Monday 00:00 in Perth time, for the week containing `date`. */
export function perthWeekBounds(date: Date): { from: Date; to: Date } {
  const perth = new Date(date.getTime() + PERTH_OFFSET_MS)
  const sinceMonday = (perth.getUTCDay() + 6) % 7
  const mondayPerthMidnight = Date.UTC(perth.getUTCFullYear(), perth.getUTCMonth(), perth.getUTCDate()) - sinceMonday * DAY_MS
  const from = new Date(mondayPerthMidnight - PERTH_OFFSET_MS)
  return { from, to: new Date(from.getTime() + 7 * DAY_MS) }
}

export type ShiftRow = Shift & { ticktick_id: string | null }
export type TestRow = Test & { ticktick_id: string | null }

/** Shifts that overlap the Perth Monday to Sunday week containing `date`. */
export async function getShiftsForWeek(date: Date = new Date()): Promise<ShiftRow[]> {
  const { from, to } = perthWeekBounds(date)
  return must(
    await supabase
      .from('shifts')
      .select(SHIFT_COLS)
      .lt('starts_at', to.toISOString())
      .gt('ends_at', from.toISOString())
      .order('starts_at'),
  ) as ShiftRow[]
}

/** The shift happening now, or else the next one. */
export async function getNextShift(now: Date = new Date()): Promise<ShiftRow | null> {
  const rows = must(
    await supabase.from('shifts').select(SHIFT_COLS).gt('ends_at', now.toISOString()).order('starts_at').limit(1),
  ) as ShiftRow[]
  return rows[0] ?? null
}

export async function getNextTest(now: Date = new Date()): Promise<TestRow | null> {
  const rows = must(
    await supabase.from('tests').select(TEST_COLS).gt('due_at', now.toISOString()).order('due_at').limit(1),
  ) as TestRow[]
  return rows[0] ?? null
}

export async function startStudySession(subject: string): Promise<StudySession> {
  return must(
    await supabase
      .from('study_sessions')
      .insert({ subject, started_at: new Date().toISOString() })
      .select(SESSION_COLS)
      .single(),
  ) as StudySession
}

export async function endStudySession(id: string): Promise<StudySession> {
  return must(
    await supabase
      .from('study_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', id)
      .select(SESSION_COLS)
      .single(),
  ) as StudySession
}

/** Pay rates from the settings table. Falls back to column defaults until a row exists. */
export async function getSettings(): Promise<Settings> {
  const row = must(
    await supabase
      .from('settings')
      .select('weekday_rate,saturday_rate,sunday_multiplier,public_holiday_multiplier')
      .maybeSingle(),
  ) as Record<keyof Settings, number | string> | null
  if (!row) return { ...DEFAULT_SETTINGS }
  return {
    weekday_rate: Number(row.weekday_rate),
    saturday_rate: Number(row.saturday_rate),
    sunday_multiplier: Number(row.sunday_multiplier),
    public_holiday_multiplier: Number(row.public_holiday_multiplier),
  }
}
