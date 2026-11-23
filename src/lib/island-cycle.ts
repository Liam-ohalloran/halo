// Card 29: the closed island is never blank. When no live state (card 17), HUD pill or banner is on, it cycles through
// compact modes, each with its own glow colour and width. Pure logic only (no DOM), so it can be unit tested. The look is
// design/prototype/base-tab.html ("Closed island").

import type { Shift, Test } from '../types'
import type { Battery, Media } from './helper'
import type { Weather } from './weather'
import { fmtClockPm, fmtDayMonth, perthDaysBetween, shiftView } from './now-model.ts'
import { sunState, type SevenDays } from './base.ts'

export const CYCLE_KEYS = ['time', 'shift', 'music', 'battery', 'pay', 'event'] as const
export type CycleKey = (typeof CYCLE_KEYS)[number]
export const CYCLE_LABELS: Record<CycleKey, string> = { time: 'Time and weather', shift: 'Next shift', music: 'Now playing', battery: 'Battery', pay: 'Pay, last 7 days', event: 'Next test or event' }
export const CYCLE_EVERY = [4, 6, 10] as const
export type CycleEvery = (typeof CYCLE_EVERY)[number]
export const DEFAULT_EVERY: CycleEvery = 6

/** Width, height and bottom radius of the closed island in cycle mode. The widths are the prototype's data-w. */
export const CYCLE_H = 38
export const CYCLE_R = 19
export const CYCLE_WIDTH: Record<CycleKey, number> = { time: 230, shift: 270, music: 270, battery: 240, pay: 250, event: 270 }
/** Glow colour of each mode, from the prototype. */
export const CYCLE_COLOUR: Record<CycleKey, string> = { time: '#96B4FF', shift: '#FF9F0A', music: '#1ED760', battery: '#30D158', pay: '#FFC23D', event: '#3D9BFF' }

export type Lead = 'none' | 'bolt' | 'bat' | 'cash' | 'cal' | 'art'
export interface CycleItem {
  key: CycleKey
  /** Island width in px. */
  w: number
  /** Glow colour. */
  colour: string
  lead: Lead
  /** Album art URL for the `art` lead. */
  art?: string | null
  title: string
  /** Time and weather only: the date between the time and the weather. */
  mid?: string
  right: string
  /** Weather icon in front of `right` (time and weather only). */
  rightIcon?: 'sun' | 'moon' | null
}

/** Everything the cycle reads. A field that is null (or undefined while loading) means that mode has nothing to show. */
export interface CycleData {
  weather?: Weather | null
  battery?: Battery | null
  media?: Media | null
  art?: string | null
  shift?: Shift | null
  pay?: SevenDays | null
  test?: Test | null
}

/** `in 11h 45m`, `in 2d 4h`, `now`. */
export function hrsTo(ms: number): string {
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`
}

const noAmPm = (s: string) => s.replace(/\s?[ap]m$/i, '')
const dow3 = (t: number) => fmtDayMonth(t).slice(0, 3)
const shortSubject = (name: string) => { const w = name.trim().split(/\s+/)[0] ?? name; return w.length > 9 ? `${w.slice(0, 8)}.` : w }
/** `in 7 days`, `tomorrow`, `today`. */
export function daysTo(now: number | Date, t: number | Date): string {
  const n = perthDaysBetween(now, t)
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
}

/** Every mode that has something to show, in the prototype's order, leaving out the ones Liam switched off. Never empty while `time` is on. */
export function buildCycle(d: CycleData, now: Date, enabled: Record<CycleKey, boolean>, travelMinutes = 25): CycleItem[] {
  const out: CycleItem[] = []
  const on = (k: CycleKey) => enabled[k] !== false
  const t = now.getTime()
  const item = (key: CycleKey, rest: Omit<CycleItem, 'key' | 'w' | 'colour'>): CycleItem => ({ key, w: CYCLE_WIDTH[key], colour: CYCLE_COLOUR[key], ...rest })

  if (on('time')) {
    const sun = sunState(now)
    out.push(item('time', {
      lead: 'none', title: noAmPm(fmtClockPm(t)), mid: fmtDayMonth(t),
      right: d.weather ? `${d.weather.temp}°` : '', rightIcon: d.weather ? (sun.up ? 'sun' : 'moon') : null,
    }))
  }
  if (on('shift') && d.shift) {
    const sv = shiftView(d.shift, now, travelMinutes)
    const station = d.shift.station?.trim()
    if (sv.phase === 'live') out.push(item('shift', { lead: 'bolt', title: `On shift${station ? ` · ${station}` : ''}`, right: `ends in ${hrsTo(sv.msToEnd)}` }))
    else out.push(item('shift', { lead: 'bolt', title: `Shift${station ? ` ${station}` : ''} · ${dow3(sv.start)} ${noAmPm(fmtClockPm(sv.start))}`, right: `in ${hrsTo(sv.msToStart)}` }))
  }
  if (on('music') && d.media && d.media.available && d.media.title && d.media.playing) {
    out.push(item('music', { lead: 'art', art: d.art ?? null, title: d.media.title, right: d.media.artist }))
  }
  if (on('battery') && d.battery && d.battery.present && d.battery.percent != null) {
    const b = d.battery
    const low = b.percent! <= 20 && !b.charging
    out.push({ ...item('battery', { lead: 'bat', title: `${b.percent}%`, right: b.charging ? 'Charging' : b.minutes_left != null ? `${hrsTo(b.minutes_left * 60_000)} left` : 'On battery' }), colour: low ? '#FF453A' : CYCLE_COLOUR.battery })
  }
  if (on('pay') && d.pay && d.pay.gross > 0) out.push(item('pay', { lead: 'cash', title: `$${d.pay.gross}`, right: 'last 7 days' }))
  if (on('event') && d.test) {
    const due = Date.parse(d.test.due_at)
    if (due >= t - 60 * 60_000) out.push(item('event', { lead: 'cal', title: `${shortSubject(d.test.subject)} test · ${dow3(due)}`, right: daysTo(now, due) }))
  }
  return out
}

/**
 * The mode after `current`. If `current` is no longer in the list (its data went away), it is the first one that came after it
 * in the fixed order, so the cycle carries on instead of jumping back to the start. One item cycles to itself.
 */
export function nextKey(items: readonly { key: CycleKey }[], current: CycleKey | null): CycleKey | null {
  if (!items.length) return null
  if (current == null) return items[0].key
  const i = items.findIndex((x) => x.key === current)
  if (i >= 0) return items[(i + 1) % items.length].key
  const order = CYCLE_KEYS.indexOf(current)
  return (items.find((x) => CYCLE_KEYS.indexOf(x.key) > order) ?? items[0]).key
}

/** Which mode to show now: the current one if it still has something to show, otherwise the one that should replace it. */
export function settleKey(items: readonly { key: CycleKey }[], current: CycleKey | null): CycleKey | null {
  if (!items.length) return null
  if (current && items.some((x) => x.key === current)) return current
  return nextKey(items, current) ?? items[0].key
}

/** 4, 6 or 10 seconds in ms. Anything else is the default. */
export const everyMs = (s: unknown): number => (CYCLE_EVERY as readonly number[]).includes(s as number) ? (s as number) * 1000 : DEFAULT_EVERY * 1000
