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

/* ---------- formatting ---------- */

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
