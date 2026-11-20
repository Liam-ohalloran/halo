// Pay maths for the Pay panel (HALO.md section 4). Pure functions, no UI, no Supabase.
// Everything is calculated in Perth time (UTC+8, no daylight saving) so the answer is the
// same whatever time zone the browser or test runner is in.

import type { Settings } from '../types'

const HOUR = 36e5
const DAY = 24 * HOUR
const PERTH_OFFSET = 8 * HOUR

/** A shift needs only these fields. The database `Shift` row fits. */
export interface PayShift {
  id?: string
  title?: string
  starts_at: string
  ends_at: string
  is_public_holiday: boolean
}

/** Unpaid break: 30 minutes on any shift longer than 5 hours. */
export const BREAK_THRESHOLD_HOURS = 5
export const BREAK_HOURS = 0.5

/** Tax estimate: 15 cents per dollar earned over $350 in the week. */
export const TAX_FREE_THRESHOLD = 350
export const TAX_RATE = 0.15

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/* ---------- Perth week helpers ---------- */

/** Instant of the Perth midnight at or before `ms`. */
function perthMidnight(ms: number): number {
  return Math.floor((ms + PERTH_OFFSET) / DAY) * DAY - PERTH_OFFSET
}

/** Day of week in Perth, 0 = Sunday. */
function perthDow(dayStartMs: number): number {
  // 1970-01-01 was a Thursday (4).
  const days = Math.round((dayStartMs + PERTH_OFFSET) / DAY)
  return (((days + 4) % 7) + 7) % 7
}

/** Monday 00:00 Perth of the pay week containing `d`, moved by `offset` weeks. */
export function perthWeekStart(d: Date, offset = 0): Date {
  const midnight = perthMidnight(d.getTime())
  const sinceMonday = (perthDow(midnight) + 6) % 7
  return new Date(midnight - sinceMonday * DAY + offset * 7 * DAY)
}

/* ---------- rates ---------- */

/** Hourly rate for the Perth day starting at `dayStartMs`. A public holiday replaces the Sunday rate, it does not stack. */
export function hourlyRate(dayStartMs: number, publicHoliday: boolean, s: Settings): number {
  if (publicHoliday) return s.weekday_rate * s.public_holiday_multiplier
  const dow = perthDow(dayStartMs)
  if (dow === 0) return s.weekday_rate * s.sunday_multiplier
  if (dow === 6) return s.saturday_rate
  return s.weekday_rate
}

/** Paid hours for a shift of `grossHours`: 30 minutes off when it runs over 5 hours. */
export function paidHours(grossHours: number): number {
  return grossHours > BREAK_THRESHOLD_HOURS ? grossHours - BREAK_HOURS : Math.max(0, grossHours)
}

/** Tax estimate for a week's gross pay, to the cent. */
export function estimateTax(gross: number): number {
  return round2(Math.max(0, gross - TAX_FREE_THRESHOLD) * TAX_RATE)
}

/* ---------- one shift ---------- */

export interface PaySegment {
  /** Perth midnight that starts this piece's day. */
  day: Date
  hours: number
  rate: number
  pay: number
}

export interface ShiftPay {
  shift: PayShift
  /** Clock hours from start to finish. */
  clockHours: number
  /** Unpaid break taken off (0 or 0.5). */
  breakHours: number
  /** Hours actually paid. */
  hours: number
  /** Pay to the cent. */
  pay: number
  /** The shift split at Perth midnight so each piece gets its own day's rate. */
  segments: PaySegment[]
}

/**
 * Pay for one whole shift. A shift that crosses midnight is split so each side gets its own
 * day's rate. The unpaid break comes off the start of the shift.
 */
export function calcShift(shift: PayShift, s: Settings): ShiftPay {
  const a0 = new Date(shift.starts_at).getTime()
  const b = new Date(shift.ends_at).getTime()
  const clockHours = b > a0 ? (b - a0) / HOUR : 0
  const breakHours = clockHours > BREAK_THRESHOLD_HOURS ? BREAK_HOURS : 0
  let breakLeft = breakHours
  const segments: PaySegment[] = []
  let a = a0
  while (a < b) {
    const dayStart = perthMidnight(a)
    const seg = Math.min(dayStart + DAY, b)
    let hours = (seg - a) / HOUR
    const cut = Math.min(breakLeft, hours)
    hours -= cut
    breakLeft -= cut
    const rate = hourlyRate(dayStart, shift.is_public_holiday, s)
    segments.push({ day: new Date(dayStart), hours, rate, pay: hours * rate })
    a = seg
  }
  const hours = segments.reduce((t, g) => t + g.hours, 0)
  const pay = round2(segments.reduce((t, g) => t + g.pay, 0))
  return { shift, clockHours, breakHours, hours, pay, segments }
}

