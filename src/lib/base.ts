// Card 29: the Base tab's pure logic. No DOM, so it can be unit tested. Everything is in Perth time (HALO.md: always
// Australia/Perth, UTC+8, no daylight saving). The look comes from design/prototype/base-tab.html.

import type { Settings, Shift } from '../types'
import { calcWeek, perthWeekStart } from './pay.ts'

const MIN = 60_000
const DAY = 86_400_000
const PERTH_OFFSET = 8 * 3_600_000

/** Perth, where the sun times are worked out. */
export const PERTH = { lat: -31.95, lon: 115.86 }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface PerthParts { y: number; m: number; d: number; dow: number; h: number; min: number; sec: number }
/** The calendar date and clock time in Perth for an instant. `m` is 1 to 12 and `dow` is 0 for Sunday. */
export function perthParts(t: number | Date): PerthParts {
  const ms = (typeof t === 'number' ? t : t.getTime()) + PERTH_OFFSET
  const u = new Date(ms)
  return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate(), dow: u.getUTCDay(), h: u.getUTCHours(), min: u.getUTCMinutes(), sec: u.getUTCSeconds() }
}

/** The big clock: `7` and `45`, twelve hour with no leading zero on the hour. */
export function clockParts(t: number | Date): { h: string; m: string } {
  const p = perthParts(t)
  return { h: String(p.h % 12 || 12), m: String(p.min).padStart(2, '0') }
}

/** `Monday 23 November`. */
export function dateLine(t: number | Date): string {
  const p = perthParts(t)
  return `${DAYS[p.dow]} ${p.d} ${MONTHS[p.m - 1]}`
}

/** `Good evening, Liam`. Morning to 11:59, afternoon to 4:59 pm, then evening. */
export function greeting(t: number | Date, name = 'Liam'): string {
  const h = perthParts(t).h
  return `Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}, ${name}`
}

// ---- Sun ----------------------------------------------------------------------------------------------------------

/** Minutes after Perth midnight for sunrise and sunset on a calendar date. NOAA's low precision method, good to a minute or two. */
export function sunTimes(y: number, m: number, d: number, lat = PERTH.lat, lon = PERTH.lon): { rise: number; set: number } {
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY) + 1
  const g = ((2 * Math.PI) / 365) * (n - 1)
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const la = (lat * Math.PI) / 180
  const cosH = Math.cos((90.833 * Math.PI) / 180) / (Math.cos(la) * Math.cos(decl)) - Math.tan(la) * Math.tan(decl)
  const ha = (Math.acos(Math.max(-1, Math.min(1, cosH))) * 180) / Math.PI
  const utcRise = 720 - 4 * (lon + ha) - eq
  const utcSet = 720 - 4 * (lon - ha) - eq
  return { rise: utcRise + 480, set: utcSet + 480 }
}

/** `7:14` and `PM` from minutes after midnight. */
export function fmtHm(mins: number): { t: string; ap: 'AM' | 'PM' } {
  const total = Math.round(((mins % 1440) + 1440) % 1440)
  const h = Math.floor(total / 60)
  return { t: `${h % 12 || 12}:${String(total % 60).padStart(2, '0')}`, ap: h < 12 ? 'AM' : 'PM' }
}

export interface SunState {
  /** The sun is above the horizon right now. */
  up: boolean
  /** How far along the day, 0 at sunrise to 1 at sunset (0 or 1 while it is down). Where the dot sits on the curve. */
  t: number
  /** The next event, which is the big line: `Sunset` by day, `Sunrise` at night. */
  next: 'Sunrise' | 'Sunset'
  nextTime: string
  nextAp: 'AM' | 'PM'
  /** The small line under the curve: the other event, `Sunrise 5:08 AM`. */
  other: string
}

export function sunState(now: number | Date): SunState {
  const p = perthParts(now)
  const mins = p.h * 60 + p.min + p.sec / 60
  const today = sunTimes(p.y, p.m, p.d)
  const at = (offsetDays: number) => { const u = new Date(Date.UTC(p.y, p.m - 1, p.d + offsetDays)); return sunTimes(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate()) }
  const word = (name: 'Sunrise' | 'Sunset', m: number) => { const f = fmtHm(m); return `${name} ${f.t} ${f.ap}` }
  if (mins >= today.rise && mins < today.set) {
    const f = fmtHm(today.set)
    return { up: true, t: (mins - today.rise) / (today.set - today.rise), next: 'Sunset', nextTime: f.t, nextAp: f.ap, other: word('Sunrise', today.rise) }
  }
  if (mins < today.rise) {
    const f = fmtHm(today.rise)
    return { up: false, t: 0, next: 'Sunrise', nextTime: f.t, nextAp: f.ap, other: word('Sunset', at(-1).set) }
  }
  const f = fmtHm(at(1).rise)
  return { up: false, t: 1, next: 'Sunrise', nextTime: f.t, nextAp: f.ap, other: word('Sunset', today.set) }
}

