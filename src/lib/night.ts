import { perthDate, perthDayStart } from './money.ts'

// Night (card 23). The pure model for the Night tab: when to wind down, the sleep arc to tomorrow's first event, and what
// Night mode mutes. Everything is Perth time. The plan: be up an hour before the first thing tomorrow, in bed eight hours earlier.

const HOUR = 36e5
const DAY = 24 * HOUR
export const SLEEP_H = 8
/** The alarm goes this long before the first event. */
export const PREP_MIN = 60
/** With nothing on tomorrow the alarm is 7:00. */
export const DEFAULT_WAKE_MIN = 7 * 60
/** The arc starts at 5 pm. */
export const ARC_START_H = 17
/** A test due before 6 am or after 6 pm is a deadline, not something to wake up for. */
const TEST_FROM_H = 6
const TEST_TO_H = 18

export interface NightEvent { kind: 'shift' | 'test'; at: Date; label: string }
export interface NightPlan {
  /** The Perth date of this evening. Before 5 am it is still the evening before. */
  evening: string
  tomorrow: string
  event: NightEvent | null
  alarm: Date
  lightsOut: Date
  /** 0 to 1 along the arc from 5 pm to the first event. */
  f: number
}

/** The evening a time belongs to. 2 am on Sunday is still Saturday night. */
export const eveningOf = (now: Date): string => perthDate(new Date(now.getTime() - 5 * HOUR))

const perthMinutes = (d: Date) => Math.round(((d.getTime() + 8 * HOUR) % DAY) / 60_000)

export function planNight(now: Date, shifts: readonly { starts_at: string; title: string }[], tests: readonly { due_at: string; subject: string; title: string }[]): NightPlan {
  const evening = eveningOf(now)
  const eveStart = perthDayStart(evening).getTime()
  const tomorrowStart = eveStart + DAY
  const tomorrow = perthDate(new Date(tomorrowStart + 4 * HOUR))
  const events: NightEvent[] = []
  for (const s of shifts) {
    const at = new Date(s.starts_at)
    if (at.getTime() >= tomorrowStart && at.getTime() < tomorrowStart + DAY) events.push({ kind: 'shift', at, label: s.title })
  }
  for (const t of tests) {
    const at = new Date(t.due_at)
    const m = perthMinutes(at)
    if (at.getTime() >= tomorrowStart && at.getTime() < tomorrowStart + DAY && m >= TEST_FROM_H * 60 && m <= TEST_TO_H * 60) events.push({ kind: 'test', at, label: `${t.subject} ${t.title}` })
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime())
  const event = events[0] ?? null
  const alarm = event ? new Date(event.at.getTime() - PREP_MIN * 60_000) : new Date(tomorrowStart + DEFAULT_WAKE_MIN * 60_000)
  const lightsOut = new Date(alarm.getTime() - SLEEP_H * HOUR)
  const start = eveStart + ARC_START_H * HOUR
  const end = (event?.at ?? alarm).getTime()
  const f = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)))
  return { evening, tomorrow, event, alarm, lightsOut, f }
}

const hm = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Perth' })
/** "9:30 pm" */
export const clockPm = (d: Date): string => hm.format(d).replace(/\s?([ap])m/i, (_, x: string) => ` ${x.toLowerCase()}m`)
/** "9:30", for the arc labels. */
export const clock12 = (d: Date): string => clockPm(d).replace(/ [ap]m$/, '')

/** "3h 12m" until a time, or "past" once it has gone. */
export function untilLabel(to: Date, now: Date): string {
  const m = Math.round((to.getTime() - now.getTime()) / 60_000)
  if (m <= 0) return 'past'
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

const dayName = new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'Australia/Perth' })
export const eveningName = (plan: NightPlan): string => dayName.format(perthDayStart(plan.evening))

/** The four things to tick off before bed. The first depends on what tomorrow is. */
export function tickCards(plan: NightPlan): { id: string; title: string; sub: string }[] {
  return [
    plan.event?.kind === 'test' ? { id: 'bag', title: 'Bag packed', sub: 'BY 9PM' } : { id: 'uniform', title: 'Uniform out', sub: 'BY 9PM' },
    { id: 'phone', title: 'Phone charging', sub: `BY ${clock12(plan.lightsOut)}` },
    { id: 'alarm', title: `Alarm ${clock12(plan.alarm)}`, sub: 'SET IT' },
    { id: 'water', title: 'Water bottle', sub: 'FILL' },
  ]
}
export const ticksKey = (plan: NightPlan): string => `halo.night.ticks.${plan.evening}`

/* ---------- Night mode ---------- */

/** What Night mode mutes on the closed island: the transient banners and the unread dot. Leave reminders always get through. */
export type Muteable = 'hud' | 'charge' | 'unread' | 'leave' | 'game' | 'timer' | 'shift' | 'music'
export const NIGHT_MUTES: readonly Muteable[] = ['hud', 'charge', 'unread']
export const isMuted = (kind: Muteable, nightOn: boolean): boolean => nightOn && NIGHT_MUTES.includes(kind)

const NIGHT_KEY = 'halo.night'
export interface NightMode { get(): boolean; set(on: boolean): void; subscribe(cb: (on: boolean) => void): () => void }
/** Night mode is per device: the laptop and the phone each remember their own. It also sets html[data-night] so the CSS can dim. */
export function createNightMode(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage, root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement): NightMode {
  const read = () => { try { return storage?.getItem(NIGHT_KEY) === '1' } catch { return false } }
  let on = read()
  const subs = new Set<(on: boolean) => void>()
  const apply = () => { if (root) root.dataset.night = on ? '1' : '0' }
  apply()
  return {
    get: () => on,
    set(v) { if (v === on) return; on = v; try { storage?.setItem(NIGHT_KEY, v ? '1' : '0') } catch { /* private mode: lasts until reload */ } apply(); subs.forEach((f) => f(on)) },
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
  }
}