/* ---------- one week ---------- */

export interface DayTotal {
  /** Perth midnight. */
  date: Date
  hours: number
  gross: number
}

export interface WeekShiftPay {
  shift: PayShift
  /** Paid hours that fall inside this week. */
  hours: number
  /** Pay that falls inside this week, to the cent. */
  pay: number
}

export interface WeekPay {
  /** Monday 00:00 Perth. */
  start: Date
  /** Next Monday 00:00 Perth. */
  end: Date
  days: DayTotal[]
  shifts: WeekShiftPay[]
  hours: number
  gross: number
  tax: number
  net: number
}

/**
 * Hours, gross, tax estimate and after tax pay for the Monday to Sunday week starting at `weekStart`.
 * A shift that straddles the week boundary only counts the part inside the week. The break is
 * decided on the whole shift, so a 6 hour shift always loses its 30 minutes.
 */
export function calcWeek(shifts: PayShift[], weekStart: Date, s: Settings): WeekPay {
  const startMs = weekStart.getTime()
  const endMs = startMs + 7 * DAY
  const days: DayTotal[] = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(startMs + i * DAY),
    hours: 0,
    gross: 0,
  }))
  const list: WeekShiftPay[] = []

  for (const shift of shifts) {
    const sp = calcShift(shift, s)
    let hours = 0
    let pay = 0
    for (const seg of sp.segments) {
      const t = seg.day.getTime()
      if (t < startMs || t >= endMs) continue
      const day = days[Math.round((t - startMs) / DAY)]
      day.hours += seg.hours
      day.gross += seg.pay
      hours += seg.hours
      pay += seg.pay
    }
    if (hours > 0) list.push({ shift, hours, pay: round2(pay) })
  }

  list.sort((x, y) => new Date(x.shift.starts_at).getTime() - new Date(y.shift.starts_at).getTime())
  for (const d of days) d.gross = round2(d.gross)
  const gross = round2(list.reduce((t, x) => t + x.pay, 0))
  const tax = estimateTax(gross)
  return {
    start: new Date(startMs),
    end: new Date(endMs),
    days,
    shifts: list,
    hours: days.reduce((t, d) => t + d.hours, 0),
    gross,
    tax,
    net: round2(gross - tax),
  }
}

/* ---------- the Pay tab's charging bar and curve (card 16) ---------- */

/** Hours at which the charging bar turns to overtime stripes, and the full width of the bar. */
export const CHARGE_OT_HOURS = 10
export const CHARGE_MAX_HOURS = 24
/** Overtime pays this much extra an hour on hours past 10 in a pay week (from the payslip). */
export const OT_EXTRA_RATE = 2

/** The bar is 24 hours wide, or hours + 2 when the week is bigger, so the knob never runs off the end. */
export const chargeScale = (hours: number): number => Math.max(CHARGE_MAX_HOURS, hours + 2)

/** Gross pay banked by the end of each day of the week, Monday first. The last value is the week's gross. */
export function cumulativeGross(week: WeekPay): number[] {
  let run = 0
  return week.days.map((d) => { run += d.gross; return round2(run) })
}

/** The charging bar as fractions of its full width: solid up to 10 hours, stripes past it. `scale` is the bar's width in hours. */
export function chargeBar(hours: number): { base: number; over: number; scale: number } {
  const h = Math.max(0, hours)
  const scale = chargeScale(h)
  return { base: Math.min(h, CHARGE_OT_HOURS) / scale, over: Math.max(0, h - CHARGE_OT_HOURS) / scale, scale }
}

/** The extra overtime pays: $2 an hour on hours past 10 in the week. Not the pay for those hours. Zero at 10 hours or under. */
export function overtimePay(week: WeekPay): number {
  return round2(Math.max(0, week.hours - CHARGE_OT_HOURS) * OT_EXTRA_RATE)
}

/** What an hour on a Sunday pays. */
export const sundayRate = (s: Settings): number => round2(s.weekday_rate * s.sunday_multiplier)
