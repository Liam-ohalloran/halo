import { perthDate, perthDayStart } from './money.ts'

// Widgets (card 22). The pure model for the Widgets tab: countdowns, the year progress dots, the week strip and the daily
// games ticks. All in Perth time so the numbers are the same on the laptop and the phone.

const DAY = 864e5

export interface Countdown {
  id: string
  name: string
  /** yyyy-mm-dd. For a yearly one only the month and day matter. */
  target_date: string
  yearly: boolean
  colour: string
  sort: number
}

/** Put in the table the first time it is empty: Doomsday (once), Liam's birthday and Christmas (every year). */
export const DEFAULT_COUNTDOWNS: Omit<Countdown, 'id'>[] = [
  { name: 'Doomsday', target_date: '2026-12-18', yearly: false, colour: '#ff6b81', sort: 0 },
  { name: 'Birthday', target_date: '2026-12-04', yearly: true, colour: '#FFC23D', sort: 1 },
  { name: 'Christmas', target_date: '2026-12-25', yearly: true, colour: '#30D158', sort: 2 },
]

/** The date a countdown is aiming at: for a yearly one the next time it comes round (today counts). */
export function nextTarget(c: Pick<Countdown, 'target_date' | 'yearly'>, now: Date): string {
  if (!c.yearly) return c.target_date
  const today = perthDate(now)
  const md = c.target_date.slice(5)
  const y = Number(today.slice(0, 4))
  const thisYear = `${y}-${md}`
  return thisYear >= today ? thisYear : `${y + 1}-${md}`
}

/** Whole days until a countdown. Zero on the day, never negative. */
export function daysUntil(c: Pick<Countdown, 'target_date' | 'yearly'>, now: Date): number {
  return Math.max(0, Math.round((perthDayStart(nextTarget(c, now)).getTime() - perthDayStart(perthDate(now)).getTime()) / DAY))
}

const dm = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Perth' })
export const dateLabel = (c: Pick<Countdown, 'target_date' | 'yearly'>, now: Date): string => dm.format(perthDayStart(nextTarget(c, now)))

/** How far through the year it is, 0 to 1, and which of the 52 dots is today. */
export function yearProgress(now: Date): { f: number; dots: number; filled: number } {
  const y = Number(perthDate(now).slice(0, 4))
  const start = perthDayStart(`${y}-01-01`).getTime()
  const end = perthDayStart(`${y + 1}-01-01`).getTime()
  const f = Math.min(1, Math.max(0, (perthDayStart(perthDate(now)).getTime() - start) / (end - start)))
  return { f, dots: 52, filled: Math.min(51, Math.floor(f * 52)) }
}

/** Week of the year, counting from the week with the 1st of January in it, Monday first. 1 to 53. */
export function weekOfYear(now: Date): number {
  const y = Number(perthDate(now).slice(0, 4))
  const jan1 = perthDayStart(`${y}-01-01`).getTime()
  const mondayOfJan1 = jan1 - ((new Date(jan1 + 8 * 36e5).getUTCDay() + 6) % 7) * DAY
  const today = perthDayStart(perthDate(now)).getTime()
  return Math.floor((today - mondayOfJan1) / (7 * DAY)) + 1
}

export interface StripDay { letter: string; day: number; today: boolean }
/** Monday to Sunday of the week containing `now`. */
export function weekStrip(now: Date): StripDay[] {
  const today = perthDate(now)
  const t = perthDayStart(today).getTime()
  const dow = (new Date(t + 8 * 36e5).getUTCDay() + 6) % 7
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(t - dow * DAY + i * DAY + 8 * 36e5)
    return { letter: 'MTWTFSS'[i], day: d.getUTCDate(), today: i === dow }
  })
}

/** The daily games, in the order they show. Ticks are kept per Perth day on this device. */
export const GAMES = ['Amountle', 'Weighsies', 'Puttsies', 'Halfsies']
export const gamesKey = (now: Date): string => `halo.games.${perthDate(now)}`
export function parseTicks(raw: string | null): boolean[] {
  try {
    const a = JSON.parse(raw ?? '[]') as unknown
    return GAMES.map((_, i) => Array.isArray(a) && a[i] === true)
  } catch { return GAMES.map(() => false) }
}

/** "Sat 6:30" for the Next up tile, from an instant. */
const dayFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'Australia/Perth' })
const timeFmt = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'Australia/Perth' })
export const shortWhen = (d: Date): string => `${dayFmt.format(d)} ${timeFmt.format(d).replace(/^0/, '')}`
