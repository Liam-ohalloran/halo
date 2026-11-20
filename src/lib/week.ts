// Week tab maths (card 19). Pure functions, no UI, no Supabase, so it can be unit tested.
// Everything is Perth time (UTC+8, no daylight saving), whatever time zone the browser is in.
// The window shows the 7 days from today. Events come from the TickTick sync tables: shifts and tests.
// (Tutoring, sport and Sixers games have no table yet, so they are not drawn. Colours for them are ready in KIND_COLOUR.)

import type { Shift, Test } from '../types'

const HOUR = 36e5
const DAY = 24 * HOUR
const PERTH = 8 * HOUR
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The grid runs 6am to 10pm. Anything before 6am, or without a time, goes in the EARLY row. */
export const DAY_START = 6
export const DAY_END = 22
/** A test only has a due time. It is drawn as a block this long. */
export const TEST_HOURS = 1
/** A block is never shorter than this, so a short event can still be read and tapped. */
export const MIN_BLOCK_HOURS = 0.75
/** The EARLY row shows this many chips, then "+N". */
export const EARLY_MAX = 2

export type Kind = 'shift' | 'tutoring' | 'sport' | 'sixers' | 'test'
export const KIND_COLOUR: Record<Exclude<Kind, 'test'>, string> = { shift: '#FF8A1E', tutoring: '#3D9BFF', sport: '#5CFF7A', sixers: '#ED174C' }
/** Test colours are the subject colours used on the Study tab. */
export const SUBJECT_COLOUR: [RegExp, string][] = [
  [/chem/i, '#3D9BFF'], [/method/i, '#5CFF7A'], [/spec/i, '#BF5AF2'], [/bio/i, '#FF2FA3'], [/engl/i, '#FFC23D'], [/relig/i, '#AEB6C2'],
]
export const FALLBACK_COLOUR = '#9fb0ff'
export const subjectColour = (subject: string): string => SUBJECT_COLOUR.find(([re]) => re.test(subject))?.[1] ?? FALLBACK_COLOUR
const SUBJECT_SHORT: [RegExp, string][] = [[/chem/i, 'Chem'], [/method/i, 'Methods'], [/spec/i, 'Spec'], [/bio/i, 'Bio'], [/engl/i, 'English'], [/relig/i, 'Religion']]
const subjectShort = (subject: string) => SUBJECT_SHORT.find(([re]) => re.test(subject))?.[1] ?? subject

export interface WeekEvent {
  id: string
  kind: Kind
  /** The full title, as Liam writes it. Shown when the event is tapped. */
  title: string
  /** The short name drawn on the block. */
  label: string
  /** An even shorter name for a block that shares its width with a clash ("PA", "Chem"). */
  short: string
  colour: string
  /** Start and end, as instants. `end` equals `start` for an event with no length. */
  start: number
  end: number
  /** False when the task has no time (a date only task), so it goes in the EARLY row. */
  timed: boolean
}

export interface Block {
  ev: WeekEvent
  /** Hours from midnight, clamped to the grid. */
  from: number
  to: number
  /** Which side by side column it sits in, and how many columns its clash group has. */
  lane: number
  lanes: number
}

export interface DayCol {
  /** The instant of this Perth day's midnight. */
  start: number
  dow: string
  num: number
  isToday: boolean
  early: WeekEvent[]
  blocks: Block[]
}

export interface WeekModel {
  days: DayCol[]
  /** "Nov" and "21 to 27" for the corner of the header. */
  month: string
  range: string
  total: number
}

export const perthMidnight = (ms: number): number => Math.floor((ms + PERTH) / DAY) * DAY - PERTH
const hourOfDay = (ms: number): number => (((ms + PERTH) % DAY) + DAY) % DAY / HOUR
const perthParts = (ms: number) => { const d = new Date(ms + PERTH); return { dow: d.getUTCDay(), day: d.getUTCDate(), mon: d.getUTCMonth() } }

/** "6:30 am", "3 pm", "12 pm". */
export function fmtHour(h: number): string {
  const total = Math.round(h * 60)
  const H = Math.floor(total / 60) % 24
  const m = total % 60
  return `${H % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${H < 12 ? 'am' : 'pm'}`
}
/** "6am", "2pm" for the time column down the side. */
export const fmtAxis = (h: number): string => fmtHour(h).replace(' ', '')

