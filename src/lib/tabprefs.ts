// Tab prefs (cards 23 and 27). Pure, so the rules can be tested. Saved in the settings row's `theme` JSON under `tabs`, so the
// laptop and the phone read the same list. The top bar shows only the pinned tabs, in the saved order. Every other tab lives
// in the "•••" More grid. At most 8 tabs can be pinned, Base and Home are always two of them and More is never pinned (it is the grid).

export interface TabPrefs {
  /** Pinned tab ids, in the order they show in the top bar. */
  pinned: string[]
}

/** What the bar shows until Liam picks his own (card 27). */
export const DEFAULT_PINNED = ['base', 'home', 'week', 'pay', 'study', 'music', 'sixers', 'alerts']
export const MAX_PINNED = 8
/** Base (card 29) is the first tab and the one Halo opens on, and Home is the way back, so neither can be unpinned. */
export const ALWAYS_PINNED = ['base', 'home']
/** More is the "•••" button itself, so it can never be pinned. */
export const NEVER_PINNED = ['more']

/** Clean up whatever came out of the database (or an older build) into a valid list. `known` is every tab id. */
export function normalisePrefs(raw: unknown, known: readonly string[]): TabPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { pinned?: unknown }
  const ok = new Set(known.filter((id) => !NEVER_PINNED.includes(id)))
  // An older save (card 23) has an order and a hidden list but no pinned list: start from the defaults.
  const src = Array.isArray(r.pinned) ? r.pinned : DEFAULT_PINNED
  const pinned: string[] = []
  for (const id of src) if (typeof id === 'string' && ok.has(id) && !pinned.includes(id)) pinned.push(id)
  for (const id of [...ALWAYS_PINNED].reverse()) if (ok.has(id) && !pinned.includes(id)) pinned.unshift(id)
  return { pinned: pinned.slice(0, MAX_PINNED) }
}

export const pinnedIds = (p: TabPrefs): string[] => p.pinned

/** Tabs that are not pinned, in `known` order. These fill the More grid (More itself is the button, so it is left out). */
export const moreIds = (p: TabPrefs, known: readonly string[]): string[] => known.filter((id) => !NEVER_PINNED.includes(id) && !p.pinned.includes(id))

export const canPinMore = (p: TabPrefs): boolean => p.pinned.length < MAX_PINNED

/** Pin or unpin a tab. Home stays, More never goes in, and nothing goes past 8. */
export function togglePin(p: TabPrefs, id: string): TabPrefs {
  if (NEVER_PINNED.includes(id)) return p
  if (p.pinned.includes(id)) return ALWAYS_PINNED.includes(id) ? p : { pinned: p.pinned.filter((x) => x !== id) }
  return canPinMore(p) ? { pinned: [...p.pinned, id] } : p
}

/** Move a pinned tab to a new place in the bar (drag and drop). */
export function movePinnedTo(p: TabPrefs, id: string, to: number): TabPrefs {
  const from = p.pinned.indexOf(id)
  if (from < 0) return p
  const i = Math.max(0, Math.min(p.pinned.length - 1, to))
  if (i === from) return p
  const pinned = [...p.pinned]
  pinned.splice(from, 1)
  pinned.splice(i, 0, id)
  return { pinned }
}

/** Move a pinned tab one place left (-1) or right (+1). Moving past either end does nothing. */
export const moveTab = (p: TabPrefs, id: string, dir: -1 | 1): TabPrefs => movePinnedTo(p, id, p.pinned.indexOf(id) + dir)

export const samePrefs = (a: TabPrefs, b: TabPrefs): boolean => a.pinned.join() === b.pinned.join()

/** The settings row's theme JSON with the tab prefs set, every other key kept as it was. */
export function mergeTheme(theme: unknown, p: TabPrefs): Record<string, unknown> {
  const base = theme && typeof theme === 'object' && !Array.isArray(theme) ? (theme as Record<string, unknown>) : {}
  return { ...base, tabs: { pinned: p.pinned } }
}
/** Reads the tab prefs back out of the settings row's theme JSON. Null when none were saved. */
export function themeTabs(theme: unknown): unknown {
  return theme && typeof theme === 'object' ? (theme as { tabs?: unknown }).tabs ?? null : null
}
