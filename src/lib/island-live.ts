// Card 17: the closed island, one live thing at a time. Pure logic only (no DOM), so it can be unit tested.
// Sizes and colours come from the approved prototype (design/prototype/index.html, the LIVE buttons).

const MIN = 60_000

export type LiveKind = 'leave' | 'game' | 'timer' | 'shift' | 'music' | 'charge' | 'unread' | 'idle'

/** Highest priority first. The first one that is on wins. */
export const PRIORITY: readonly LiveKind[] = ['leave', 'game', 'timer', 'shift', 'music', 'charge', 'unread', 'idle']

export interface LiveFlags {
  leave?: boolean
  game?: boolean
  timer?: boolean
  shift?: boolean
  music?: boolean
  charge?: boolean
  /** Unread alerts. Above zero the idle island carries a gold dot. */
  unread?: number
}

/** Which state the closed island shows. Highest priority wins: leave, game, timer, shift, music, charge, unread, idle. */
export function pickLive(f: LiveFlags): LiveKind {
  if (f.leave) return 'leave'
  if (f.game) return 'game'
  if (f.timer) return 'timer'
  if (f.shift) return 'shift'
  if (f.music) return 'music'
  if (f.charge) return 'charge'
  return (f.unread ?? 0) > 0 ? 'unread' : 'idle'
}

export interface Look {
  w: number
  h: number
  /** Bottom corner radius. */
  r: number
  /** Key line and glow colour. */
  colour: string
  /** The outlined island: a glowing coloured border instead of a single line along the bottom. */
  ring: boolean
}

export const LOOK: Record<LiveKind, Look> = {
  leave: { w: 400, h: 46, r: 23, colour: '#FF453A', ring: false },
  game: { w: 400, h: 40, r: 20, colour: '#2f86ff', ring: false },
  timer: { w: 380, h: 64, r: 32, colour: '#FF9F0A', ring: true },
  shift: { w: 380, h: 64, r: 32, colour: '#FFC23D', ring: true },
  music: { w: 300, h: 38, r: 19, colour: '#1ED760', ring: false },
  charge: { w: 220, h: 34, r: 17, colour: '#30D158', ring: false },
  unread: { w: 200, h: 34, r: 17, colour: '#FFC23D', ring: false },
  idle: { w: 200, h: 34, r: 17, colour: '#C7C7CC', ring: false },
}

/** HUD pills: 310 wide, or 360 for the ones with more to say. */
export const HUD_LOOK = { narrow: { w: 310, h: 44, r: 22 }, wide: { w: 360, h: 44, r: 22 } } as const

/** The size changes animate over 380 ms. Content fades in after the size settles. */
export const SIZE_MS = 380
export const CONTENT_DELAY_MS = 300

/** A HUD pill sits above every live state except Leave now. A notification banner sits above all of them. */
export function pickDisplay(kind: LiveKind, hudOn: boolean, bannerOn = false): 'banner' | 'hud' | LiveKind {
  if (bannerOn) return 'banner' // card 18: a notification banner sits above everything, Leave now included
  return hudOn && kind !== 'leave' ? 'hud' : kind
}

// ---- Leave now --------------------------------------------------------------

/** Leave now shows from this long before the leave-by time until the shift starts. */
export const LEAVE_LEAD_MIN = 10

/** The minutes chip on the Leave now pill, or null when it is not time yet (or the shift has started). */
export function leaveChip(leaveBy: number, start: number, now: number): string | null {
  if (now < leaveBy - LEAVE_LEAD_MIN * MIN || now >= start) return null
  const mins = Math.ceil((leaveBy - now) / MIN)
  return mins > 0 ? `${mins} min` : 'Now'
}

// ---- Copy -------------------------------------------------------------------

/** `5:30` on the pill: the Perth clock time without am or pm (HALO.md, dates and times). */
export const pillTime = (clockPm: string): string => clockPm.replace(/\s?[ap]m$/i, '')

/** Time to a full battery, `~1h 05m` or `~25m`. Null when the laptop doesn't know. */
export function fmtToFull(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const m = Math.round(minutes)
  return m >= 60 ? `~${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `~${m}m`
}

/** `Q3 5:21` becomes `Q3 · 5:21`. Words like `Halftime` and `Final` stay as they are. */
export const gameStatus = (statusText: string): string => statusText.replace(/^(Q\d|\d?OT)\s+/, '$1 · ')

/** `m:ss` for the study timer. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
