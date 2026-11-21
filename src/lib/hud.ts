// Card 17: HUD pills for every change Liam makes on the laptop. The closed island grows to a 310 to 360 wide pill for
// about 1.7 s, then settles back. Pure logic only: the models below say what to draw, hudFromEvent turns the helper's
// events into them. Colours and wording are the prototype's ("Try a change" buttons).

export const HOLD_MS = 1700

export type HudIconName =
  | 'vol' | 'bri' | 'mic' | 'kbd' | 'wifi' | 'bt' | 'night' | 'focus' | 'plane' | 'caps' | 'head' | 'spk' | 'mon' | 'bolt' | 'bat' | 'eq'
export interface HudIcon {
  name: HudIconName
  /** 0 to 100 for the volume and brightness icons (waves and rays grow with the level). For the mic: 1 live, 0 muted. */
  level?: number
}

interface Base {
  /** Same key as the pill on screen: the existing pill is updated in place instead of being rebuilt. */
  key: string
  colour: string
  icon: HudIcon
  /** How long it stays, ms. */
  hold: number
  /** 360 wide instead of 310. */
  wide: boolean
}
export interface SliderHud extends Base { kind: 'slider'; label: string; value: number; from: number }
export interface ToggleHud extends Base { kind: 'toggle'; label: string; sub: string; on: boolean; onText: string; offText: string }
export interface ChoiceHud extends Base { kind: 'choice'; label: string; options: string[]; sel: number }
export interface ChargeHud extends Base { kind: 'charge'; on: boolean; pct: number }
export type HudModel = SliderHud | ToggleHud | ChoiceHud | ChargeHud

const BLUE = '#2f86ff'
const RED = '#FF453A'
const GREEN = '#30D158'
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

// ---- Sliders ----------------------------------------------------------------

export const volumeHud = (level: number, from: number, device = 'Speakers'): HudModel =>
  ({ kind: 'slider', key: 'vol', label: device, value: clamp(level), from: clamp(from), icon: { name: 'vol', level: clamp(level) }, colour: BLUE, hold: HOLD_MS, wide: false })
export const brightnessHud = (level: number, from: number): HudModel =>
  ({ kind: 'slider', key: 'bri', label: 'Brightness', value: clamp(level), from: clamp(from), icon: { name: 'bri', level: clamp(level) }, colour: '#FFC23D', hold: HOLD_MS, wide: false })
export const keyboardLightHud = (level: number, from: number): HudModel =>
  ({ kind: 'slider', key: 'kbd', label: 'Keyboard light', value: clamp(level), from: clamp(from), icon: { name: 'kbd' }, colour: '#9fb0ff', hold: HOLD_MS, wide: false })

// ---- Toggles ----------------------------------------------------------------

const toggle = (key: string, o: Omit<ToggleHud, 'kind' | 'key' | 'hold' | 'wide' | 'onText' | 'offText'> & Partial<Pick<ToggleHud, 'hold' | 'wide' | 'onText' | 'offText'>>): ToggleHud =>
  ({ kind: 'toggle', key, hold: HOLD_MS, wide: false, onText: 'On', offText: 'Off', ...o })

/** Mute is red when it is muted. */
export const muteHud = (muted: boolean, level: number, device = 'Speakers'): HudModel =>
  toggle('mute', { label: muted ? 'Muted' : 'Sound on', sub: device, icon: { name: 'vol', level: muted ? 0 : clamp(level) }, on: !muted, onText: `${clamp(level)}%`, offText: 'Muted', colour: muted ? RED : BLUE })
export const micHud = (live: boolean, device = 'Microphone'): HudModel =>
  toggle('mic', { label: live ? 'Mic on' : 'Mic muted', sub: device, icon: { name: 'mic', level: live ? 1 : 0 }, on: live, onText: 'Live', offText: 'Muted', colour: live ? GREEN : RED })
export const bluetoothHud = (on: boolean, device: string | null, battery?: number | null): HudModel =>
  toggle('bt', {
    label: device ? `${device} ${on ? 'connected' : 'disconnected'}` : 'Bluetooth',
    sub: device ? (on && battery != null ? `Headphones · ${battery}%` : 'Bluetooth') : on ? 'Bluetooth on' : 'Bluetooth off',
    icon: { name: 'bt' }, on, onText: battery != null ? `${battery}%` : 'On', offText: 'Off', colour: '#5E5CE6', wide: true,
  })
