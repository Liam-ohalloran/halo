// Card 29: what makes Controls and Audio feel instant and stay honest. Pure and DOM free, so the timing can be tested.
//
// Every tap or drag is drawn on screen first. The helper is told in the background, its reply settles the screen, and if it
// says no (or does not answer) the screen goes back to what it was and the control shakes. Drags send at most one request every
// 50 ms, newest value wins, and never two at once. The helper pushes every change over /events, so nothing polls while that
// stream is up. A slow 10 second poll only runs while the stream is down.

export const DRAG_MS = 50
/** The only polling left, and only while the event stream is down. */
export const FALLBACK_POLL_MS = 10_000
/** After Liam changes something, pushed values for it are older answers for this long. The helper's next look corrects anything real. */
export const SETTLE_MS = 900

type Timer = ReturnType<typeof setTimeout>
export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): Timer
  clearTimeout(t: Timer): void
}
export const realClock: Clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) }

export const clamp100 = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))
/** A slider moved by a key press or a wheel notch, kept between 0 and 100. */
export const stepLevel = (level: number, delta: number): number => clamp100(level + delta)

// ---- Drags ---------------------------------------------------------------------------------------------------------------

export interface DragSender<T> {
  /** The newest value. It goes out at once if nothing has been sent for 50 ms, otherwise at the next 50 ms slot. */
  push(v: T): void
  /** Send what is waiting now, without the wait (the finger came up). */
  flush(): void
  /** From the first push until the helper has answered the last one. Pushed events for this control must wait. */
  readonly busy: boolean
  /** Forget anything waiting. A request already out still gets its answer. */
  cancel(): void
}

export interface DragOptions<T, R> {
  send: (v: T) => Promise<R | null>
  /** The helper's answer to the newest value sent, and only when nothing newer is waiting (an older answer would pull the control back). */
  onReply?: (reply: R, sent: T) => void
  /** The helper said no or did not answer. */
  onFail?: (sent: T) => void
  ms?: number
  clock?: Clock
}

export function createDragSender<T, R = unknown>(o: DragOptions<T, R>): DragSender<T> {
  const clock = o.clock ?? realClock
  const ms = o.ms ?? DRAG_MS
  let waiting: { v: T } | null = null
  let inFlight = false
  let lastSent = -Infinity
  let timer: Timer | null = null

  function fire() {
    if (timer !== null) { clock.clearTimeout(timer); timer = null }
    if (!waiting || inFlight) return // an answer is on its way: its handler sends what is waiting
    const { v } = waiting
    waiting = null
    inFlight = true
    lastSent = clock.now()
    let p: Promise<R | null>
    try { p = o.send(v) } catch { p = Promise.resolve(null) }
    void p.catch(() => null).then((r) => {
      inFlight = false
      if (r === null) o.onFail?.(v)
      else if (!waiting) o.onReply?.(r, v)
      if (waiting) schedule()
    })
  }
  function schedule() {
    if (timer !== null || inFlight) return
    const wait = Math.max(0, lastSent + ms - clock.now())
    if (wait === 0) fire()
    else timer = clock.setTimeout(fire, wait)
  }
  return {
    push(v) { waiting = { v }; schedule() },
    flush() { lastSent = -Infinity; fire() },
    get busy() { return inFlight || waiting !== null },
    cancel() { waiting = null; if (timer !== null) { clock.clearTimeout(timer); timer = null } },
  }
}

// ---- Taps ----------------------------------------------------------------------------------------------------------------

export interface Action<T, R> {
  /** What the screen should show now, and (with `prev`) what to go back to. */
  next: T
  prev: T
  /** Draw a state. Called first with `next`, and again with `prev` if the helper says no. */
  apply(v: T): void
  /** Tell the helper. Null means it said no or did not answer. */
  send(): Promise<R | null>
  /** The helper's answer, when no newer tap on the same control has happened since. */
  reconcile?(reply: R): void
  /** After a rollback: shake the control, say why. */
  fail?(): void
}

export interface Actions {
  run<T, R>(key: string, a: Action<T, R>): Promise<boolean>
  /** True while a tap on this control is out, and for SETTLE_MS after its answer. Events pushed in that window are older. */
  settling(key: string): boolean
  /** How long until `settling` is over, at most (SETTLE_MS while a tap is still out). 0 when it is not settling. */
  settleLeft(key: string): number
}

export function createActions(clock: Clock = realClock, settleMs = SETTLE_MS): Actions {
  const seq = new Map<string, number>()
  const out = new Map<string, number>()
  const doneAt = new Map<string, number>()
  return {
    async run(key, a) {
      const n = (seq.get(key) ?? 0) + 1
      seq.set(key, n)
      out.set(key, (out.get(key) ?? 0) + 1)
      a.apply(a.next) // at once
      let r: Awaited<ReturnType<typeof a.send>> = null
      try { r = await a.send() } catch { r = null }
      out.set(key, (out.get(key) ?? 1) - 1)
      doneAt.set(key, clock.now())
      const newest = seq.get(key) === n
      if (r === null) {
        // Only the newest tap rolls back. If Liam tapped again meanwhile, that tap decides what the control shows.
        if (newest) { a.apply(a.prev); a.fail?.() }
        return false
      }
      if (newest) a.reconcile?.(r)
      return true
    },
    settling(key) { return this.settleLeft(key) > 0 },
    settleLeft(key) {
      if ((out.get(key) ?? 0) > 0) return settleMs
      const t = doneAt.get(key)
      return t === undefined ? 0 : Math.max(0, settleMs - (clock.now() - t))
    },
  }
}

/**
 * A pushed value that arrived while a control was settling is not applied (it may be older than Liam's own change), but it is
 * not lost either: the helper only says a state once. This remembers that something was held back, and when the settling is
 * over runs `read` once, which asks the helper for the truth. One pending read per key. Not polling: it only follows a change.
 */
export function createCatchUp(clock: Clock = realClock): { later(key: string, left: () => number, read: () => void): void; stop(): void } {
  const timers = new Map<string, Timer>()
  return {
    later(key, left, read) {
      if (timers.has(key)) return
      const arm = (ms: number) => timers.set(key, clock.setTimeout(() => {
        timers.delete(key)
        const l = left()
        if (l > 0) arm(l) // another tap in the meantime: wait for that one too
        else read()
      }, ms + 40))
      arm(left())
    },
    stop() { timers.forEach((t) => clock.clearTimeout(t)); timers.clear() },
  }
}

// ---- The fallback poll ---------------------------------------------------------------------------------------------------

export interface FallbackPoll { stop(): void }

/** Calls `refresh` every 10 seconds, but only while the panel is on screen and the event stream is down. */
export function createFallbackPoll(o: { refresh: () => void; onScreen: () => boolean; streamUp: () => boolean; ms?: number; clock?: Clock }): FallbackPoll {
  const clock = o.clock ?? realClock
  const ms = o.ms ?? FALLBACK_POLL_MS
  let stopped = false
  let timer: Timer | null = null
  const tick = () => {
    if (stopped) return
    if (o.onScreen() && !o.streamUp()) o.refresh()
    timer = clock.setTimeout(tick, ms)
  }
  timer = clock.setTimeout(tick, ms)
  return { stop() { stopped = true; if (timer !== null) clock.clearTimeout(timer) } }
}
