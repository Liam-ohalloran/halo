// Dev-only fixtures for screenshots and design review. Never shipped (guarded by import.meta.env.DEV).
import type { AlertRow, Backend, Shift, StudySession, Test } from '../types'
import type { Goal, MoneyItem } from '../lib/money'
import type { Mark } from '../lib/marks'
import type { TaskRun } from '../lib/claude'
import { badge, type ShelfItem } from '../lib/shelf'
import { DEFAULT_COUNTDOWNS, type Countdown } from '../lib/widgets'
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


/** Money and Marks fixtures (card 21), hung off the demo clock (Sat 21 Nov 2026). `money` is a normal month, `moneymany` overflows every
 *  tile with long names, `moneyempty` has nothing. Same for `marks`. Any other mode has no money or marks rows. */
const isoDay = (d: number) => new Date(Date.UTC(2026, 10, 21 + d)).toISOString().slice(0, 10)
function moneyFixture(mode: string): { shifts: Shift[]; items: MoneyItem[]; goals: Goal[] } {
  if (!mode.startsWith('money') || mode === 'moneyempty') return { shifts: [], items: [], goals: [] }
  const many = mode === 'moneymany'
  const shifts = [
    shiftRow('m1', 'SATURDAY PA 6:30-3', 'PA', 0, 6.5, 15), shiftRow('m2', 'TUESDAY PI 4-9', 'PI', -4, 16, 21), shiftRow('m3', 'THURSDAY PA 5:30-9', 'PA', -2, 17.5, 21),
    shiftRow('m4', 'SUNDAY PL 6-2', 'PL', 1, 6, 14), shiftRow('m5', 'SATURDAY PA 5:30-10', 'PA', -7, 17.5, 22), shiftRow('m6', 'SUNDAY PA 6-2', 'PA', -6, 6, 14),
    shiftRow('m7', 'FRIDAY PB 4-9', 'PB', -8, 16, 21), shiftRow('m8', 'SATURDAY PA 6:30-3', 'PA', -14, 6.5, 15), shiftRow('m9', 'WEDNESDAY PI 4-9', 'PI', -17, 16, 21),
  ]
  const item = (id: string, kind: 'spend' | 'sub', name: string, amount: number, category: string, d: number): MoneyItem => ({ id, kind, name, amount, category, on_date: isoDay(d) })
  const items = [
    item('i1', 'spend', 'Boost Juice', 9.5, 'Food', -1), item('i2', 'spend', 'Transperth', 4.8, 'Travel', -2), item('i3', 'spend', 'Cinema', 32.2, 'Fun', -3),
    item('i4', 'spend', 'Lunch', 48.9, 'Food', -4), item('i5', 'spend', 'Cap', 18, 'Shop', -4), item('i6', 'spend', 'Uber', 19.2, 'Travel', -5), item('i7', 'spend', 'Snacks', 10, 'Other', -1),
    item('s1', 'sub', 'Spotify', 13.99, 'Subscription', -9), item('s2', 'sub', 'Netflix', 18.99, 'Subscription', 11), item('s3', 'sub', 'iCloud', 4.49, 'Subscription', 14), item('s4', 'sub', 'Xbox', 4.49, 'Subscription', 18),
  ]
  const goals: Goal[] = [
    { id: 'g1', name: 'Car fund', saved: 1840, target: 5000, colour: '#5CFF7A' }, { id: 'g2', name: 'GC trip', saved: 620, target: 900, colour: '#FFC23D' }, { id: 'g3', name: 'Laptop', saved: 310, target: 1800, colour: '#3D9BFF' },
  ]
  if (many) {
    shifts.push(shiftRow('m10', 'SUNDAY EXTRA PA 10-1', 'PA', 1, 10, 13), shiftRow('m11', 'FRIDAY PA 9-5', 'PA', -1, 9, 17), shiftRow('m12', 'MONDAY CLOSE 3-10', 'CL', -5, 15, 22))
    items.push(
      item('i8', 'spend', 'A very long place name that keeps on going', 123.45, 'Food', -1), item('i9', 'spend', 'Concert tickets and a taxi home', 289.99, 'Fun', -2),
      item('s5', 'sub', 'YouTube Premium Family Plan', 22.99, 'Subscription', 5), item('s6', 'sub', 'Disney Plus', 13.99, 'Subscription', 7), item('s7', 'sub', 'Apple Music', 12.99, 'Subscription', 9),
    )
    goals.push({ id: 'g4', name: 'Japan trip with the whole group', saved: 12000.5, target: 15000, colour: '#FF2FA3' }, { id: 'g5', name: 'Phone', saved: 100, target: 1500, colour: '#BF5AF2' })
  }
  return { shifts, items, goals }
}
function marksFixture(mode: string): Mark[] {
  if (!mode.startsWith('marks') || mode === 'marksempty') return []
  let n = 0
  const m = (subject: string, assessment: string, score: number, d: number, out_of = 100, weighting: number | null = 10): Mark => ({ id: `k${++n}`, subject, assessment, score, out_of, weighting, date: isoDay(d) })
  const rows = [
    ...[72, 78, 75, 81, 84].map((v, i) => m('Chemistry', `Test ${i + 1}`, v, -80 + i * 15)),
    ...[80, 83, 86, 85, 88].map((v, i) => m('Methods', `Test ${i + 1}`, v, -78 + i * 15)),
    ...[70, 74, 77, 73, 79].map((v, i) => m('Specialist', `Test ${i + 1}`, v, -76 + i * 15)),
    ...[85, 88, 87, 90, 91].map((v, i) => m('Human Biology', `Test ${i + 1}`, v, -74 + i * 15)),
    ...[76, 79, 81, 80, 82].map((v, i) => m('English', `Task ${i + 1}`, v, -72 + i * 15)),
    m('Religion', 'Reflection', 41, -30, 50, 15),
  ]
  if (mode === 'marksmany') rows.push(m('Digital Technologies and Design', 'Major project', 46, -3, 50, 30), m('Physical Education Studies', 'Practical', 17, -4, 20), m('Geography', 'Fieldwork report', 33, -5, 40))
  return rows
}