export const wifiHud = (on: boolean, ssid: string | null): HudModel =>
  toggle('wifi', { label: 'Wi-Fi', sub: on ? ssid ?? 'Not connected' : 'Not connected', icon: { name: 'wifi' }, on, colour: '#0A84FF' })
export const airplaneHud = (on: boolean): HudModel =>
  toggle('plane', { label: 'Airplane mode', sub: on ? 'Wi-Fi and Bluetooth off' : 'Radios back on', icon: { name: 'plane' }, on, colour: '#FF9F0A' })
export const nightLightHud = (on: boolean): HudModel =>
  toggle('night', { label: 'Night light', sub: on ? 'Warmer screen till 7 am' : 'Normal colours', icon: { name: 'night' }, on, colour: '#FF9F0A' })
export const focusHud = (on: boolean, detail?: string): HudModel =>
  toggle('focus', { label: 'Focus', sub: on ? detail ?? 'Alerts held' : 'Alerts back on', icon: { name: 'focus' }, on, colour: '#BF5AF2' })
export const noiseCancellingHud = (on: boolean, device = 'Headphones'): HudModel =>
  toggle('anc', { label: 'Noise cancelling', sub: device, icon: { name: 'head' }, on, colour: '#0A84FF' })
export const capsLockHud = (on: boolean): HudModel =>
  toggle('caps', { label: 'Caps lock', sub: on ? 'TYPING IN CAPITALS' : 'lowercase', icon: { name: 'caps' }, on, colour: '#F5F7FF', hold: 1100 })

// ---- Choices ----------------------------------------------------------------

export const POWER_OPTIONS = ['Saver', 'Balanced', 'Best'] as const
const POWER_COLOURS = [GREEN, '#0A84FF', '#FF9F0A']
export const OUTPUT_OPTIONS = ['Speakers', 'Headphones', 'Monitor'] as const
export const EQ_OPTIONS = ['Flat', 'Bass', 'Vocal', 'Bright'] as const

export const powerModeHud = (mode: 'battery' | 'balanced' | 'performance'): HudModel => {
  const sel = Math.max(0, ['battery', 'balanced', 'performance'].indexOf(mode))
  return { kind: 'choice', key: 'pm', label: 'Power mode', options: [...POWER_OPTIONS], sel, icon: { name: 'bolt' }, colour: POWER_COLOURS[sel], hold: HOLD_MS, wide: true }
}
export const eqHud = (sel: number): HudModel =>
  ({ kind: 'choice', key: 'eq', label: 'Sound', options: [...EQ_OPTIONS], sel: Math.max(0, Math.min(EQ_OPTIONS.length - 1, sel)), icon: { name: 'eq' }, colour: BLUE, hold: HOLD_MS, wide: true })
export const outputHud = (name: string, kind: 'speakers' | 'headphones' | 'monitor'): HudModel =>
  ({ kind: 'choice', key: 'out', label: name, options: [...OUTPUT_OPTIONS], sel: ['speakers', 'headphones', 'monitor'].indexOf(kind), icon: { name: kind === 'headphones' ? 'head' : kind === 'monitor' ? 'mon' : 'spk' }, colour: BLUE, hold: HOLD_MS, wide: true })

// ---- Charging ---------------------------------------------------------------

/** Plug in fills a green bar to the battery percentage. Unplug shows "On battery". */
export const chargeHud = (on: boolean, pct: number): HudModel =>
  ({ kind: 'charge', key: on ? 'plug' : 'unplug', on, pct: clamp(pct), icon: { name: on ? 'bolt' : 'bat' }, colour: on ? GREEN : '#FFC23D', hold: on ? 2600 : 2000, wide: false })

// ---- Helper events to HUDs --------------------------------------------------

/** What the last event of each kind said, so only a real change shows a HUD. The first event of a kind (and the
 *  full snapshot the helper sends again after a reconnect) only fills this in. */
