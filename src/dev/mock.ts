// Dev-only fixtures for screenshots and design review. Never shipped (guarded by import.meta.env.DEV).
import type { Backend, Shift, StudySession, Test } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { weekStart, addDays } from '../time'

const HOUR = 36e5
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function at(day: Date, h: number, m = 0): string {
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export function mockBackend(mode: string): Backend {
  const now = new Date()
  const mon = weekStart(now)
  const shifts: Shift[] =
    mode === 'empty'
      ? []
      : [
          { id: '1', title: 'Checkout', station: 'Front end', starts_at: at(mon, 16), ends_at: at(mon, 20), is_public_holiday: false },
          { id: '2', title: 'Deli', station: 'Fresh', starts_at: at(addDays(mon, 2), 15, 30), ends_at: at(addDays(mon, 2), 21), is_public_holiday: mode === 'holiday' },
          { id: '3', title: 'Nightfill', station: 'Grocery', starts_at: at(addDays(mon, 5), 9), ends_at: at(addDays(mon, 5), 15), is_public_holiday: false },
          { id: '4', title: 'Checkout', station: 'Front end', starts_at: at(addDays(mon, 6), 10), ends_at: at(addDays(mon, 6), 16), is_public_holiday: false },
          { id: '5', title: 'Checkout', station: 'Front end', starts_at: new Date(now.getTime() + 26 * HOUR + 14 * 6e4).toISOString(), ends_at: new Date(now.getTime() + 31 * HOUR).toISOString(), is_public_holiday: false },
        ]
  const tests: Test[] =
    mode === 'empty' ? [] : [{ id: 't', subject: 'Chemistry', title: 'Organic chemistry test', due_at: new Date(now.getTime() + 41 * HOUR + 30 * 6e4).toISOString() }]
  const sessions: StudySession[] =
    mode === 'empty'
      ? []
      : [
          { id: 's1', subject: 'Methods', started_at: new Date(now.getTime() - 5 * HOUR).toISOString(), ended_at: new Date(now.getTime() - 4.2 * HOUR).toISOString(), minutes: 48 },
          { id: 's2', subject: 'Chemistry', started_at: new Date(now.getTime() - 3 * HOUR).toISOString(), ended_at: new Date(now.getTime() - 2.5 * HOUR).toISOString(), minutes: 30 },
          { id: 's3', subject: 'Human Biology', started_at: new Date(now.getTime() - 2 * HOUR).toISOString(), ended_at: new Date(now.getTime() - 1.6 * HOUR).toISOString(), minutes: 25 },
        ]
  let active: StudySession | null =
    mode === 'running' ? { id: 'a', subject: 'Specialist', started_at: new Date(now.getTime() - 17 * 6e4 - 23e3).toISOString(), ended_at: null, minutes: null } : null

  const gate = async <T>(v: T): Promise<T> => {
    if (mode === 'loading') await new Promise(() => {})
    await sleep(120)
    if (mode === 'error') throw new Error('Failed to fetch')
    return v
  }

  return {
    nextShift: (n) => gate(shifts.filter((s) => new Date(s.ends_at) > n).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null),
    nextTest: (n) => gate(tests.find((t) => new Date(t.due_at) > n) ?? null),
    shiftsBetween: (a, b) => gate(shifts.filter((s) => new Date(s.starts_at) < b && new Date(s.ends_at) > a)),
    settings: () => gate({ ...DEFAULT_SETTINGS }),
    activeSession: () => gate(active),
    sessionsSince: (d) => gate(sessions.filter((s) => new Date(s.started_at) >= d)),
    subjects: () => gate([...new Set([...tests.map((t) => t.subject), ...sessions.map((s) => s.subject)])]),
    async startSession(subject) {
      active = { id: String(Date.now()), subject, started_at: new Date().toISOString(), ended_at: null, minutes: null }
      return gate(active)
    },
    async stopSession() {
      const s = { ...active!, ended_at: new Date().toISOString() }
      s.minutes = Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 6e4)
      sessions.unshift(s)
      active = null
      return gate(s)
    },
    onShiftsChange(_cb, onStatus) {
      setTimeout(() => onStatus?.(mode !== 'error'), 200)
      return () => {}
    },
  }
}