/** The Night tab fixtures (card 23), hung off the demo clock (Sat 21 Nov 2026). `night` has a Sunday 6 am shift (alarm 5, lights out 9 pm),
 *  `nightmany` has only a long named test at 8:30 am, `nightempty` has nothing on tomorrow. */
function nightFixture(mode: string): { shifts: Shift[]; tests: Test[] } {
  if (mode === 'nightempty') return { shifts: [], tests: [] }
  if (mode === 'nightmany') return { shifts: [], tests: [testRow('n1', 'Human Biology', 'Genetics and evolution revision test with a very long name', 1, 8, 30)] }
  return weekFixture(false)
}
/** Claude, Shelf and Widgets fixtures (card 22), hung off the demo clock (Sat 21 Nov 2026, 3:48 pm Perth). `claude` has a few task runs,
 *  `claudemany` has long names, `claudeempty` has none. `shelf` has five things, `shelfmany` is full with long names, `shelfempty` has none.
 *  `widgets` has the three countdowns, `widgetsmany` gives them long names, `widgetsempty` starts with an empty table (the app fills it in). */
function runsFixture(mode: string): TaskRun[] {
  if (!mode.startsWith('claude') || mode === 'claudeempty') return []
  const at = (min: number) => perthAt(0, 15, 48 - min)
  const run = (id: string, title: string, status: TaskRun['status'], detail: string, min: number): TaskRun => ({ id, title, status, detail, created_at: at(min), finished_at: status === 'running' ? null : at(min - 2) })
  const rows = [run('r1', 'Morning briefing', 'done', 'Sent to Alerts', 480), run('r2', 'Sync TickTick', 'running', '', 3), run('r3', 'Blink cover check', 'done', 'No new covers', 95), run('r4', 'New marks check', 'failed', 'SEQTA sign in expired', 200)]
  if (mode === 'claudemany') rows.unshift(run('r5', 'A scheduled task with a very long name that keeps going', 'done', 'And a detail line that is also far too long to ever fit in one line here', 20), run('r6', 'Another one', 'done', '', 30))
  return rows
}
function shelfFixture(mode: string): ShelfItem[] {
  if (!mode.startsWith('shelf') || mode === 'shelfempty') return []
  let n = 0
  const f = (name: string, size: number, mime: string, min: number): ShelfItem => ({ id: `f${++n}`, kind: 'file', name, content: '', storage_path: `u/${n}/${name}`, size_bytes: size, mime, created_at: perthAt(0, 15, 48 - min) })
  const rows: ShelfItem[] = [
    f('Chem summer work.pdf', 2.1 * 1024 * 1024, 'application/pdf', 5), f('Halo board.png', 840 * 1024, 'image/png', 30), f('TASKS.md', 24 * 1024, 'text/markdown', 90),
    { id: 'l1', kind: 'link', name: 'curtin.edu.au', content: 'https://www.curtin.edu.au/study/', storage_path: null, size_bytes: null, mime: null, created_at: perthAt(0, 12, 0) },
    { id: 't1', kind: 'text', name: 'Ring Mum about Sunday', content: 'Ring Mum about Sunday lunch, and ask about the car.', storage_path: null, size_bytes: null, mime: null, created_at: perthAt(0, 11, 0) },
  ]
  if (mode === 'shelfmany') rows.unshift(f('A really long file name for the ninety page report final version 7.docx', 18 * 1024 * 1024, 'application/msword', 2), f('Methods formula sheet.pdf', 310 * 1024, 'application/pdf', 3), f('Photo.jpg', 4.2 * 1024 * 1024, 'image/jpeg', 4))
  return rows
}
function countdownFixture(mode: string): Countdown[] {
  if (!mode.startsWith('widgets') || mode === 'widgetsempty') return []
  const rows = DEFAULT_COUNTDOWNS.map((d, i) => ({ ...d, id: `c${i}` }))
  if (mode === 'widgetsmany') { rows[0].name = 'Doomsday and everything after'; rows[1].name = 'Birthday party'; rows[2].name = 'Christmas Day lunch' }
  return rows
}

