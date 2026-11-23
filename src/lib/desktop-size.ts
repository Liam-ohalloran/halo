// Card 25: pure sizing rules for the desktop window, so they can be unit tested without a browser or Tauri.
// The window is made once, at startup, as big as the island ever gets (the open panel, or the fanned stack of alert
// pills) plus a margin all round for the border glow, pinned top centre. It is never resized again. The page draws the
// island inside it with CSS and only the click through regions change: everything that is not the island (or the stack
// under it) lets the mouse through.

export type DesktopStyle = 'island' | 'notch'

/** Room for the ears that hang off each top corner in Notch style (shell.css: 10 px wide, 11 px out). */
export const EAR = 12
/** Island style floats this far below the top edge of the monitor. The gap is part of the window (the page draws the
 *  island that far down), so the window always starts at the very top and the gap is click through. */
export const ISLAND_GAP = 8
/** Room round the island for the border glow (about 24 px wide), so it is never cut off by the window's edge. */
export const GLOW = 24

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

/**
 * The window: the same size in both styles and in every state, for the whole life of the app. Wide enough for the open
 * panel with its ears (or the fanned stack), tall enough for the open panel or the fanned stack under the island, plus
 * the Island style gap and the glow margin round it.
 */
export function windowSize(): Box {
  const stack = stackBox(6, true)!
  const w = Math.max(600 + 2 * EAR, stack.w)
  const h = Math.max(290, 46 + STACK_GAP + CHARGE_DROP + stack.h) // 46: the tallest closed island (Leave now)
  return { w: Math.ceil(w + 2 * GLOW), h: Math.ceil(ISLAND_GAP + h + GLOW) }
}

/** The parts that take the mouse, placed inside the fixed window: centred, at the top (Island style floats 8 px down). */
export function regionsFor(l: Layout, style: DesktopStyle): Region[] {
  const win = windowSize()
  const gap = style === 'island' ? ISLAND_GAP : 0
  const drop = STACK_GAP + (l.charge ? CHARGE_DROP : 0)
  const cx = (w: number) => (win.w - w) / 2
  const regions: Region[] = [{ x: cx(l.island.w), y: gap, w: l.island.w, h: l.island.h, rt: style === 'island' ? l.island.r : 0, rb: l.island.r }]
  if (l.stack) regions.push({ x: cx(l.stack.w), y: gap + l.island.h + drop, w: l.stack.w, h: l.stack.h, rt: 23, rb: 23 })
  return regions
}

/** Parse `--cw: 200px` style values. NaN becomes the fallback. */
export function px(v: string, fallback: number): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}
