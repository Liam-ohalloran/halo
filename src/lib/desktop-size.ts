// Card 25: pure sizing rules for the desktop window, so they can be unit tested without a browser or Tauri.
// The window is only ever as big as the island, plus the ears in Notch style and the stack of alert pills while it
// shows (card 18). While the island is animating it gets a small margin so the open spring's overshoot is not clipped,
// then it shrinks back to the exact size. Everything in the window that is not the island or the stack is click through.

export type DesktopStyle = 'island' | 'notch'

/** Room for the ears that hang off each top corner in Notch style (shell.css: 10 px wide, 11 px out). */
export const EAR = 12
/** Island style floats this far below the top edge of the monitor. The gap is part of the window (the page draws the
 *  island that far down), so the window always starts at the very top and the gap is click through. */
export const ISLAND_GAP = 8
/** Extra room while the island is moving, so the spring's overshoot is not cut off. */
export const MOVE_MARGIN = 24
/** How long the island must stay still before the window shrinks back to it. The longest CSS move is 520 ms. */
export const SETTLE_MS = 700

export interface Box { w: number; h: number }
export interface IslandShape extends Box { r: number }
/** A part of the window that takes the mouse. Logical px from the window's top left. Corner radii: top and bottom. */
export interface Region { x: number; y: number; w: number; h: number; rt: number; rb: number }

/** The island's end size for its current state: 600 x 290 open, otherwise the collapsed size from the CSS variables. */
export function shellTarget(open: boolean, cw: number, ch: number, cr: number): IslandShape {
  return open ? { w: 600, h: 290, r: 26 } : { w: cw, h: ch, r: cr }
}

/** Gap between the island and its stack of pills, and the extra drop while the charging pill floats there. */
export const STACK_GAP = 10
export const CHARGE_DROP = 42

/** The stack of alert pills (card 18). Collapsed it is one pill with two behind it. Fanned it is a row each, the last one a card. */
export function stackBox(count: number, fan: boolean): Box | null {
  if (count <= 0) return null
  if (!fan) return { w: 300, h: 40 + Math.min(count - 1, 2) * 9 + (count > 1 ? 22 : 0) }
  return { w: 520, h: (count - 1) * 52 + 84 + 30 }
}

export interface Layout { island: IslandShape; stack: Box | null; charge?: boolean }
export interface Placed { win: Box; regions: Region[] }

/** Window size and the parts that take the mouse. `margin` is the allowance while the island moves. */
export function layoutFor(l: Layout, style: DesktopStyle, margin = 0): Placed {
  const ear = style === 'notch' ? EAR : 0
  const gap = style === 'island' ? ISLAND_GAP : 0
  const drop = STACK_GAP + (l.charge ? CHARGE_DROP : 0)
  const stackH = l.stack ? drop + l.stack.h : 0
  const win: Box = {
    w: Math.ceil(Math.max(l.island.w + 2 * ear, l.stack?.w ?? 0) + 2 * margin),
    h: Math.ceil(gap + l.island.h + stackH + margin),
  }
  const cx = (w: number) => (win.w - w) / 2
  const regions: Region[] = [{ x: cx(l.island.w), y: gap, w: l.island.w, h: l.island.h, rt: style === 'island' ? l.island.r : 0, rb: l.island.r }]
  if (l.stack) regions.push({ x: cx(l.stack.w), y: gap + l.island.h + drop, w: l.stack.w, h: l.stack.h, rt: 23, rb: 23 })
  return { win, regions }
}

/** While moving: the larger of what the window already is and what the next state needs, so it only grows. */
export function growOnly(current: Box, next: Box): Box {
  return { w: Math.max(current.w, next.w), h: Math.max(current.h, next.h) }
}

/** Parse `--cw: 200px` style values. NaN becomes the fallback. */
export function px(v: string, fallback: number): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}
