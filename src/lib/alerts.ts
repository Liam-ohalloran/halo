import type { AlertRow, Backend } from '../types'

// Alerts (card 20). The pure model for the Alerts tab and the island's unread dot, plus the small store both share.
// Pure functions first so they can be unit tested. Alerts are read only here: Halo can mark one read, never send anything.

export type AlertCat = 'school' | 'work' | 'phone'
export type AlertFilter = 'all' | AlertCat

export interface AlertMeta {
  cat: AlertCat
  /** Caps label on the shaped glow banner. */
  label: string
  /** The glow and accent colour. */
  colour: string
  /** Round icon tile gradient. */
  bg: string
  /** Inner SVG for a 24 grid. */
  icon: string
  /** Higher wins the banner. */
  rank: number
}

const stroke = (d: string) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
const ICON = {
  swap: stroke('M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7'),
  bell: stroke('M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4'),
  mark: '<path d="M12 3l9 5-9 5-9-5z" fill="currentColor"/><path d="M6 11v4.5c0 1.5 2.7 3 6 3s6-1.5 6-3V11l-6 3.3z" fill="currentColor" opacity=".7"/>',
  call: '<path d="M6.6 3.5 9.2 3l1.6 4.2-1.9 1.4a11 11 0 0 0 5.5 5.5l1.4-1.9L20 13.8l-.5 2.6c-.2 1.2-1.2 2-2.4 1.9C10 17.7 6.3 14 5.7 6.9c-.1-1.2.7-2.2 1.9-2.4z" fill="currentColor"/>',
  ball: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="4.5" y="9.5" width="3" height="5" rx="1" fill="currentColor"/>',
  tick: stroke('M5 12.5l4.5 4.5L19 7.5'),
  focus: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
  chat: '<path d="M12 3C6.5 3 2 6.8 2 11.5c0 2.4 1.2 4.6 3.1 6.1L4 21l4.2-2.1c1.2.4 2.5.6 3.8.6 5.5 0 10-3.8 10-8.5S17.5 3 12 3z" fill="currentColor"/>',
}

/** The alert types card 18 lists, with the filter each belongs to. Anything else is treated as a phone alert. */
export const ALERT_TYPES: Record<string, AlertMeta> = {
  leave_reminder: { cat: 'work', label: 'Leave now', colour: '#FF453A', bg: 'linear-gradient(160deg,#ff6b61,#c0150c)', icon: ICON.swap, rank: 100 },
  shift_cover: { cat: 'work', label: 'Shift cover', colour: '#FFC23D', bg: 'linear-gradient(160deg,#ffd76a,#c98a00)', icon: ICON.swap, rank: 90 },
  call: { cat: 'phone', label: 'Call', colour: '#3D9BFF', bg: 'linear-gradient(160deg,#5aa9ff,#1f5fc4)', icon: ICON.call, rank: 80 },
  new_mark: { cat: 'school', label: 'New mark', colour: '#5CFF7A', bg: 'linear-gradient(160deg,#5cff7a,#139a3a)', icon: ICON.mark, rank: 70 },
  battery_low: { cat: 'work', label: 'Battery low', colour: '#FF453A', bg: 'linear-gradient(160deg,#ff6b61,#c0150c)', icon: ICON.battery, rank: 60 },
  message: { cat: 'phone', label: 'Message', colour: '#5CFF7A', bg: 'linear-gradient(160deg,#5ef08a,#21a84a)', icon: ICON.chat, rank: 40 },
  sixers_final: { cat: 'phone', label: 'Sixers final', colour: '#3D9BFF', bg: 'linear-gradient(160deg,#5aa9ff,#1f5fc4)', icon: ICON.ball, rank: 35 },
  focus_done: { cat: 'school', label: 'Focus done', colour: '#9FB0FF', bg: 'linear-gradient(160deg,#7b83eb,#4b53bc)', icon: ICON.focus, rank: 30 },
  task_done: { cat: 'school', label: 'Task done', colour: '#BF5AF2', bg: 'linear-gradient(160deg,#cf7bf7,#8a2fc0)', icon: ICON.tick, rank: 20 },
}
const FALLBACK: AlertMeta = { cat: 'phone', label: 'Alert', colour: '#FFC23D', bg: 'linear-gradient(160deg,#ffd76a,#c98a00)', icon: ICON.bell, rank: 10 }

