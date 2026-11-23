// Card 24: Controls tab rules. Pure, so the wording and the states can be tested.

export const POWER_MODES = [{ id: 'battery', label: 'Saver' }, { id: 'balanced', label: 'Balanced' }, { id: 'performance', label: 'Best' }] as const
export const powerIndex = (m: string | null): number => POWER_MODES.findIndex((p) => p.id === m)

export interface TileState { on: boolean; text: string; disabled: boolean }
type Reading = { on: boolean; detail?: string | null } | null

/** What a tile shows. `null` means the helper could not say. Focus has no public Windows API, and Night light is read only. */
export function tileState(kind: 'wifi' | 'bt' | 'night' | 'focus' | 'mute', r: Reading): TileState {
  if (kind === 'focus') return { on: false, text: 'Not available yet', disabled: true }
  if (!r) return { on: false, text: kind === 'night' ? 'Read only' : 'Helper off', disabled: true }
  switch (kind) {
    case 'wifi': return { on: r.on, text: r.on ? (r.detail || 'On') : 'Off', disabled: false }
    case 'bt': return { on: r.on, text: r.on ? (r.detail || 'On') : 'Off', disabled: false }
    case 'night': return { on: r.on, text: r.on ? 'On, read only' : 'Off, read only', disabled: true }
    case 'mute': return { on: r.on, text: r.on ? 'Silenced' : 'Off', disabled: false }
  }
}

export interface BatteryLike { present: boolean; percent: number | null; charging: boolean; minutes_left: number | null }

/** "74%", ten cells lit to match, and "1h 37m left" or "Charging". A desktop with no battery says so. */
export function batteryText(b: BatteryLike | null): { value: string; cells: number; sub: string } {
  if (!b) return { value: '–', cells: 0, sub: 'Helper off' }
  if (!b.present || b.percent === null) return { value: '–', cells: 0, sub: 'No battery' }
  const pct = Math.max(0, Math.min(100, Math.round(b.percent)))
  let sub = b.charging ? 'Charging' : ''
  if (!b.charging && b.minutes_left && b.minutes_left > 0) sub = `${Math.floor(b.minutes_left / 60)}h ${String(b.minutes_left % 60).padStart(2, '0')}m left`
  return { value: `${pct}%`, cells: Math.round(pct / 10), sub }
}
