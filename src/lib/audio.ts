// Card 24: Audio tab rules. Pure, so they can be tested.

export interface MixerApp { id: string; name: string; level: number; muted: boolean }

/** Brand colours for the apps Liam uses. Anything else gets a colour picked from its name, so it keeps the same one. */
const BRAND: Record<string, string> = { spotify: '#1ED760', chrome: '#4d8bff', discord: '#7b83eb', teams: '#9fa6ff', msteams: '#9fa6ff', firefox: '#ff7139', msedge: '#3dd6ff', vlc: '#ff9a1f' }
const SPARE = ['#FF9F0A', '#BF5AF2', '#FF6482', '#64D2FF', '#5CFF7A', '#FFD60A']
export function appColour(id: string): string {
  const k = id.toLowerCase()
  if (BRAND[k]) return BRAND[k]
  let n = 0
  for (const c of k) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return SPARE[n % SPARE.length]
}

/** The apps shown in the mixer: the four loudest, with the ones Liam uses most kept in a steady order. System helpers that only make beeps are left out. */
const HIDE = new Set(['shellexperiencehost', 'msedgewebview2', 'searchhost', 'startmenuexperiencehost', 'textinputhost', 'widgets', 'snippingtool', 'windowscamera'])
export function mixerApps(apps: MixerApp[], max = 4): { shown: MixerApp[]; more: number } {
  const usable = apps.filter((a) => !HIDE.has(a.id.toLowerCase()))
  const order = (a: MixerApp) => { const i = ['spotify', 'chrome', 'discord', 'teams', 'msteams'].indexOf(a.id.toLowerCase()); return i < 0 ? 99 : i }
  const sorted = [...usable].sort((a, b) => order(a) - order(b) || b.level - a.level || a.name.localeCompare(b.name))
  return { shown: sorted.slice(0, max), more: Math.max(0, sorted.length - max) }
}

/** The microphone's level, 0 to 1, as `bars` lit bars. A little gain, because a talking voice peaks low. */
export const litBars = (level: number, bars = 18): number => Math.max(0, Math.min(bars, Math.round(Math.min(1, Math.max(0, level) * 2.2) * bars)))

export interface OutputLike { name: string; kind: string; current: boolean }
export const OUTPUT_COLOURS: Record<string, string> = { headphones: '#0A84FF', speakers: '#BF5AF2', monitor: '#FF9F0A' }
export const outputSub = (o: OutputLike): string => (o.current ? 'In use' : o.kind === 'headphones' ? 'Headphones' : o.kind === 'monitor' ? 'Screen' : 'Speakers')
