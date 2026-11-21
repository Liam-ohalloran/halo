import type { Settings } from '../types'
import { calcWeek, perthWeekStart, type PayShift } from './pay.ts'

// Money (card 21). The pure model for the Money tab: what Liam earned (from shifts, through pay.ts), what he spent and pays
// monthly (rows he types in by hand), his goals, and a safe to spend figure. No bank connection and nothing here moves money.
// Everything is worked out in Perth time (UTC+8, no daylight saving) so it matches whatever time zone the browser is in.

const HOUR = 36e5
const DAY = 24 * HOUR
const PERTH = 8 * HOUR
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** A manual row in the money_items table. `on_date` is the day it was spent, or for a subscription the day it renews each month. */
export interface MoneyItem {
  id: string
  kind: 'spend' | 'sub'
  name: string
  amount: number
  category: string
  /** yyyy-mm-dd, a Perth calendar date. */
  on_date: string
}

/** A savings goal (the goals table). `saved` and `target` are dollars Liam updates by hand. */
export interface Goal {
  id: string
  name: string
  saved: number
  target: number
  colour: string
}

export const CATEGORIES: { name: string; colour: string }[] = [
  { name: 'Food', colour: '#FF8A1E' }, { name: 'Travel', colour: '#3D9BFF' }, { name: 'Fun', colour: '#FF2FA3' },
  { name: 'Shop', colour: '#BF5AF2' }, { name: 'Other', colour: '#AEB6C2' },
]
export const categoryColour = (name: string): string => CATEGORIES.find((c) => c.name === name)?.colour ?? '#AEB6C2'
/** Goal ring colours, handed out in order when a goal is made. */
export const GOAL_COLOURS = ['#5CFF7A', '#FFC23D', '#3D9BFF', '#FF2FA3', '#BF5AF2']
/** Subscription dot colours, by name, and a quiet default. */
const SUB_COLOURS: Record<string, string> = { spotify: '#1ED760', netflix: '#E50914', icloud: '#3D9BFF', xbox: '#5CFF7A', youtube: '#FF453A', disney: '#3D9BFF', apple: '#AEB6C2' }
export const subColour = (name: string): string => SUB_COLOURS[Object.keys(SUB_COLOURS).find((k) => name.toLowerCase().includes(k)) ?? ''] ?? '#9FB0FF'

/* ---------- Perth calendar helpers ---------- */