export interface HudMemory {
  vol?: { level: number; muted: boolean }
  bri?: number
  mic?: boolean
  caps?: boolean
  wifi?: { enabled: boolean; ssid: string | null }
  bt?: { enabled: boolean; device: string | null }
  power?: string
  output?: { name: string; kind: string }
  charging?: boolean
  toggles: Record<string, boolean>
  sliders: Record<string, number>
}
export const newHudMemory = (): HudMemory => ({ toggles: {}, sliders: {} })

type Ev = Record<string, unknown>
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * Turns one event from the helper into the HUD to show, or null when nothing changed.
 * Event names: volume, brightness, mic, caps, wifi, bluetooth, power, output, battery, and the generic
 * toggles airplane, night, focus and anc ({ on }) and sliders kbd ({ level }) for helpers that report them.
 * A battery event gives a charge HUD on plug in (on true) and on unplug (on false). The caller decides what to
 * do with a plug in: the island shows its Charging state for 3 s instead of a pill.
 */
export function hudFromEvent(mem: HudMemory, name: string, raw: unknown): HudModel | null {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Ev
  switch (name) {
    case 'output': {
      const next = { name: str(d.name) ?? 'Speakers', kind: str(d.kind) ?? 'speakers' }
      const prev = mem.output
      mem.output = next
      if (!prev || (prev.name === next.name && prev.kind === next.kind)) return null
      return outputHud(next.name, next.kind as 'speakers' | 'headphones' | 'monitor')
    }
    case 'volume': {
      const next = { level: num(d.level), muted: !!d.muted }
      const prev = mem.vol
      mem.vol = next
      if (!prev) return null
      const device = mem.output?.name
      if (prev.muted !== next.muted) return muteHud(next.muted, next.level, device)
      if (prev.level !== next.level) return volumeHud(next.level, prev.muted ? 0 : prev.level, device)
      return null
    }
    case 'brightness': {
      const prev = mem.bri
      mem.bri = num(d.level)
      return prev === undefined || prev === mem.bri ? null : brightnessHud(mem.bri, prev)
    }
    case 'mic': {
      const live = !d.muted
      const prev = mem.mic
      mem.mic = live
      return prev === undefined || prev === live ? null : micHud(live)
    }
    case 'caps': {
      const on = !!d.on
      const prev = mem.caps
      mem.caps = on
      return prev === undefined || prev === on ? null : capsLockHud(on)
    }
    case 'wifi': {
      const next = { enabled: !!d.enabled, ssid: str(d.ssid) }
      const prev = mem.wifi
      mem.wifi = next
      if (!prev || (prev.enabled === next.enabled && prev.ssid === next.ssid)) return null
      return wifiHud(next.enabled, next.ssid)
    }
    case 'bluetooth': {
      const next = { enabled: !!d.enabled, device: str(d.connected_device) }
      const prev = mem.bt
      mem.bt = next
      if (!prev) return null
      if (prev.device !== next.device) return bluetoothHud(!!next.device, next.device ?? prev.device)
      if (prev.enabled !== next.enabled) return bluetoothHud(next.enabled, null)
      return null
    }
    case 'power': {
      const mode = str(d.mode)
      const prev = mem.power
      mem.power = mode ?? undefined
      if (!mode || prev === undefined || prev === mode) return null
      return powerModeHud(mode as 'battery' | 'balanced' | 'performance')
    }
    case 'battery': {
      if (!d.present) return null
      const charging = !!d.charging
      const prev = mem.charging
      mem.charging = charging
      return prev === undefined || prev === charging ? null : chargeHud(charging, num(d.percent))
    }
    case 'airplane': case 'night': case 'focus': case 'anc': {
      const on = !!d.on
      const prev = mem.toggles[name]
      mem.toggles[name] = on
      if (prev === undefined || prev === on) return null
      if (name === 'airplane') return airplaneHud(on)
      if (name === 'night') return nightLightHud(on)
      if (name === 'focus') return focusHud(on, str(d.detail) ?? undefined)
      return noiseCancellingHud(on, str(d.device) ?? undefined)
    }
    case 'kbd': {
      const prev = mem.sliders.kbd
      mem.sliders.kbd = num(d.level)
      return prev === undefined || prev === mem.sliders.kbd ? null : keyboardLightHud(mem.sliders.kbd, prev)
    }
    default:
      return null
  }
}