/** The curve under the sunset time: a baseline, the arc, and a glowing dot where the sun is (resting on the line at night). */
export function sunCurve(s: SunState): string {
  const x = 4 + s.t * 102
  const y = s.up ? 28 - Math.sin(s.t * Math.PI) * 24 : 28
  return `<line x1="0" x2="110" y1="28" y2="28" stroke="rgba(255,255,255,.25)"/><path d="M4 28 Q55 -20 106 28" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.3"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#fff" style="filter:drop-shadow(0 0 4px #fff)"/>`
}

/** The sun and moon in the weather card (a 32 grid). The island's time mode uses the same drawings, smaller. */
export const SUN_SVG = '<circle cx="16" cy="16" r="6" fill="#ffd98a"/><g stroke="#ffd98a" stroke-width="2" stroke-linecap="round"><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.1 2.1M23.1 23.1l2.1 2.1M6.8 25.2l2.1-2.1M23.1 8.9l2.1-2.1"/></g>'
export const MOON_SVG = '<path d="M24 19A10 10 0 0 1 12 6a10 10 0 1 0 12 13z" fill="#dfe6ff"/><circle cx="24" cy="8" r="1" fill="#fff"/><circle cx="27" cy="13" r=".7" fill="#fff"/>'

// ---- Weather ------------------------------------------------------------------------------------------------------

/** The words under the temperature. Open-Meteo says "Clear", which reads as "Sunny" by day and "Clear night" after dark. */
export function weatherWords(desc: string, up: boolean): string {
  if (desc === 'Clear') return up ? 'Sunny' : 'Clear night'
  return desc
}

// ---- Last 7 days of pay -------------------------------------------------------------------------------------------

export interface SevenDays {
  /** Dollars earned over the 7 days, rounded. */
  gross: number
  /** Paid hours over the 7 days. */
  hours: number
  /** Bar heights, 0 to 100, oldest day first and today last. The biggest day is 100. */
  bars: number[]
  /** One letter per bar. */
  letters: string[]
}

const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * What Liam earned in the 7 days up to and including today (Perth). Only shifts that have started count, so a shift later
 * today is not in it yet. Shifts from the previous Monday on are needed, so pass two weeks' worth.
 */
export function lastSevenDays(shifts: Shift[], settings: Settings, now: number | Date): SevenDays {
  const t = typeof now === 'number' ? now : now.getTime()
  const done = shifts.filter((s) => Date.parse(s.starts_at) <= t)
  const thisWeek = calcWeek(done, perthWeekStart(new Date(t)), settings)
  const lastWeek = calcWeek(done, perthWeekStart(new Date(t), -1), settings)
  const all = [...lastWeek.days, ...thisWeek.days]
  const today = 7 + Math.round((Math.floor((t + PERTH_OFFSET) / DAY) * DAY - PERTH_OFFSET - thisWeek.start.getTime()) / DAY)
  const win = all.slice(today - 6, today + 1)
  const top = Math.max(...win.map((d) => d.gross), 0)
  return {
    gross: Math.round(win.reduce((n, d) => n + d.gross, 0)),
    hours: win.reduce((n, d) => n + d.hours, 0),
    bars: win.map((d) => (top > 0 ? Math.round((d.gross / top) * 100) : 0)),
    letters: win.map((d) => LETTER[perthParts(d.date.getTime() + 12 * 3_600_000).dow]),
  }
}

/** `24.8 h`, or `25 h` when it is whole. */
export const fmtHours = (h: number): string => `${Number(h.toFixed(1))} h`

// ---- Music progress -----------------------------------------------------------------------------------------------

/** `1:21` for elapsed and `-1:45` for what is left. The minus is a real minus sign. */
export function fmtElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const fmtLeft = (pos: number, dur: number): string => `−${fmtElapsed(Math.max(0, dur - pos))}`

export const MINUTE = MIN
