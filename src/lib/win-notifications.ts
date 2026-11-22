// Card 26: Windows notifications (and Phone Link's phone notifications, which arrive as Windows toasts) as Halo alerts.
// The helper has already hidden the text of messages (a message only says "New message" and which app). These rows are
// shown as banners and in the stack under the island. They live in memory only: nothing is written anywhere.

import type { AlertRow } from '../types'

export interface WinNote {
  id: string
  /** 'call', 'message' or 'notification'. */
  type: string
  title: string
  body: string
  app?: string
  hidden?: boolean
}

const KEEP = 20

export const isWinNote = (d: unknown): d is WinNote => {
  const n = d as Partial<WinNote> | null
  return !!n && typeof n.id === 'string' && typeof n.type === 'string' && typeof n.title === 'string' && typeof n.body === 'string'
}

export function toAlertRow(n: WinNote, now: Date = new Date()): AlertRow {
  return { id: n.id, type: n.type, title: n.title.slice(0, 80), body: n.body.slice(0, 160), action_label: null, action_url: null, created_at: now.toISOString(), read_at: null }
}

export interface WinNotes {
  rows(): readonly AlertRow[]
  add(n: unknown): void
  markRead(ids: string[]): void
  subscribe(cb: () => void): () => void
}

export function createWinNotes(): WinNotes {
  let rows: AlertRow[] = []
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((f) => f())
  return {
    rows: () => rows,
    add(d) {
      if (!isWinNote(d) || rows.some((r) => r.id === d.id)) return
      rows = [toAlertRow(d), ...rows].slice(0, KEEP)
      emit()
    },
    markRead(ids) {
      const set = new Set(ids)
      const next = rows.filter((r) => !set.has(r.id))
      if (next.length !== rows.length) { rows = next; emit() }
    },
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
  }
}
