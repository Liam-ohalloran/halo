// Motion engine for the component library (HALO.md 3.5).
// One shared loop drives every spring, so slow motion (x0.25), pause and single frame step
// work for the whole page at once. Springs are interruptible: retargeting keeps position and velocity.

export const motion = {
  /** Time scale. 1 is normal, 0.25 is slow motion. */
  scale: 1,
  paused: false,
  /** Preview Reduce motion without changing the OS setting. */
  forceReduced: false,
}

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
export const reduced = (): boolean => motion.forceReduced || !!mq?.matches

/** CSS durations multiply by var(--slow), so CSS transitions follow slow motion too. */
export function setTimeScale(scale: number): void {
  motion.scale = scale
  document.documentElement.style.setProperty('--slow', String(1 / scale))
}
export function setForceReduced(on: boolean): void {
  motion.forceReduced = on
  document.documentElement.classList.toggle('reduce-motion', on)
}
/** Stretch a duration in ms by the current time scale. */
export const slow = (ms: number): number => ms / motion.scale

// ---- Springs ---------------------------------------------------------------

export interface SpringParams { k: number; c: number; m?: number }

/** Spring presets. Numbers come straight from HALO.md 3.5. */
export const SPRING = {
  open: { k: 380, c: 28 },
  close: { k: 420, c: 32 },
  alert: { k: 380, c: 22 },
  change: { k: 380, c: 28 },
  squash: { k: 520, c: 26 },
  /** Reduce motion: critically damped, settles in about 200 ms, no overshoot. */
  reduced: { k: 400, c: 40 },
} satisfies Record<string, SpringParams>

export class Spring {
  x: number
  v = 0
  target: number
  k = 380
  c = 28
  m = 1
  constructor(x: number) { this.x = x; this.target = x }
  set(p: SpringParams): void { this.k = p.k; this.c = p.c; this.m = p.m ?? 1 }
  /** Retarget without touching position or velocity, so the motion reverses smoothly. */
  to(target: number): void { this.target = target }
  snap(x: number): void { this.x = x; this.target = x; this.v = 0 }
  get settled(): boolean { return Math.abs(this.x - this.target) < 0.01 && Math.abs(this.v) < 0.02 }
  step(dt: number): void {
    // Sub-step so large frames stay stable.
    // Capped so a bad dt (NaN, Infinity, a huge stall) can never turn into an endless loop.
    if (!Number.isFinite(dt) || dt <= 0) return
    const n = Math.min(60, Math.max(1, Math.ceil(dt / (1 / 240))))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      const a = (-this.k * (this.x - this.target) - this.c * this.v) / this.m
      this.v += a * h
      this.x += this.v * h
    }
    if (this.settled) { this.x = this.target; this.v = 0 }
  }
}

// ---- Shared loop -----------------------------------------------------------

/** Return true to stay registered for the next frame. */
export type Ticker = (dt: number) => boolean
const tickers = new Set<Ticker>()
type Timer = { at: number; fn: () => void; dead: boolean }
const timers = new Set<Timer>()
let clock = 0
let raf = 0
let last = 0
let stepRequests = 0

function frame(now: number): void {
  raf = 0
  if (document.hidden) { last = 0; return } // HALO.md 3.8: nothing runs while the tab is hidden
  const real = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60
  last = now
  let dt = real * motion.scale
  if (motion.paused) {
    if (stepRequests > 0) { stepRequests--; dt = (1 / 60) * motion.scale } else dt = 0
  }
  if (dt > 0) run(dt)
  if (tickers.size || timers.size) schedule()
}
function run(dt: number): void {
  clock += dt
  for (const t of [...timers]) {
    if (t.dead) { timers.delete(t); continue }
    if (clock >= t.at) { timers.delete(t); t.fn() }
  }
  for (const t of [...tickers]) if (!t(dt)) tickers.delete(t)
}
function schedule(): void { if (!raf) raf = requestAnimationFrame(frame) }

export function addTicker(t: Ticker): void { tickers.add(t); schedule() }
/** Timer on the motion clock, so it slows down, pauses and steps with everything else. */
export function after(ms: number, fn: () => void): () => void {
  const t: Timer = { at: clock + ms / 1000, fn, dead: false }
  timers.add(t)
  schedule()
  return () => { t.dead = true }
}
export function setPaused(p: boolean): void {
  motion.paused = p
  for (const a of document.getAnimations()) p ? a.pause() : a.play()
}
/** Advance one frame (1/60 s of motion time) while paused. */
export function stepFrame(): void {
  if (!motion.paused) return
  stepRequests++
  const dtMs = (1000 / 60) * motion.scale
  for (const a of document.getAnimations()) a.currentTime = Number(a.currentTime ?? 0) + dtMs
  schedule()
  // Animations created by this step start playing, so hold them too.
  requestAnimationFrame(() => requestAnimationFrame(() => { if (motion.paused) for (const a of document.getAnimations()) a.pause() }))
}
document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('is-hidden', document.hidden)
  if (!document.hidden) { last = 0; schedule() }
})

// ---- Web Animations helper (opacity, transform, filter only) -----------------

export function animate(el: Element, frames: Keyframe[], o: { duration: number; delay?: number; easing?: string; fill?: FillMode }): Animation {
  const a = el.animate(frames, { duration: slow(o.duration), delay: slow(o.delay ?? 0), easing: o.easing ?? 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: o.fill ?? 'both' })
  if (motion.paused) a.pause()
  return a
}