/** The Perth calendar date of an instant as yyyy-mm-dd. */
export function perthDate(d: Date): string {
  const p = new Date(d.getTime() + PERTH)
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}-${String(p.getUTCDate()).padStart(2, '0')}`
}
/** The instant of 00:00 Perth on a yyyy-mm-dd date. */
export const perthDayStart = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - PERTH)
}
/** 00:00 Perth on the 1st of the month containing `d`, moved by `offset` months. */
export function perthMonthStart(d: Date, offset = 0): Date {
  const p = new Date(d.getTime() + PERTH)
  return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + offset, 1) - PERTH)
}
/** Whole days left in the Perth month, counting today. At least 1. */
export function daysLeftInMonth(now: Date): number {
  return Math.max(1, Math.round((perthMonthStart(now, 1).getTime() - perthDayStart(perthDate(now)).getTime()) / DAY))
}

/* ---------- earned ---------- */

export interface Earned {
  gross: number
  /** Estimated after tax. Tax is worked out a pay week at a time, so a part week is taken pro rata. */
  net: number
}

/** What the shifts paid in [from, to), through the same pay.ts maths as the Pay tab. */
export function earnedBetween(shifts: PayShift[], from: Date, to: Date, s: Settings): Earned {
  let gross = 0
  let net = 0
  for (let ws = perthWeekStart(from); ws.getTime() < to.getTime(); ws = new Date(ws.getTime() + 7 * DAY)) {
    const w = calcWeek(shifts, ws, s)
    let part = 0
    for (const d of w.days) if (d.date.getTime() >= from.getTime() && d.date.getTime() < to.getTime()) part += d.gross
    gross += part
    net += w.gross > 0 ? w.net * (part / w.gross) : 0
  }
  return { gross: round2(gross), net: round2(net) }
}

/** Gross pay banked by the end of each day of the pay week containing `now`, Monday first. For the little curve. */
export function weekCurve(shifts: PayShift[], now: Date, s: Settings): number[] {
  const w = calcWeek(shifts, perthWeekStart(now), s)
  let run = 0
  return w.days.map((d) => { run += d.gross; return round2(run) })
}

/* ---------- spending and subscriptions ---------- */

const inRange = (item: MoneyItem, from: Date, to: Date) => {
  const t = perthDayStart(item.on_date).getTime()
  return t >= from.getTime() && t < to.getTime()
}

/** Spend rows in [from, to), newest first. */
export const spendBetween = (items: readonly MoneyItem[], from: Date, to: Date): MoneyItem[] =>
  items.filter((i) => i.kind === 'spend' && inRange(i, from, to)).sort((a, b) => b.on_date.localeCompare(a.on_date))

export interface CategoryTotal { name: string; colour: string; total: number }

/** Spend by category, biggest first. Categories nobody used are left out. An unknown category counts as Other. */
export function byCategory(spend: readonly MoneyItem[]): CategoryTotal[] {
  const totals = new Map<string, number>()
  for (const i of spend) {
    const name = CATEGORIES.some((c) => c.name === i.category) ? i.category : 'Other'
    totals.set(name, (totals.get(name) ?? 0) + i.amount)
  }
  return [...totals].map(([name, total]) => ({ name, colour: categoryColour(name), total: round2(total) })).sort((a, b) => b.total - a.total)
}
export const sumOf = (items: readonly MoneyItem[]): number => round2(items.reduce((t, i) => t + i.amount, 0))

/** The subscription rows, soonest renewal first, with what they cost a month in total. */
export function subscriptions(items: readonly MoneyItem[], now: Date): { rows: (MoneyItem & { next: Date })[]; monthly: number } {
  const rows = items.filter((i) => i.kind === 'sub').map((i) => ({ ...i, next: nextRenewal(i.on_date, now) })).sort((a, b) => a.next.getTime() - b.next.getTime())
  return { rows, monthly: sumOf(rows) }
}

/** The next time a monthly charge anchored on `anchor` comes round, at or after today (Perth). A 31st lands on the last day of a short month. */
export function nextRenewal(anchor: string, now: Date): Date {
  const day = Number(anchor.slice(8, 10)) || 1
  const today = perthDayStart(perthDate(now)).getTime()
  for (let m = 0; m < 3; m++) {
    const first = perthMonthStart(now, m)
    const p = new Date(first.getTime() + PERTH)
    const last = new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 0)).getUTCDate()
    const at = first.getTime() + (Math.min(day, last) - 1) * DAY
    if (at >= today) return new Date(at)
  }
  return new Date(today)
}

const dayName = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'Australia/Perth' })
const dayMonth = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Perth' })
/** "Tue" when it is within a week, otherwise "2 Dec". */
export function renewLabel(next: Date, now: Date): string {
  const days = Math.round((next.getTime() - perthDayStart(perthDate(now)).getTime()) / DAY)
  return days === 0 ? 'Today' : days < 7 ? dayName.format(next) : dayMonth.format(next)
}
export const dayLabel = (iso: string, now: Date): string => {
  const days = Math.round((perthDayStart(perthDate(now)).getTime() - perthDayStart(iso).getTime()) / DAY)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? dayName.format(perthDayStart(iso)) : dayMonth.format(perthDayStart(iso))
}

/* ---------- safe to spend ---------- */

/**
 * After tax pay this month, minus what Liam has already spent this month and what his subscriptions cost a month,
 * spread over the days left. Never below zero. There is no bank balance in Halo, so this is a guide, not a balance.
 */
export function safeToSpend(netThisMonth: number, spentThisMonth: number, subsMonthly: number, now: Date): number {
  return Math.max(0, Math.floor((netThisMonth - spentThisMonth - subsMonthly) / daysLeftInMonth(now)))
}

/* ---------- goals ---------- */

export const goalFraction = (g: Pick<Goal, 'saved' | 'target'>): number => (g.target > 0 ? Math.min(1, Math.max(0, g.saved / g.target)) : 0)

/** Whole dollars with a thousands comma, or cents when under $100 and not whole. */
export function dollars(n: number): string {
  const v = Math.round(n * 100) / 100
  const t = Number.isInteger(v) || Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-AU') : v.toFixed(2)
  return `$${t}`
}
/** Always two decimals, for a list of single purchases. */
export const dollars2 = (n: number): string => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Every number the Money tab shows, from the raw rows. One pure function so it can be tested. */
export interface MoneyView {
  week: Earned
  month: Earned
  curve: number[]
  spendWeek: MoneyItem[]
  spentWeek: number
  categories: CategoryTotal[]
  subs: { rows: (MoneyItem & { next: Date })[]; monthly: number }
  goals: Goal[]
  recent: MoneyItem[]
  safe: number
}

export function buildMoneyView(shifts: PayShift[], items: readonly MoneyItem[], goals: readonly Goal[], s: Settings, now: Date): MoneyView {
  const wk = perthWeekStart(now)
  const wkEnd = new Date(wk.getTime() + 7 * DAY)
  const mo = perthMonthStart(now)
  const moEnd = perthMonthStart(now, 1)
  const month = earnedBetween(shifts, mo, moEnd, s)
  const spendWeek = spendBetween(items, wk, wkEnd)
  const spendMonth = spendBetween(items, mo, moEnd)
  const subs = subscriptions(items, now)
  return {
    week: earnedBetween(shifts, wk, wkEnd, s),
    month,
    curve: weekCurve(shifts, now, s),
    spendWeek,
    spentWeek: sumOf(spendWeek),
    categories: byCategory(spendWeek),
    subs,
    goals: [...goals],
    recent: [...items].sort((a, b) => b.on_date.localeCompare(a.on_date)).slice(0, 8),
    safe: safeToSpend(month.net, sumOf(spendMonth), subs.monthly, now),
  }
}
