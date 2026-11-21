// Tab order and hidden tabs (card 23). Pure, so the rules can be tested. Saved in the settings row's `theme` JSON under `tabs`,
// so the laptop and the phone read the same order. Anything unknown is dropped and any tab the saved list has never heard of
// (a new one added later) slots in after the tab that comes before it in the default order, so an old save never loses a tab.

export interface TabPrefs {
  /** Every tab id, in display order. */
  order: string[]
  /** Ids that are hidden from the bar. Home and More can never be hidden. */
  hidden: string[]
}

/** Home is the way back and More holds Settings and sign out, so neither can be hidden. */
export const PINNED = ['home', 'more']

/** Clean up whatever came out of the database (or an old build) into a complete, valid list. */
export function normalisePrefs(raw: unknown, defaults: readonly string[]): TabPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { order?: unknown; hidden?: unknown }
  const known = new Set(defaults)
  const saved = (Array.isArray(r.order) ? r.order : []).filter((x): x is string => typeof x === 'string' && known.has(x))
  const order: string[] = []
  for (const id of saved) if (!order.includes(id)) order.push(id)
  // A tab that is not in the saved list goes after its default neighbour on the left, or first if it has none.
  defaults.forEach((id, i) => {
    if (order.includes(id)) return
    const before = defaults.slice(0, i).reverse().find((d) => order.includes(d))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  })
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter((x): x is string => typeof x === 'string' && known.has(x) && !PINNED.includes(x))
  return { order, hidden: [...new Set(hidden)] }
}

export const visibleIds = (p: TabPrefs): string[] => p.order.filter((id) => !p.hidden.includes(id))

/** Move a tab one place left (-1) or right (+1). Moving past either end does nothing. */
export function moveTab(p: TabPrefs, id: string, dir: -1 | 1): TabPrefs {
  const i = p.order.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= p.order.length) return p
  const order = [...p.order]
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...p, order }
}

/** Hide or show a tab. A pinned tab stays shown. */
export function toggleHidden(p: TabPrefs, id: string): TabPrefs {
  if (PINNED.includes(id) || !p.order.includes(id)) return p
  return { ...p, hidden: p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : [...p.hidden, id] }
}

export const samePrefs = (a: TabPrefs, b: TabPrefs): boolean => a.order.join() === b.order.join() && [...a.hidden].sort().join() === [...b.hidden].sort().join()

/** The settings row's theme JSON with the tab prefs set, every other key kept as it was. */
export function mergeTheme(theme: unknown, p: TabPrefs): Record<string, unknown> {
  const base = theme && typeof theme === 'object' && !Array.isArray(theme) ? (theme as Record<string, unknown>) : {}
  return { ...base, tabs: { order: p.order, hidden: p.hidden } }
}
/** Reads the tab prefs back out of the settings row's theme JSON. Null when none were saved. */
export function themeTabs(theme: unknown): unknown {
  return theme && typeof theme === 'object' ? (theme as { tabs?: unknown }).tabs ?? null : null
}
