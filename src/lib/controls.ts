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

// ---- Card 29: push, not poll -------------------------------------------------------------------------------------------
import type { Battery, Bluetooth, PowerMode, Volume, Wifi } from './helper.ts'

/** What each pushed event says about the Controls tab. Anything else (media, caps, notifications) is not for this tab. */
export type ControlsPatch =
  | { kind: 'volume'; value: Volume }
  | { kind: 'brightness'; level: number }
  | { kind: 'wifi'; value: Wifi }
  | { kind: 'bluetooth'; value: Bluetooth }
  | { kind: 'battery'; value: Battery }
  | { kind: 'power'; mode: PowerMode }
  | { kind: 'output'; name: string }
  | { kind: 'night'; on: boolean }

const isObj = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null
const MODES = ['battery', 'balanced', 'performance']

export function controlsPatch(name: string, d: unknown): ControlsPatch | null {
  if (!isObj(d)) return null
  switch (name) {
    case 'volume': return typeof d.level === 'number' ? { kind: 'volume', value: { level: d.level, muted: !!d.muted } } : null
    case 'brightness': return typeof d.level === 'number' ? { kind: 'brightness', level: d.level } : null
    case 'wifi': return typeof d.enabled === 'boolean' ? { kind: 'wifi', value: { enabled: d.enabled, connected: !!d.connected, ssid: typeof d.ssid === 'string' ? d.ssid : null } } : null
    case 'bluetooth': return typeof d.enabled === 'boolean' ? { kind: 'bluetooth', value: { enabled: d.enabled, connected_device: typeof d.connected_device === 'string' ? d.connected_device : null } } : null
    case 'battery': return { kind: 'battery', value: { present: !!d.present, percent: typeof d.percent === 'number' ? d.percent : null, charging: !!d.charging, minutes_left: typeof d.minutes_left === 'number' ? d.minutes_left : null } }
    case 'power': return typeof d.mode === 'string' && MODES.includes(d.mode) ? { kind: 'power', mode: d.mode as PowerMode } : null
    case 'output': return typeof d.name === 'string' ? { kind: 'output', name: d.name } : null
    case 'night': return { kind: 'night', on: !!d.on }
    default: return null
  }
}

/** The text a tile shows the moment it is tapped, before the helper has answered. The reply then adds the network or device name. */
export const tapText = (kind: 'wifi' | 'bt' | 'mute', on: boolean): string => (kind === 'mute' ? (on ? 'Silenced' : 'Off') : on ? 'On' : 'Off')