export function mockBackend(mode: string): Backend {
  const now = new Date()
  const mon = weekStart(now)
  const wk = mode === 'week' || mode === 'weekbusy' ? weekFixture(mode === 'weekbusy') : mode.startsWith('night') ? nightFixture(mode) : null
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

  const money = moneyFixture(mode)
  const marksRows = marksFixture(mode)
  const runs = runsFixture(mode)
  const runListeners = new Set<() => void>()
  const shelf = shelfFixture(mode)
  const shelfListeners = new Set<() => void>()
  const cds = countdownFixture(mode)
  // Dev only: lets a test play the part of a scheduled task or the phone adding to the Shelf.
  ;(globalThis as unknown as { __mockClaude?: unknown }).__mockClaude = {
    insertRun: (r: Partial<TaskRun> & { id: string; title: string }) => { runs.unshift({ status: 'done', detail: '', created_at: new Date().toISOString(), finished_at: null, ...r }); runListeners.forEach((f) => f()) },
    insertShelf: (r: ShelfItem) => { shelf.unshift(r); shelfListeners.forEach((f) => f()) },
  }
  const nextId = () => `n${Math.random().toString(36).slice(2, 9)}`
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
    shiftsBetween: (a, b) => gate((mode.startsWith('money') ? money.shifts : shifts).filter((s) => new Date(s.starts_at) < b && new Date(s.ends_at) > a)),
    goals: () => gate(money.goals.map((g) => ({ ...g }))),
    async saveGoal(g) {
      if (g.id) { const x = money.goals.find((y) => y.id === g.id); if (x) Object.assign(x, g) } else money.goals.push({ ...g, id: nextId() })
      await sleep(80)
    },
    async deleteGoal(id) { money.goals.splice(money.goals.findIndex((g) => g.id === id), 1); await sleep(80) },
    moneyItems: () => gate(money.items.map((i) => ({ ...i }))),
    async addMoneyItem(i) { money.items.unshift({ ...i, id: nextId() }); await sleep(80) },
    async deleteMoneyItem(id) { money.items.splice(money.items.findIndex((i) => i.id === id), 1); await sleep(80) },
    marks: () => gate(marksRows.map((m) => ({ ...m }))),
    async addMark(m) { marksRows.push({ ...m, id: nextId() }); await sleep(80) },
    async deleteMark(id) { marksRows.splice(marksRows.findIndex((m) => m.id === id), 1); await sleep(80) },
    taskRuns: () => gate(runs.map((r) => ({ ...r }))),
    onTaskRunsChange(cb) { runListeners.add(cb); return () => runListeners.delete(cb) },
    async askClaude(prompt) {
      await sleep(500)
      if (mode === 'claudeoffline') throw new Error('not set up')
      return `You asked: ${prompt.slice(0, 60)}. This is a sample answer from the dev backend.`
    },
    shelfItems: () => gate(shelf.map((s) => ({ ...s }))),
    async addShelfFile(file) {
      await sleep(150)
      shelf.unshift({ id: nextId(), kind: 'file', name: file.name, content: '', storage_path: `u/${file.name}`, size_bytes: file.size, mime: file.type || null, created_at: new Date().toISOString() })
      shelfListeners.forEach((f) => f())
    },
    async addShelfText(it) { await sleep(80); shelf.unshift({ id: nextId(), ...it, storage_path: null, size_bytes: null, mime: null, created_at: new Date().toISOString() }); shelfListeners.forEach((f) => f()) },
    async removeShelfItem(it) { await sleep(80); shelf.splice(shelf.findIndex((s) => s.id === it.id), 1); shelfListeners.forEach((f) => f()) },
    shelfUrl: async (it) => `https://example.test/signed/${encodeURIComponent(it.name)}?badge=${badge(it)}`,
    onShelfChange(cb) { shelfListeners.add(cb); return () => shelfListeners.delete(cb) },
    countdowns: () => gate(cds.map((c) => ({ ...c }))),
    async saveCountdown(c) { const x = cds.find((y) => y.id === c.id); if (x) Object.assign(x, c); await sleep(80) },
    async seedCountdowns() { await sleep(80); if (!cds.length) cds.push(...DEFAULT_COUNTDOWNS.map((d, i) => ({ ...d, id: `c${i}` }))) },
    async uiPrefs() {
      await sleep(60)
      try { return JSON.parse(localStorage.getItem('halo.mock.tabprefs') ?? 'null') } catch { return null }
    },
    async saveUiPrefs(p) { await sleep(60); try { localStorage.setItem('halo.mock.tabprefs', JSON.stringify(p)) } catch { /* ignore */ } },
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
