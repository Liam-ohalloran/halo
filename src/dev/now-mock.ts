// Dev-only fixtures for the Now panel (screenshots and design review). Never shipped: main.ts only imports this under import.meta.env.DEV.
// Everything hangs off a fixed Perth Saturday so previews are repeatable: Sat 21 Nov 2026.
import type { Shift, StudySession, Test } from '../types'
import type { NowData, NowSource } from '../lib/now'

const MIN = 60_000
/** Perth (+08:00) time on Sat 21 Nov 2026 plus `dayOffset` days. */
const perth = (dayOffset: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, 21 + dayOffset, h - 8, m)).toISOString()

export type NowMode = 'full' | 'soon' | 'live' | 'quiet' | 'busy' | 'empty' | 'loading' | 'error'

/** The fixed clock to use for each mode. */
export function mockClock(mode: NowMode): Date {
  switch (mode) {
    case 'soon': return new Date(perth(0, 15, 48))      // 1:42 before the 5:30 pm shift
    case 'live': return new Date(perth(0, 18, 12))      // 42 minutes into the shift
    case 'busy': return new Date(perth(0, 9, 5))
    case 'empty': return new Date(perth(0, 10, 0))
    default: return new Date(perth(-1, 19, 30))          // Friday evening, shift is tomorrow
  }
}

export function mockSource(mode: NowMode): NowSource {
  const shift: Shift = { id: 'sh1', title: 'SATURDAY PA 5:30-9', station: 'PA', starts_at: perth(0, 17, 30), ends_at: perth(0, 21), is_public_holiday: false }
  const test: Test = { id: 't1', subject: 'Human Biology', title: 'Unit 1 and 2 exam', due_at: perth(3, 8, 30) }
  const mk = (id: string, subject: string, h: number, m: number, mins: number): StudySession => ({
    id, subject, started_at: perth(0, h, m), ended_at: new Date(Date.parse(perth(0, h, m)) + mins * MIN).toISOString(), minutes: mins,
  })
  const weekSessions = [mk('w1', 'Human Biology', 10, 0, 40), mk('w2', 'Human Biology', 15, 0, 45), mk('w3', 'Methods', 12, 0, 30)]
  const todayTests: Test[] = [{ id: 't2', subject: 'Methods', title: 'Calculus quiz', due_at: perth(0, 13) }]
  const busyExtra: StudySession[] = [mk('b1', 'Chemistry', 7, 0, 25), mk('b2', 'Specialist', 8, 0, 30)]

  const full: NowData = { shift, test, today: { shifts: [shift], tests: todayTests, sessions: weekSessions.filter((s) => s.id !== 'w3').map((s) => s) }, weekSessions }
  const data: Record<NowMode, NowData | 'wait' | 'throw'> = {
    full: { ...full, today: { shifts: [], tests: [], sessions: [] } },
    soon: full,
    live: full,
    busy: { ...full, today: { shifts: [shift], tests: todayTests, sessions: [...busyExtra, ...weekSessions] } },
    quiet: { shift: null, test: null, today: { shifts: [], tests: [], sessions: weekSessions.slice(0, 1) }, weekSessions },
    empty: { shift: null, test: null, today: { shifts: [], tests: [], sessions: [] }, weekSessions: [] },
    loading: 'wait',
    error: 'throw',
  }
  return {
    async load() {
      const d = data[mode]
      if (d === 'wait') await new Promise(() => {})
      await new Promise((r) => setTimeout(r, 150))
      if (d === 'throw') throw new Error('Failed to fetch')
      return d as NowData
    },
    onChange: () => () => {},
  }
}
