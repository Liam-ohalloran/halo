import type { Settings, Shift } from './types'

const HOUR = 36e5

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Monday 00:00 local of the pay week containing `d`, shifted by `offset` weeks. */
export function weekStart(d: Date, offset = 0): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const sinceMonday = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - sinceMonday + offset * 7)
  return x
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Hourly rate for time worked on `day`. Sunday and public holiday multiply the weekday rate. */
export function rateFor(day: Date, publicHoliday: boolean, s: Settings): number {
  if (publicHoliday) return s.weekday_rate * s.public_holiday_multiplier
  const dow = day.getDay()
  if (dow === 0) return s.weekday_rate * s.sunday_multiplier
  if (dow === 6) return s.saturday_rate
  return s.weekday_rate
}

export interface DayPay {
  date: Date
  hours: number
  gross: number
}
export interface WeekPay {
  start: Date
  end: Date
  days: DayPay[]
  hours: number
  gross: number
  shifts: number
}

/**
 * Hours and gross for the Monday-to-Sunday week starting at `start`.
 * Shifts are clipped to the week and split at midnight so each piece gets its own day's rate.
 */
export function computeWeek(shifts: Shift[], start: Date, s: Settings): WeekPay {
  const end = addDays(start, 7)
  const days: DayPay[] = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), hours: 0, gross: 0 }))
  let counted = 0
  for (const sh of shifts) {
    let a = Math.max(start.getTime(), new Date(sh.starts_at).getTime())
    const b = Math.min(end.getTime(), new Date(sh.ends_at).getTime())
    if (!(b > a)) continue
    counted++
    while (a < b) {
      const dayStart = startOfDay(new Date(a))
      const next = addDays(dayStart, 1).getTime()
      const seg = Math.min(next, b)
      const idx = Math.round((dayStart.getTime() - start.getTime()) / (24 * HOUR))
      const day = days[Math.min(6, Math.max(0, idx))]
      const hrs = (seg - a) / HOUR
      day.hours += hrs
      day.gross += hrs * rateFor(dayStart, sh.is_public_holiday, s)
      a = seg
    }
  }
  const hours = days.reduce((t, d) => t + d.hours, 0)
  const gross = days.reduce((t, d) => t + d.gross, 0)
  return { start, end, days, hours, gross, shifts: counted }
}

/* ---------- formatting ---------- */

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
export const fmtMoney = (n: number) => money.format(n)

export function fmtHours(h: number): string {
  const r = Math.round(h * 4) / 4
  return `${Number.isInteger(r) ? r : r.toFixed(2).replace(/0$/, '')}h`
}

const dayFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' })
export const fmtDay = (d: Date) => dayFmt.format(d)
export const fmtTime = (d: Date) => timeFmt.format(d).replace(' ', ' ').toLowerCase()

export function fmtWhen(d: Date, now = new Date()): string {
  const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / (24 * HOUR))
  const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : fmtDay(d)
  return `${label} · ${fmtTime(d)}`
}

/** Short countdown parts, e.g. [["2","d"],["4","h"]] or [["12","m"],["05","s"]] under an hour. */
export function countdownParts(ms: number): [string, string][] {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return [[String(d), 'd'], [String(h), 'h']]
  if (h > 0) return [[String(h), 'h'], [String(m).padStart(2, '0'), 'm']]
  return [[String(m), 'm'], [String(sec).padStart(2, '0'), 's']]
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
