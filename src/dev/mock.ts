// Dev-only fixtures for screenshots and design review. Never shipped (guarded by import.meta.env.DEV).
import type { AlertRow, Backend, Shift, StudySession, Test } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { weekStart, addDays } from '../time'

const HOUR = 36e5
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function at(day: Date, h: number, m = 0): string {
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

/** Perth (+08:00) time on Sat 21 Nov 2026 plus `d` days: the fixed week the Week tab fixtures hang off (the demo clock). */
const perthAt = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, 21 + d, h - 8, m)).toISOString()
const shiftRow = (id: string, title: string, station: string, d: number, h1: number, h2: number): Shift =>
  ({ id, title, station, starts_at: perthAt(d, Math.floor(h1), (h1 % 1) * 60), ends_at: perthAt(d, Math.floor(h2), (h2 % 1) * 60), is_public_holiday: false })
const testRow = (id: string, subject: string, title: string, d: number, h: number, m = 0): Test => ({ id, subject, title, due_at: perthAt(d, h, m) })
/** The Week tab fixtures. `week` is a normal week, `weekbusy` adds clashes and a crowded EARLY row. */
function weekFixture(busy: boolean): { shifts: Shift[]; tests: Test[] } {
  const shifts = [
    shiftRow('w1', 'SATURDAY PA 6:30-3', 'PA', 0, 6.5, 15), shiftRow('w2', 'SUNDAY PL 6-2', 'PL', 1, 6, 14),
    shiftRow('w3', 'TUESDAY PI 7:30-12', 'PI', 3, 7.5, 12), shiftRow('w4', 'THURSDAY PA 5:30-9', 'PA', 5, 5.5, 9), shiftRow('w5', 'FRIDAY PB 9:30-2', 'PB', 6, 9.5, 14),
  ]
  const tests = [
    testRow('x1', 'Chemistry', 'Organic chemistry test', 2, 10, 15), testRow('x2', 'Methods', 'Calculus test', 3, 8), testRow('x3', 'English', 'Text response', 4, 0), testRow('x4', 'Specialist', 'Complex numbers test', 5, 13),
  ]
  if (busy) {
    shifts.push(shiftRow('w6', 'SUNDAY EXTRA PA 10-1', 'PA', 1, 10, 13), shiftRow('w7', 'TUESDAY CLOSE 3-9', 'CL', 3, 15, 21.5), shiftRow('w8', 'WEDNESDAY PA 4-8', 'PA', 4, 16, 20), shiftRow('w9', 'FRIDAY PA 9-5', 'PA', 6, 9, 17))
    tests.push(testRow('x5', 'Human Biology', 'Genetics test', 3, 8, 30), testRow('x6', 'Religion', 'Reflection due', 3, 9), testRow('x7', 'Human Biology', 'Lab report', 5, 0), testRow('x8', 'Chemistry', 'Titration prac', 5, 5), testRow('x9', 'Methods', 'Quiz', 4, 16, 30))
  }
  return { shifts, tests }
}

/** The Alerts tab fixtures, hung off the demo clock (Sat 21 Nov 2026, 3:48 pm Perth). `alerts` is a normal list, `alertsmany` overflows
 *  the pills, `alertslong` has very long text, `alertsempty` has none. Any other mode shows the normal list. */
function alertsFixture(mode: string): AlertRow[] {
  if (mode === 'alertsempty' || mode === 'empty') return []
  const ago = (min: number) => perthAt(0, 15, 48 - min)
  const row = (id: string, type: string, title: string, body: string, min: number, extra: Partial<AlertRow> = {}): AlertRow =>
    ({ id, type, title, body, action_label: null, action_url: null, created_at: ago(min), read_at: null, ...extra })
  const base = [
    row('a1', 'shift_cover', 'Cover: Sat 5 to 10', 'Blink, grill close', 4, { action_label: 'Open Blink', action_url: 'https://example.com/blink' }),
    row('a2', 'task_done', 'Chem summary done', 'TickTick', 60),
    row('a3', 'message', 'New message', 'Messages, hidden', 120),
    row('a4', 'new_mark', 'Mark released', 'SEQTA, Human Bio', 180),
    row('a5', 'sixers_final', 'Sixers 118 to 104', 'Final, beat the Bucks', 240),
    row('a6', 'battery_low', 'Battery 10%', 'Laptop, plug in', 300),
  ]
  if (mode === 'alertsmany') base.push(row('a7', 'call', 'Missed call', 'Mum', 330), row('a8', 'focus_done', 'Focus done', 'Methods, 50 min', 400), row('a9', 'message', 'New message', 'Messages, hidden', 480), row('a10', 'task_done', 'Maths sheet done', 'TickTick', 600))
  if (mode === 'alertslong') base[2] = row('a3', 'message', 'A very long message title that keeps going and going past the edge of the pill', 'Messages with a body line that is also far too long to ever fit in one line here', 120)
  return base
}

