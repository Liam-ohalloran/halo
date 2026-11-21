import { fmtMinutes } from '../time.ts'

// Claude tab (card 22). The pure model: the task list scheduled tasks write into task_runs, and the plain answers the quick
// pills give straight from Halo's own data (no network, no key). Free text goes to the ask-claude edge function, which holds
// the Anthropic key. The frontend never sees it.

export interface TaskRun {
  id: string
  title: string
  status: 'running' | 'done' | 'failed'
  detail: string
  created_at: string
  finished_at: string | null
}

export const MAX_RUNS = 4

/** The runs to show: running ones first, then newest. */
export function recentRuns(rows: readonly TaskRun[]): TaskRun[] {
  const rank = (r: TaskRun) => (r.status === 'running' ? 0 : 1)
  return [...rows].sort((a, b) => rank(a) - rank(b) || Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, MAX_RUNS)
}

export const STATUS_COLOUR: Record<TaskRun['status'], string> = { done: '#5CFF7A', running: '#FFC23D', failed: '#FF453A' }

const dayFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'Australia/Perth' })
const timeFmt = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' })
const when = (d: Date, now: Date) => {
  const days = Math.round((Date.parse(new Date(d.getTime() + 8 * 36e5).toISOString().slice(0, 10)) - Date.parse(new Date(now.getTime() + 8 * 36e5).toISOString().slice(0, 10))) / 864e5)
  const t = timeFmt.format(d).replace(' ', '').toLowerCase().replace(/^(\d+):00/, '$1')
  return days === 0 ? `today at ${t}` : days === 1 ? `tomorrow at ${t}` : `${dayFmt.format(d)} at ${t}`
}

export function answerNext(shift: { starts_at: string; title: string } | null, test: { due_at: string; subject: string; title: string } | null, now: Date): string {
  const parts: string[] = []
  if (shift) parts.push(`Your next shift is ${shift.title}, ${when(new Date(shift.starts_at), now)}.`)
  if (test) parts.push(`Next test is ${test.subject}, ${test.title}, ${when(new Date(test.due_at), now)}.`)
  return parts.length ? parts.join(' ') : 'Nothing coming up. No shifts or tests booked.'
}

export function answerPay(w: { hours: number; gross: number; net: number }): string {
  if (w.hours <= 0) return 'No shifts this week yet, so nothing earned.'
  const h = Math.round(w.hours * 10) / 10
  return `$${w.gross.toFixed(2)} for ${h} ${h === 1 ? 'hour' : 'hours'} this week. About $${w.net.toFixed(2)} after tax.`
}

export function answerStudy(minutesToday: number, goal: number): string {
  if (minutesToday <= 0) return `No study logged today. The goal is ${fmtMinutes(goal)}.`
  return minutesToday >= goal ? `${fmtMinutes(minutesToday)} today. Goal reached.` : `${fmtMinutes(minutesToday)} today, ${fmtMinutes(goal - minutesToday)} to go.`
}

export function answerTasks(runs: readonly TaskRun[]): string {
  if (!runs.length) return 'No task runs yet.'
  const r = recentRuns(runs)[0]
  const verb = r.status === 'running' ? 'is running' : r.status === 'failed' ? 'failed' : 'finished'
  return `${r.title} ${verb}.${r.detail ? ' ' + r.detail : ''}`
}
