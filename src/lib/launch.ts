// Card 24: the Launch tab's rules. Pure, so they can be tested. Apps and sites Liam keeps one tap away, saved in Supabase.

export interface LaunchItem { id: string; kind: 'app' | 'site'; name: string; target: string; grp: string; sort: number }
export type NewLaunchItem = Omit<LaunchItem, 'id' | 'sort'>

/** The tiles shown on the Launch tab before "+N more": 13 apps and a plus tile fit 7 across and 2 down. */
export const APP_SLOTS = 13
/** Group order for sites. Anything else follows, alphabetically, and ungrouped sites go last. */
export const GROUPS = ['School', 'Work', 'Build']

export const safeSite = (u: string): string | null => {
  const t = u.trim()
  if (/^https?:\/\/\S+$/i.test(t)) return t
  // "github.com" with no scheme is what people type.
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t) ? `https://${t}` : null
}

/** Check a new item before it is saved. Returns the clean item, or a plain sentence saying what is wrong. */
export function validateItem(i: { kind: string; name: string; target: string; grp?: string }): { ok: true; item: NewLaunchItem } | { ok: false; error: string } {
  const name = i.name.trim().slice(0, 24)
  if (!name) return { ok: false, error: 'Give it a name.' }
  if (i.kind === 'site') {
    const url = safeSite(i.target)
    if (!url) return { ok: false, error: 'That does not look like a web address.' }
    return { ok: true, item: { kind: 'site', name, target: url, grp: (i.grp ?? '').trim().slice(0, 16) } }
  }
  if (i.kind === 'app') {
    if (!i.target.trim()) return { ok: false, error: 'Pick an app from the list.' }
    return { ok: true, item: { kind: 'app', name, target: i.target.trim(), grp: '' } }
  }
  return { ok: false, error: 'Pick App or Website.' }
}

/** Clean up whatever came from the database. Bad rows are dropped. */
export function normaliseItems(raw: unknown): LaunchItem[] {
  if (!Array.isArray(raw)) return []
  const out: LaunchItem[] = []
  raw.forEach((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>
    if (typeof o.id !== 'string' || (o.kind !== 'app' && o.kind !== 'site') || typeof o.name !== 'string' || typeof o.target !== 'string') return
    out.push({ id: o.id, kind: o.kind, name: o.name, target: o.target, grp: typeof o.grp === 'string' ? o.grp : '', sort: typeof o.sort === 'number' ? o.sort : i })
  })
  return out.sort((a, b) => a.sort - b.sort)
}

/** Search apps and sites by name, case blind, in the order they are kept. A blank search matches everything. */
export function search(items: LaunchItem[], q: string): LaunchItem[] {
  const t = q.trim().toLowerCase()
  return t ? items.filter((i) => i.name.toLowerCase().includes(t) || (i.kind === 'site' && i.target.toLowerCase().includes(t))) : items
}

/** Sites grouped for the right hand card: School, Work, Build, other groups, then the ungrouped. */
export function siteGroups(items: LaunchItem[]): { name: string; sites: LaunchItem[] }[] {
  const by = new Map<string, LaunchItem[]>()
  for (const s of items.filter((i) => i.kind === 'site')) by.set(s.grp, [...(by.get(s.grp) ?? []), s])
  const names = [...by.keys()].sort((a, b) => {
    const ra = GROUPS.indexOf(a), rb = GROUPS.indexOf(b)
    if (a === '' || b === '') return a === '' ? 1 : -1
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.localeCompare(b)
  })
  return names.map((name) => ({ name, sites: by.get(name)! }))
}

/** Move one item to a new place among the items of its own kind. Returns every item with fresh `sort` numbers. */
export function moveItem(items: LaunchItem[], id: string, to: number): LaunchItem[] {
  const item = items.find((i) => i.id === id)
  if (!item) return items
  const same = items.filter((i) => i.kind === item.kind)
  const from = same.indexOf(item)
  const at = Math.max(0, Math.min(same.length - 1, to))
  if (from === at) return items
  const reordered = [...same]
  reordered.splice(from, 1)
  reordered.splice(at, 0, item)
  const others = items.filter((i) => i.kind !== item.kind)
  return [...others, ...reordered].map((i, n) => ({ ...i, sort: n }))
}

/** A tile colour for an app, the same one every time for the same name. The helper does not send icons yet. */
const TILES: [string, string][] = [['#1ed760', '#0e7a35'], ['#4d8bff', '#1a49c9'], ['#e08a5a', '#a8461f'], ['#a77bff', '#5a2fc0'], ['#5b8cff', '#2a4fd6'], ['#b55ee0', '#7719aa'], ['#2a9bff', '#0b5fbf'], ['#22d3ee', '#7c3aed'], ['#ff7262', '#a259ff'], ['#ffc23d', '#c27a00']]
export function tileColours(name: string): [string, string] {
  let n = 0
  for (const c of name.toLowerCase()) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return TILES[n % TILES.length]
}
export const initial = (name: string): string => (name.trim()[0] ?? '?').toUpperCase()

/** Apps from the helper's Start menu list that match what was typed, skipping ones already added. At most `max`. */
export function pickable(apps: { id: string; name: string }[], have: LaunchItem[], q: string, max = 6): { id: string; name: string }[] {
  const taken = new Set(have.filter((i) => i.kind === 'app').map((i) => i.target.toLowerCase()))
  const t = q.trim().toLowerCase()
  return apps.filter((a) => !taken.has(a.id.toLowerCase()) && (!t || a.name.toLowerCase().includes(t))).slice(0, max)
}
