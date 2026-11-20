import type { Backend, StudySession } from '../types'
import {
  begin, endedAt, idleState, isComplete, parseState, pause, progress, remainingMs, resume,
  type TimerState,
} from '../lib/study'

// The study timer's brain. One instance is shared by the panel and the compact pill so they never disagree.
// The state lives in localStorage, so a reload mid session picks up exactly where it was:
// a running timer keeps counting the time the page was closed, a paused one stays paused.
// A session is one study_sessions row. It is inserted on Start and closed on Reset or when the goal is hit,
// with ended_at = started_at + focused time, so paused time is never logged as study.

const KEY = 'halo.study.timer.v1'
export const TARGET_MIN = 25
/** The lengths the Study tab offers, in minutes. */
export const LENGTHS = [25, 50] as const

const store = {
  get(): string | null { try { return localStorage.getItem(KEY) } catch { return null } },
  set(v: string) { try { localStorage.setItem(KEY, v) } catch { /* private mode: still works, just not across reloads */ } },
}

export type LogKind = 'done' | 'reset'
export interface StudyTimerHandle {
  readonly state: TimerState
  /** True while talking to Supabase (starting or logging). Buttons should wait. */
  readonly busy: boolean
  /** True once init has finished reconciling with Supabase. */
  readonly ready: boolean
  init(): Promise<void>
  setSubject(name: string): void
  /** Change the focus length. Only while idle. */
  setLength(min: number): void
  start(): Promise<void>
  pause(): void
  resume(): void
  /** Ends the session and logs the focused time so far. Nothing studied is ever thrown away. */
  reset(): Promise<void>
  /** Called on every state change and about 4 times a second while running. */
  subscribe(cb: (now: number) => void): () => void
  onLogged(cb: (row: StudySession, kind: LogKind) => void): void
  onError(cb: (message: string) => void): void
  destroy(): void
}

export function plainError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/fetch|network|offline|failed/i.test(m)) return "Can't reach Halo. Check your connection and try again."
  if (/jwt|auth|permission|row-level/i.test(m)) return 'You are signed out. Sign in again.'
  return 'Something went wrong. Try again.'
}

export function createStudyTimer(api: Backend, defaultSubject: string): StudyTimerHandle {
  let state: TimerState = parseState(store.get()) ?? idleState(defaultSubject, TARGET_MIN)
  // The length survives a reload and carries over to the next session, so it is read back from the saved state.
  let lenMin = Math.round(state.targetMs / 60_000) || TARGET_MIN
  let busy = false
  let ready = false
  let finishing = false
  let alive = true
  let interval: number | undefined
  const subs = new Set<(now: number) => void>()
  let logged: (row: StudySession, kind: LogKind) => void = () => {}
  let failed: (message: string) => void = () => {}

  const emit = () => { const now = Date.now(); subs.forEach((f) => f(now)) }
  const save = () => store.set(JSON.stringify(state))
  const set = (next: TimerState) => { state = next; save(); syncTicking(); emit() }

  function syncTicking() {
    const want = alive && state.status === 'running' && !document.hidden
    if (want && interval == null) interval = window.setInterval(tick, 250)
    if (!want && interval != null) { clearInterval(interval); interval = undefined }
  }
  function tick() {
    const now = Date.now()
    if (isComplete(state, now)) { void finish('done'); return }
    subs.forEach((f) => f(now))
  }
  // Hidden tabs do not tick (HALO.md 3.8). On return, catch up at once. Elapsed time comes from the clock, not the ticks.
  const onVisible = () => { syncTicking(); if (!document.hidden) { if (isComplete(state, Date.now()) && state.status !== 'idle') void finish('done'); else emit() } }
  document.addEventListener('visibilitychange', onVisible)

  /** Close the session row. Failure keeps the session (paused at the focused time) so a retry can log it. */
  async function finish(kind: LogKind) {
    if (finishing) return
    const s = state
    if (s.status === 'idle') return
    finishing = true
    busy = true
    emit()
    const now = Date.now()
    try {
      if (s.sessionId) {
        const row = await api.stopSession(s.sessionId, new Date(endedAt(s, now)))
        set(idleState(s.subject, lenMin))
        logged(row, kind)
      } else {
        set(idleState(s.subject, lenMin))
      }
    } catch (e) {
      set(pause(s, now))
      failed(plainError(e))
    } finally {
      finishing = false
      busy = false
      emit()
    }
  }

  const handle: StudyTimerHandle = {
    get state() { return state },
    get busy() { return busy },
    get ready() { return ready },

    async init() {
      let remote: StudySession | null = null
      let offline = false
      // A slow or hung connection must not lock the timer. After 6 seconds carry on with what this browser remembers.
      try { remote = await Promise.race([api.activeSession(), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 6000))]) } catch { offline = true }
      if (!alive) return
      const local = state
      if (!offline && remote && (local.status === 'idle' || local.sessionId !== remote.id)) {
        // A session is open in Supabase that this browser does not know about, for example started on the phone.
        state = begin(idleState(remote.subject, lenMin), remote.id, Date.parse(remote.started_at))
      } else if (!offline && !remote && local.status !== 'idle') {
        state = idleState(local.subject, lenMin) // closed somewhere else
      }
      ready = true
      save()
      syncTicking()
      if (state.status !== 'idle' && isComplete(state, Date.now())) await finish('done')
      else emit()
    },

    setSubject(name) {
      if (state.status !== 'idle') return
      set({ ...state, subject: name })
    },

    setLength(min) {
      if (state.status !== 'idle' || !(min > 0)) return
      lenMin = min
      set({ ...state, targetMs: min * 60_000 })
    },

    async start() {
      if (busy || state.status !== 'idle') return
      busy = true
      emit()
      try {
        const row = await api.startSession(state.subject)
        set(begin(state, row.id, Date.parse(row.started_at)))
      } catch (e) {
        failed(plainError(e))
      } finally {
        busy = false
        emit()
      }
    },

    pause() { if (state.status === 'running') set(pause(state, Date.now())) },
    resume() {
      if (state.status !== 'paused') return
      if (isComplete(state, Date.now())) { void finish('done'); return } // a failed log retries on Resume
      set(resume(state, Date.now()))
    },
    reset() { return state.status === 'idle' ? Promise.resolve() : finish('reset') },

    subscribe(cb) { subs.add(cb); return () => { subs.delete(cb) } },
    onLogged(cb) { logged = cb },
    onError(cb) { failed = cb },
    destroy() {
      alive = false
      subs.clear()
      document.removeEventListener('visibilitychange', onVisible)
      if (interval != null) clearInterval(interval)
    },
  }
  return handle
}

/** Convenience for the UI: time left as 0 to 1 done and ms remaining. */
export function view(s: TimerState, now: number): { value: number; left: number } {
  return { value: progress(s, now), left: remainingMs(s, now) }
}
