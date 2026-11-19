// The small grey line next to each tab's title in the shell header (Home2, Pay3, Study3, Sixers2, Week boards).
// Pure, so it can be unit tested. Everything is Australia/Perth (UTC+8, no daylight saving).

import type { TabId } from '../styles/tabs'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const PERTH = 8 * HOUR
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Midnight in Perth for the day containing `now`, as a UTC millisecond count shifted into Perth time. */
const perthMidnight = (now: Date): number => Math.floor((now.getTime() + PERTH) / DAY) * DAY
const parts = (shiftedMs: number) => { const d = new Date(shiftedMs); return { dow: d.getUTCDay(), day: d.getUTCDate(), mon: d.getUTCMonth() } }

/** "Wed 18 Nov" */
export function dayLabel(now: Date): string {
  const p = parts(perthMidnight(now))
  return `${DAYS[p.dow]} ${p.day} ${MONTHS[p.mon]}`
}

/** "16 to 22 Nov", or "30 Nov to 6 Dec" when the range crosses a month. */
export function rangeLabel(fromMs: number, days: number): string {
  const a = parts(fromMs)
  const b = parts(fromMs + (days - 1) * DAY)
  return a.mon === b.mon ? `${a.day} to ${b.day} ${MONTHS[b.mon]}` : `${a.day} ${MONTHS[a.mon]} to ${b.day} ${MONTHS[b.mon]}`
}

/** Monday of the Perth week containing `now` (the pay week runs Monday to Sunday, HALO.md section 4). */
export const weekStart = (now: Date): number => {
  const mid = perthMidnight(now)
  return mid - ((parts(mid).dow + 6) % 7) * DAY
}

/** The header meta for a tab. Tabs with nothing to say yet return an empty string. */
export function tabMeta(id: TabId, now: Date): string {
  switch (id) {
    case 'home':
    case 'sixers': return dayLabel(now)
    case 'pay': return rangeLabel(weekStart(now), 7)
    case 'study': { const p = parts(weekStart(now)); return `Week of ${p.day} ${MONTHS[p.mon]}` }
    case 'week': return rangeLabel(perthMidnight(now), 7)
    default: return ''
  }
}