export const alertMeta = (type: string): AlertMeta => ALERT_TYPES[type] ?? FALLBACK

/** Pills the tab has room for (a 2 by 3 grid under the banner). */
export const MAX_PILLS = 6

/** "now", "4m", "1h", "2d". Never negative. */
export function ago(now: Date, iso: string): string {
  const mins = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

/** The most important unread alert: highest rank, then newest. Null when there are none. */
export function pickHero(rows: readonly AlertRow[]): AlertRow | null {
  let best: AlertRow | null = null
  for (const r of rows) {
    if (r.read_at) continue
    if (!best) { best = r; continue }
    const a = alertMeta(r.type).rank, b = alertMeta(best.type).rank
    if (a > b || (a === b && Date.parse(r.created_at) > Date.parse(best.created_at))) best = r
  }
  return best
}

export interface AlertsView {
  hero: AlertRow | null
  /** The pills, newest first, at most MAX_PILLS. When there are more, the last slot is the "+N more" cell instead. */
  pills: AlertRow[]
  more: number
  /** Every unread alert, banner included. This is the count on CLEAR ALL and the island's gold dot. */
  unread: number
}

export function buildAlertsView(rows: readonly AlertRow[]): AlertsView {
  const unreadRows = rows.filter((r) => !r.read_at)
  const hero = pickHero(unreadRows)
  const rest = unreadRows.filter((r) => r !== hero).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const over = rest.length > MAX_PILLS
  return { hero, pills: over ? rest.slice(0, MAX_PILLS - 1) : rest, more: over ? rest.length - (MAX_PILLS - 1) : 0, unread: unreadRows.length }
}

/** Does a filter let this alert through? The tab dims the rest instead of hiding them, like the prototype. */
export const matchesFilter = (type: string, f: AlertFilter): boolean => f === 'all' || alertMeta(type).cat === f

/** Only web links open. Anything else (javascript:, data:, a bare path) is ignored. */
export const safeUrl = (u: string | null): string | null => (u && /^https?:\/\//i.test(u) ? u : null)

/** The one shared list of unread alerts. The tab and the island's dot both read it. */
export interface AlertsStore {
  rows(): readonly AlertRow[]
  /** 'loading' until the first answer, then 'ok', or 'error' when the last fetch failed. */
  status(): 'loading' | 'ok' | 'error'
  load(): Promise<void>
  /** Marks read straight away on screen, then tells the database. A failure brings the rows back. */
  markRead(ids: string[]): Promise<void>
  subscribe(cb: () => void): () => void
  destroy(): void
}

export function createAlertsStore(api: Backend): AlertsStore {
  let rows: AlertRow[] = []
  let state: 'loading' | 'ok' | 'error' = 'loading'
  let seq = 0
  let alive = true
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((f) => f())

  async function load() {
    const my = ++seq
    try {
      const next = await api.unreadAlerts()
      if (!alive || my !== seq) return
      rows = next
      state = 'ok'
    } catch {
      if (!alive || my !== seq) return
      state = 'error'
    }
    emit()
  }

  async function markRead(ids: string[]) {
    const set = new Set(ids)
    const before = rows
    rows = rows.filter((r) => !set.has(r.id))
    seq++ // a fetch that started before this must not bring them back
    emit()
    try { await api.markAlertsRead(ids) } catch { if (alive) { rows = before; emit() } }
  }

  const off = api.onAlertsChange(() => void load())
  void load()
  return {
    rows: () => rows,
    status: () => state,
    load, markRead,
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
    destroy: () => { alive = false; off(); subs.clear() },
  }
}
