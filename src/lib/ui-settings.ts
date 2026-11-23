// Card 27: the Settings window's switches. Pure rules plus a tiny store, so they can be unit tested. Saved in the settings
// row's `theme` JSON under `ui` (the tab list sits beside it under `tabs`), so the phone matches where it makes sense.
// Every value is clamped or checked on the way in: whatever came out of the database, the island still gets sane numbers.

export type IslandSize = 'normal' | 'large' | 'larger'
export type Speed = 'slow' | 'normal' | 'fast'

/** Live states Liam can turn off. The closed island then skips straight to the next one in its priority list. */
export const LIVE_KEYS = ['leave', 'game', 'timer', 'shift', 'music', 'charge'] as const
export type LiveKey = (typeof LIVE_KEYS)[number]
export const LIVE_LABELS: Record<LiveKey, string> = { leave: 'Leave now', game: 'Sixers game', timer: 'Study timer', shift: 'Next shift', music: 'Music', charge: 'Charging' }

/** The pills that grow out of the island when something on the laptop changes. */
export const HUD_KEYS = ['sound', 'brightness', 'keys', 'network', 'modes'] as const
export type HudKey = (typeof HUD_KEYS)[number]
export const HUD_LABELS: Record<HudKey, string> = { sound: 'Volume and output', brightness: 'Brightness', keys: 'Mic and Caps Lock', network: 'Wi-Fi and Bluetooth', modes: 'Night, Focus and Plane' }
/** Which switch a helper event belongs to. Events that are not listed (charging, battery) are not HUD pills the user can turn off here. */
const HUD_OF: Record<string, HudKey> = { volume: 'sound', output: 'sound', brightness: 'brightness', kbd: 'brightness', mic: 'keys', caps: 'keys', wifi: 'network', bluetooth: 'network', airplane: 'modes', night: 'modes', focus: 'modes', anc: 'modes', power: 'modes' }

export const SOURCE_KEYS = ['halo', 'windows', 'phone'] as const
export type SourceKey = (typeof SOURCE_KEYS)[number]
export const SOURCE_LABELS: Record<SourceKey, string> = { halo: 'Halo alerts', windows: 'Windows apps', phone: 'Phone Link' }

export interface UiSettings {
  size: IslandSize
  /** Glass blur, percent of the design's own blur. 0 to 150. */
  blur: number
  /** Glow strength, percent. 0 to 150. */
  glow: number
  speed: Speed
  live: Record<LiveKey, boolean>
  hud: Record<HudKey, boolean>
  sources: Record<SourceKey, boolean>
  clipboard: boolean
}

const all = <K extends string>(keys: readonly K[], on = true): Record<K, boolean> => Object.fromEntries(keys.map((k) => [k, on])) as Record<K, boolean>

export const DEFAULT_UI: UiSettings = { size: 'normal', blur: 100, glow: 100, speed: 'normal', live: all(LIVE_KEYS), hud: all(HUD_KEYS), sources: all(SOURCE_KEYS), clipboard: true }

export const SIZE_SCALE: Record<IslandSize, number> = { normal: 1, large: 1.1, larger: 1.2 }
/** Multiplier on every animation length: slow is longer, fast is shorter. */
export const SPEED_MUL: Record<Speed, number> = { slow: 1.6, normal: 1, fast: 0.6 }

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d)
const pick = <T extends string>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d)
function flags<K extends string>(raw: unknown, keys: readonly K[]): Record<K, boolean> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(keys.map((k) => [k, typeof r[k] === 'boolean' ? r[k] : true])) as Record<K, boolean>
}

/** Whatever was saved (or nothing) into a complete, valid set of settings. Anything missing or wrong falls back to the default. */
export function normaliseUi(raw: unknown): UiSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    size: pick(r.size, ['normal', 'large', 'larger'], 'normal'),
    blur: num(r.blur, 0, 150, 100),
    glow: num(r.glow, 0, 150, 100),
    speed: pick(r.speed, ['slow', 'normal', 'fast'], 'normal'),
    live: flags(r.live, LIVE_KEYS),
    hud: flags(r.hud, HUD_KEYS),
    sources: flags(r.sources, SOURCE_KEYS),
    clipboard: typeof r.clipboard === 'boolean' ? r.clipboard : true,
  }
}

/** The live kinds that are switched off, for the island. */
export const liveOff = (s: UiSettings): LiveKey[] => LIVE_KEYS.filter((k) => !s.live[k])

/** True when a helper event may show a HUD pill. Events with no switch (anything unknown) are left alone. */
export function hudAllowed(s: UiSettings, event: string): boolean {
  const k = HUD_OF[event]
  return k ? s.hud[k] : true
}

export const sameUi = (a: UiSettings, b: UiSettings): boolean => JSON.stringify(a) === JSON.stringify(b)

/** The CSS variables the look settings drive. Set on the page's root, so every panel sees them at once. */
export function cssVars(s: UiSettings): Record<string, string> {
  return {
    '--halo-blur': String(s.blur / 100),
    '--glow-strength': String(s.glow / 100),
    '--halo-speed': String(SPEED_MUL[s.speed]),
  }
}

/** The settings row's theme JSON with the UI settings set, every other key kept as it was. */
export function mergeUi(theme: unknown, s: UiSettings): Record<string, unknown> {
  const base = theme && typeof theme === 'object' && !Array.isArray(theme) ? (theme as Record<string, unknown>) : {}
  return { ...base, ui: s }
}
/** Reads the UI settings back out of the settings row's theme JSON. Null when none were saved. */
export function themeUi(theme: unknown): unknown {
  return theme && typeof theme === 'object' ? (theme as { ui?: unknown }).ui ?? null : null
}

// ---- The store: one copy per page, kept on this device so a reload never flashes the defaults, then the saved row takes over.

const KEY = 'halo.ui'
type Listener = (s: UiSettings) => void
export interface UiStore {
  get(): UiSettings
  /** Replace everything (what came from the database). Does not call `onSave`. */
  load(raw: unknown): void
  /** Change some settings. Listeners run at once, then the change is saved. */
  set(patch: Partial<UiSettings>): void
  subscribe(cb: Listener): () => void
}

export function createUiStore(onSave?: (s: UiSettings) => void, storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): UiStore {
  let cur = DEFAULT_UI
  try { cur = normaliseUi(JSON.parse(storage?.getItem(KEY) ?? 'null')) } catch { /* private mode or bad JSON */ }
  const subs = new Set<Listener>()
  const keep = () => { try { storage?.setItem(KEY, JSON.stringify(cur)) } catch { /* private mode */ } }
  const emit = () => subs.forEach((f) => f(cur))
  return {
    get: () => cur,
    load(raw) {
      const next = normaliseUi(raw)
      if (sameUi(next, cur)) return
      cur = next
      keep()
      emit()
    },
    set(patch) {
      const next = normaliseUi({ ...cur, ...patch })
      if (sameUi(next, cur)) return
      cur = next
      keep()
      emit()
      onSave?.(cur)
    },
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb) },
  }
}