export function mockBackend(mode: string): Backend {
  const now = new Date()
  const mon = weekStart(now)
  const wk = mode === 'week' || mode === 'weekbusy' ? weekFixture(mode === 'weekbusy') : null
  const shifts: Shift[] = wk ? wk.shifts :
    mode === 'empty'
      ? []
      : [
          { id: '1', title: 'Checkout', station: 'Front end', starts_at: at(mon, 16), ends_at: at(mon, 20), is_public_holiday: false },
          { id: '2', title: 'Deli', station: 'Fresh', starts_at: at(addDays(mon, 2), 15, 30), ends_at: at(addDays(mon, 2), 21), is_public_holiday: mode === 'holiday' },
          { id: '3', title: 'Nightfill', station: 'Grocery', starts_at: at(addDays(mon, 5), 9), ends_at: at(addDays(mon, 5), 15), is_public_holiday: false },
          { id: '4', title: 'Checkout', station: 'Front end', starts_at: at(addDays(mon, 6), 10), ends_at: at(addDays(mon, 6), 16), is_public_holiday: false },
          { id: '5', title: 'Checkout', station: 'Front end', starts_at: new Date(now.getTime() + 26 * HOUR + 14 * 6e4).toISOString(), ends_at: new Date(now.getTime() + 31 * HOUR).toISOString(), is_public_holiday: false },
        ]
  const tests: Test[] = wk ? wk.tests :
    mode === 'empty'
      ? []
      : [
          { id: 't', subject: 'Chemistry', title: 'Organic chemistry test', due_at: new Date(now.getTime() + 41 * HOUR + 30 * 6e4).toISOString() },
          { id: 't2', subject: 'Methods', title: 'Calculus test', due_at: new Date(now.getTime() + 5 * 24 * HOUR).toISOString() },
          { id: 't3', subject: 'English', title: 'Text response', due_at: new Date(now.getTime() + 12 * 24 * HOUR).toISOString() },
        ]
  const sessions: StudySession[] =
    mode === 'empty'
      ? []
      : [
          { id: 's1', subject: 'Methods', started_at: new Date(now.getTime() - 5 * HOUR).toISOString(), ended_at: new Date(now.getTime() - 4.2 * HOUR).toISOString(), minutes: 48 },
          { id: 's2', subject: 'Chemistry', started_at: new Date(now.getTime() - 3 * HOUR).toISOString(), ended_at: new Date(now.getTime() - 2.5 * HOUR).toISOString(), minutes: 30 },
          { id: 's3', subject: 'Human Biology', started_at: new Date(now.getTime() - 2 * HOUR).toISOString(), ended_at: new Date(now.getTime() - 1.6 * HOUR).toISOString(), minutes: 25 },
        ]
  // The open session survives reloads, like the real table does, so reload-mid-timer can be tested with the mock.
  const MOCK_KEY = 'halo.mock.active'
  const stored = (() => { try { return JSON.parse(localStorage.getItem(MOCK_KEY) ?? 'null') as StudySession | null } catch { return null } })()
  const keep = (v: StudySession | null) => { try { v ? localStorage.setItem(MOCK_KEY, JSON.stringify(v)) : localStorage.removeItem(MOCK_KEY) } catch { /* ignore */ } }
  let active: StudySession | null = stored ??
    (mode === 'running' ? { id: 'a', subject: 'Specialist', started_at: new Date(now.getTime() - 17 * 6e4 - 23e3).toISOString(), ended_at: null, minutes: null } : null)

  const alerts = alertsFixture(mode)
  const alertListeners = new Set<() => void>()
  // Dev only: lets a test play the part of the scheduled task that inserts a row.
  ;(globalThis as unknown as { __mockAlerts?: unknown }).__mockAlerts = {
    insert: (r: Partial<AlertRow> & { id: string; type: string; title: string }) => {
      alerts.unshift({ body: '', action_label: null, action_url: null, created_at: new Date().toISOString(), read_at: null, ...r })
      alertListeners.forEach((f) => f())
    },
  }
  const gate = async <T>(v: T): Promise<T> => {
    if (mode === 'loading') await new Promise(() => {})
    await sleep(120)
    if (mode === 'error') throw new Error('Failed to fetch')
    return v
  }

  return {
    nextShift: (n) => gate(shifts.filter((s) => new Date(s.ends_at) > n).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null),
    nextTest: (n) => gate(tests.find((t) => new Date(t.due_at) > n) ?? null),
    upcomingTests: (n) => gate(tests.filter((t) => new Date(t.due_at) > n)),
    testsBetween: (a, b) => gate(tests.filter((t) => new Date(t.due_at) >= a && new Date(t.due_at) < b)),
    shiftsBetween: (a, b) => gate(shifts.filter((s) => new Date(s.starts_at) < b && new Date(s.ends_at) > a)),
    settings: () => gate({ ...DEFAULT_SETTINGS }),
    activeSession: () => gate(active),
    sessionsSince: (d) => gate(sessions.filter((s) => new Date(s.started_at) >= d)),
    subjects: () => gate([...new Set([...tests.map((t) => t.subject), ...sessions.map((s) => s.subject)])]),
    async startSession(subject) {
      active = { id: String(Date.now()), subject, started_at: new Date().toISOString(), ended_at: null, minutes: null }
      keep(active)
      return gate(active)
    },
    async stopSession(_id, endedAt = new Date()) {
      const s = { ...active!, ended_at: endedAt.toISOString() }
      s.minutes = Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 6e4)
      sessions.unshift(s)
      active = null
      keep(null)
      return gate(s)
    },
    unreadAlerts: () => gate(alerts.filter((a) => !a.read_at).map((a) => ({ ...a }))),
    async markAlertsRead(ids) {
      for (const a of alerts) if (ids.includes(a.id)) a.read_at = new Date().toISOString()
      await sleep(80)
    },
    onAlertsChange(cb) { alertListeners.add(cb); return () => alertListeners.delete(cb) },
    onShiftsChange(_cb, onStatus) {
      setTimeout(() => onStatus?.(mode !== 'error'), 200)
      return () => {}
    },
  }
}
