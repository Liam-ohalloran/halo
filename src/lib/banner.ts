// Card 18: notification banners. Pure logic only (no DOM) so it can be unit tested.
// An alert row arrives from the `alerts` table (card 20). It pops out of the island as a 520 x 84 banner, holds, then
// settles into a small stack under the island. Banners come one at a time. Actions only open things or snooze.

import { alertMeta, ago, safeUrl } from './alerts.ts'
import type { AlertRow } from '../types'

/** The banner's size on the island (HALO.md 3.3, alert banner). */
export const BANNER = { w: 520, h: 84, r: 34 } as const
/** Open over 520 ms with cubic-bezier(0.34, 1.45, 0.5, 1), hold 4 s (hover pauses), close over 380 ms. */
export const OPEN_MS = 520
export const HOLD_MS = 4000
export const CLOSE_MS = 380
/** Pause between one banner closing and the next opening. */
export const GAP_MS = 600
/** Snooze: the alert comes back as a banner after this long. */
export const SNOOZE_MS = 5 * 60_000
/** Pills the stack keeps. */
export const STACK_MAX = 6

export type BannerAction =
  | { kind: 'link'; label: string; url: string }
  | { kind: 'snooze'; label: string }

export interface BannerModel {
  id: string
  type: string
  colour: string
  /** Inner SVG markup for the icon tile, 24 grid. */
  icon: string
  title: string
  body: string
  time: string
  action: BannerAction | null
}

/**
 * The one button on a banner. A link only when the row has a label and a web address. A leave reminder snoozes.
 * Never anything that posts, replies or submits.
 */
export function bannerAction(r: Pick<AlertRow, 'type' | 'action_label' | 'action_url'>): BannerAction | null {
  const url = safeUrl(r.action_url)
  const label = (r.action_label ?? '').trim()
  if (url && label) return { kind: 'link', label, url }
  if (r.type === 'leave_reminder') return { kind: 'snooze', label: label || 'Snooze' }
  return null
}

export function bannerModel(r: AlertRow, now: Date): BannerModel {
  const m = alertMeta(r.type)
  return { id: r.id, type: r.type, colour: m.colour, icon: m.icon, title: r.title, body: r.body, time: ago(now, r.created_at), action: bannerAction(r) }
}

/**
 * Rows that are new since the last look. The first look only learns what is already there (old unread alerts must not
 * all pop out at start up). Returns the new rows, oldest first, and records every id in `seen`.
 */
export function newRows(seen: Set<string>, rows: readonly AlertRow[], seeded: boolean): AlertRow[] {
  const fresh = rows.filter((r) => !seen.has(r.id))
  for (const r of rows) seen.add(r.id)
  if (!seeded) return []
  return fresh.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

/** One at a time. The most important waiting alert goes first (same ranks as the Alerts tab), then the oldest. */
export interface BannerQueue {
  push(r: AlertRow): void
  next(): AlertRow | null
  readonly size: number
  clear(): void
}

export function createBannerQueue(): BannerQueue {
  const q: { r: AlertRow; n: number }[] = []
  let n = 0
  return {
    push(r) { if (!q.some((x) => x.r.id === r.id)) q.push({ r, n: n++ }) },
    next() {
      if (!q.length) return null
      let best = 0
      for (let i = 1; i < q.length; i++) {
        const a = alertMeta(q[i].r.type).rank, b = alertMeta(q[best].r.type).rank
        if (a > b || (a === b && q[i].n < q[best].n)) best = i
      }
      return q.splice(best, 1)[0].r
    },
    get size() { return q.length },
    clear() { q.length = 0 },
  }
}

/** Stack of pills under the island: newest first, no repeats, at most STACK_MAX. */
export function addToStack(stack: readonly AlertRow[], r: AlertRow): AlertRow[] {
  return [r, ...stack.filter((x) => x.id !== r.id)].slice(0, STACK_MAX)
}

/** Drop pills that are no longer unread. Rows in `keep` (played from the demo page) are never dropped. */
export function pruneStack(stack: readonly AlertRow[], unreadIds: ReadonlySet<string>, keep: ReadonlySet<string> = new Set()): AlertRow[] {
  return stack.filter((r) => unreadIds.has(r.id) || keep.has(r.id))
}

/** Where each pill sits when the stack is fanned out. The pill under the pointer grows into a banner sized card. */
export const FAN = { pill: 46, card: BANNER.h, gap: 6 } as const
export function fanOffsets(count: number, hovered: number | null): number[] {
  const out: number[] = []
  let y = 0
  for (let i = 0; i < count; i++) {
    out.push(y)
    y += (i === hovered ? FAN.card : FAN.pill) + FAN.gap
  }
  return out
}

/** The held time left after a 100 ms tick. Hovering the banner pauses the hold. */
export function holdLeft(left: number, hovered: boolean, dt: number): number {
  return hovered ? left : Math.max(0, left - dt)
}
