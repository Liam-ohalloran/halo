import { supabase } from './supabase'
import type { NbaResponse } from '../../supabase/functions/nba/parse'

export type { NbaResponse, SixersGame, MaxeyLine, NextGame, FeedState } from '../../supabase/functions/nba/parse'

// Card 09 data layer: fetch the `nba` edge function, team colours, Perth time formatting and a poller.

/** Sixers blue, from the tokens (HALO.md 3.2). */
export const SIXERS_BLUE = '#4C8DFF'

// Team primary colours. Dark ones are lifted by onBlack() so text stays at 4.5:1 on the black island.
const TEAM: Record<string, string> = {
  ATL: '#E03A3E', BOS: '#2DBE6C', BKN: '#FFFFFF', CHA: '#1D9FD8', CHI: '#CE1141', CLE: '#FDBB30', DAL: '#2F7BD0',
  DEN: '#FEC524', DET: '#C8102E', GSW: '#FFC72C', HOU: '#CE1141', IND: '#FDBB30', LAC: '#C8102E', LAL: '#FDB927',
  MEM: '#5D76A9', MIA: '#F9A01B', MIL: '#EEE1C6', MIN: '#78BE20', NOP: '#C8102E', NYK: '#F58426', OKC: '#007AC1',
  ORL: '#0077C0', PHX: '#E56020', POR: '#E03A3E', SAC: '#A56DD1', SAS: '#C4CED4', TOR: '#CE1141', UTA: '#F9A01B',
  WAS: '#E31837', PHI: SIXERS_BLUE,
}
const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
/** Contrast of a colour against pure black. */
export const contrastOnBlack = (hex: string): number => (luminance(hex) + 0.05) / 0.05

/** Mix toward white until the colour reads at 4.5:1 or better on black. */
export function onBlack(hex: string): string {
  let c = hex
  for (let i = 1; i <= 10 && contrastOnBlack(c) < 4.5; i++) {
    const n = parseInt(hex.slice(1), 16)
    const mix = (v: number) => Math.round(v + (255 - v) * (i / 10))
    c = '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('')
  }
  return c
}
export const teamColour = (tri: string): string => onBlack(TEAM[tri] ?? '#C4CED4')

// ---- Perth time (HALO.md: Sat 21 Nov, 5:30 pm) -------------------------------------------------

const PERTH = 'Australia/Perth'
export function perthDay(iso: string): string {
  const p = new Intl.DateTimeFormat('en-AU', { timeZone: PERTH, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(iso))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}`
}
export function perthTime(iso: string): string {
  const p = new Intl.DateTimeFormat('en-AU', { timeZone: PERTH, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`
}
export const perthWhen = (iso: string): string => `${perthDay(iso)}, ${perthTime(iso)}`

/** "2d 04:12:33", or "04:12:33" inside the last day. Zero once the game has started. */
export function countdown(iso: string, now: number = Date.now()): string {
  const total = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000))
  const d = Math.floor(total / 86400)
  const p = (n: number) => String(n).padStart(2, '0')
  const hms = `${p(Math.floor((total % 86400) / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`
  return d > 0 ? `${d}d ${hms}` : hms
}

/** Did the Sixers win a finished game. */
export const sixersWon = (r: NbaResponse): boolean => r.game?.status === 'final' && r.game.sixers.score > r.game.opponent.score

// ---- Fetch and poll ----------------------------------------------------------------------------

export async function fetchSixers(): Promise<NbaResponse> {
  const { data, error } = await supabase.functions.invoke('nba', { method: 'GET' })
  if (error || !data || (data as { error?: string }).error) throw new Error(error?.message ?? 'nba unavailable')
  return data as NbaResponse
}

export interface FeedOptions {
  load?: () => Promise<NbaResponse>
  onData: (r: NbaResponse, prev: NbaResponse | null) => void
  onError: (offline: boolean) => void
}
export interface Feed { refresh(): Promise<void>; stop(): void }

/** Poll every 20 s during a live game, every minute within an hour of tip off, otherwise every 5 minutes.
 *  Pauses while the tab is hidden and catches up when it comes back. */
export function createFeed(o: FeedOptions): Feed {
  const load = o.load ?? fetchSixers
  let prev: NbaResponse | null = null
  let timer: number | undefined
  let stopped = false
  let busy = false

  const delay = (r: NbaResponse | null): number => {
    if (r?.state === 'live') return 20_000
    const at = r?.next?.startsAt ?? r?.game?.startsAt
    if (r && at && r.state !== 'final' && Date.parse(at) - Date.now() < 3_600_000) return 60_000
    return 300_000
  }
  async function refresh() {
    if (busy || stopped) return
    busy = true
    window.clearTimeout(timer)
    try {
      const r = await load()
      if (stopped) return
      o.onData(r, prev)
      prev = r
    } catch {
      if (!stopped) o.onError(!navigator.onLine)
    } finally {
      busy = false
      if (!stopped && !document.hidden) timer = window.setTimeout(refresh, delay(prev))
    }
  }
  const onVis = () => { if (!document.hidden) void refresh(); else window.clearTimeout(timer) }
  document.addEventListener('visibilitychange', onVis)
  void refresh()
  return {
    refresh,
    stop() { stopped = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) },
  }
}