/** "6:30 am to 3 pm", or just "5:30 pm" for an event with no length, or "No time" for a date only task. */
export function fmtRange(ev: WeekEvent): string {
  if (!ev.timed) return 'No time'
  const a = hourOfDay(ev.start)
  if (ev.end <= ev.start) return fmtHour(a)
  return `${fmtHour(a)} to ${fmtHour(hourOfDay(ev.end) || 24)}`
}

/** The short name drawn on a shift block: the station when there is one ("Shift PA"), else the title. */
export const shiftLabel = (s: Pick<Shift, 'title' | 'station'>): string => (s.station?.trim() ? `Shift ${s.station.trim()}` : s.title.trim())

export function shiftEvent(s: Shift): WeekEvent {
  return { id: `s${s.id}`, kind: 'shift', title: s.title, label: shiftLabel(s), short: s.station?.trim() || s.title.trim(), colour: KIND_COLOUR.shift, start: Date.parse(s.starts_at), end: Date.parse(s.ends_at), timed: true }
}

export function testEvent(t: Test): WeekEvent {
  const at = Date.parse(t.due_at)
  // TickTick tasks with no time are stored at Perth midnight. They have no time to draw.
  const timed = hourOfDay(at) !== 0
  return { id: `t${t.id}`, kind: 'test', title: t.title, label: `${subjectShort(t.subject)} test`, short: subjectShort(t.subject), colour: subjectColour(t.subject), start: at, end: timed ? at + TEST_HOURS * HOUR : at, timed }
}

/** Side by side columns for events that clash. Each group of overlapping blocks shares its width equally. */
export function layoutBlocks(items: { ev: WeekEvent; from: number; to: number }[]): Block[] {
  const sorted = [...items].sort((a, b) => a.from - b.from || b.to - a.to)
  const out: Block[] = []
  let group: Block[] = []
  let groupEnd = -1
  const close = () => { const n = group.reduce((m, b) => Math.max(m, b.lane + 1), 1); for (const b of group) b.lanes = n; out.push(...group); group = [] }
  for (const it of sorted) {
    if (group.length && it.from >= groupEnd) close()
    const taken = new Set(group.filter((b) => b.to > it.from).map((b) => b.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    group.push({ ev: it.ev, from: it.from, to: it.to, lane, lanes: 1 })
    groupEnd = group.length === 1 ? it.to : Math.max(groupEnd, it.to)
  }
  close()
  return out
}

/** The 7 days from the Perth day containing `now`, with every event placed. Events outside the 7 days are ignored. */
export function buildWeek(now: Date, events: WeekEvent[]): WeekModel {
  const first = perthMidnight(now.getTime())
  const today = first
  const days: DayCol[] = []
  for (let i = 0; i < 7; i++) {
    const start = first + i * DAY
    const p = perthParts(start)
    days.push({ start, dow: DOW[p.dow], num: p.day, isToday: start === today, early: [], blocks: [] })
  }
  const grid: { ev: WeekEvent; from: number; to: number }[][] = days.map(() => [])
  let total = 0
  for (const ev of events) {
    // A shift that crosses midnight is drawn on each day it touches.
    const last = ev.timed && ev.end > ev.start ? ev.end - 1 : ev.start
    for (let ms = perthMidnight(ev.start); ms <= last; ms += DAY) {
      const i = Math.round((ms - first) / DAY)
      if (i < 0 || i > 6) continue
      const a = (Math.max(ev.start, ms) - ms) / HOUR
      const b = ev.end > ev.start ? Math.min(ev.end - ms, DAY) / HOUR : a
      const to = Math.min(b, 24)
      if (!ev.timed || a < DAY_START) { days[i].early.push(ev); total++; continue }
      const from = Math.min(a, DAY_END - MIN_BLOCK_HOURS)
      grid[i].push({ ev, from, to: Math.min(Math.max(to, from + MIN_BLOCK_HOURS), DAY_END) })
      total++
    }
  }
  days.forEach((d, i) => { d.blocks = layoutBlocks(grid[i]); d.early.sort((x, y) => x.start - y.start) })
  const a = perthParts(first)
  const b = perthParts(first + 6 * DAY)
  return { days, month: MONTHS[a.mon], range: a.mon === b.mon ? `${a.day} to ${b.day}` : `${a.day} to ${b.day} ${MONTHS[b.mon]}`, total }
}
