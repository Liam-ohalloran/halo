// Card 26: scroll on the closed island to change the volume. The helper does the change and streams it back, which fires
// the volume pill the way a volume key does. This file is the maths and the wheel listener.

import { getVolume, onHelperEvent, setVolume } from './helper.ts'

/** Volume points per notch of a mouse wheel (a notch is 100 px). A trackpad sends many small amounts, which add up the same way. */
export const STEP = 4

/** How far one wheel event moves the volume, in volume points. Scrolling up is louder. */
export function wheelDelta(deltaY: number, deltaMode = 0): number {
  const notches = deltaMode === 1 ? -deltaY / 3 : deltaMode === 2 ? -deltaY : -deltaY / 100
  return notches * STEP
}

export const clampVolume = (v: number): number => Math.max(0, Math.min(100, v))

/** Wheel events that arrive faster than this are sent as one change. */
export const SEND_MS = 70
/** After scrolling, events from the helper are our own changes coming back. Ignore them for this long. */
export const SETTLE_MS = 1500

/**
 * Listens for the wheel over `el` while the island is closed. Returns a stop function.
 * The volume is kept as a fraction so slow trackpad scrolling still adds up, and shown values are whole numbers.
 */
export function attachScrollVolume(el: HTMLElement, isOpen: () => boolean): () => void {
  let level: number | null = null // what we think the volume is, as a fraction
  let timer = 0
  let loading: Promise<void> | null = null

  let lastScroll = 0
  const off = onHelperEvent((name, d) => {
    if (name !== 'volume') return
    const v = (d as { level?: number }).level
    // Our own changes come back as events a moment later, with older numbers while the wheel is still turning. Only
    // take an event as the new volume when we have not scrolled for a while (Liam used a key or another app).
    if (typeof v === 'number' && (level === null || Date.now() - lastScroll > SETTLE_MS)) level = v
  })

  async function ensureLevel(): Promise<boolean> {
    if (level !== null) return true
    loading ??= getVolume().then((v) => { if (v) level = v.level }).finally(() => { loading = null })
    await loading
    return level !== null
  }

  const onWheel = (e: WheelEvent) => {
    if (isOpen() || e.ctrlKey) return // open: the window handles the wheel. Ctrl is the browser's zoom.
    e.preventDefault()
    const delta = wheelDelta(e.deltaY, e.deltaMode)
    lastScroll = Date.now()
    void ensureLevel().then((ok) => {
      if (!ok || level === null) return
      level = clampVolume(level + delta)
      clearTimeout(timer)
      timer = window.setTimeout(() => { if (level !== null) void setVolume(Math.round(level)) }, SEND_MS)
    })
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => { el.removeEventListener('wheel', onWheel); off(); clearTimeout(timer) }
}
