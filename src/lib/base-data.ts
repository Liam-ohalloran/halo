// Card 29: one place that fetches what the Base tab and the cycling closed island both show: Perth weather, the laptop battery,
// what is playing, the next shift, the last 7 days of pay and the next test. Each piece loads once and is shared, so the island
// and the tab never ask twice. It only polls while something is looking (HALO.md 3.8): `level` says who.
//   off    nothing is on screen (another tab is open, or the page is hidden): no polling
//   cycle  the island is closed and cycling: slow polling
//   tab    the Base tab is on screen: fast polling for the music progress

import type { Backend, Settings, Shift, Test } from '../types'
import type { HomeSources } from '../panels/homeTab'
import type { Battery, Media } from './helper'
import type { Weather } from './weather'
import { lastSevenDays, type SevenDays } from './base'

export type BaseLevel = 'off' | 'cycle' | 'tab'

export interface BaseSnapshot {
  /** undefined while loading, null when it could not be had. */
  weather: Weather | null | undefined
  battery: Battery | null | undefined
  media: Media | null | undefined
  /** When `media` was read, so the progress can move between polls. */
  mediaAt: number
  art: string | null
  shift: Shift | null | undefined
  pay: SevenDays | null | undefined
  test: Test | null | undefined
}

export interface BaseStore {
  get(): BaseSnapshot
  subscribe(cb: () => void): () => void
  level(l: BaseLevel): void
  /** Read the shift, pay and test again (the database changed). */
  refresh(): void
  /** A media key was pressed. Updates the music a moment later. */
  control(a: 'toggle' | 'next' | 'previous'): Promise<void>
  /** The helper said something changed in what is playing. */
  setMedia(m: Media | null): void
  destroy(): void
}

export interface BaseStoreOptions {
  api: Backend
  sources: HomeSources
  clock?: () => Date
  /** Dev previews only: fixed values that stand in for the network. */
  fixture?: Partial<BaseSnapshot>
}

const DAY = 864e5
const POLL: Record<Exclude<BaseLevel, 'off'>, { media: number; battery: number; weather: number }> = {
  tab: { media: 3_000, battery: 30_000, weather: 15 * 60_000 },
  cycle: { media: 10_000, battery: 60_000, weather: 15 * 60_000 },
}
const DATA_MS = 5 * 60_000

export function createBaseStore(o: BaseStoreOptions): BaseStore {
  const clock = o.clock ?? (() => new Date())
  const src = o.sources
  const fx = o.fixture
  const state: BaseSnapshot = { weather: undefined, battery: undefined, media: undefined, mediaAt: 0, art: null, shift: undefined, pay: undefined, test: undefined, ...fx }
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((f) => f())
  let alive = true
  let lvl: BaseLevel = 'off'
  let timers: number[] = []
  let artKey = ''
  let seq = 0

  async function loadData() {
    if (fx) return
    const my = ++seq
    const now = clock()
    const from = new Date(now.getTime() - 14 * DAY)
    const [sh, rows, st, ts] = await Promise.allSettled([o.api.nextShift(now), o.api.shiftsBetween(from, now), o.api.settings(), o.api.nextTest(now)])
    if (!alive || my !== seq) return
    state.shift = sh.status === 'fulfilled' ? sh.value : state.shift ?? null
    state.test = ts.status === 'fulfilled' ? ts.value : state.test ?? null
    state.pay = rows.status === 'fulfilled' && st.status === 'fulfilled' ? lastSevenDays(rows.value, st.value as Settings, now) : state.pay ?? null
    emit()
  }
  async function pollMedia() {
    if (fx) return
    const m = await src.media()
    if (!alive) return
    await applyMedia(m)
  }
  async function applyMedia(m: Media | null) {
    state.media = m
    state.mediaAt = Date.now()
    const k = m ? `${m.title}|${m.artist}` : ''
    if (k !== artKey) {
      artKey = k
      if (state.art) URL.revokeObjectURL(state.art)
      state.art = null
      emit()
      const url = m?.has_art ? await src.art() : null
      if (!alive || k !== artKey) { if (url) URL.revokeObjectURL(url); return }
      state.art = url
    }
    emit()
  }
  async function pollBattery() { if (fx) return; const b = await src.battery(); if (alive) { state.battery = b; emit() } }
  async function pollWeather() { if (fx) return; const w = await src.weather(); if (alive) { state.weather = w; emit() } }

  function schedule() {
    timers.forEach(clearInterval)
    timers = []
    if (lvl === 'off' || !alive) return
    const p = POLL[lvl]
    void pollMedia(); void pollBattery(); void pollWeather(); void loadData()
    timers = [window.setInterval(() => void pollMedia(), p.media), window.setInterval(() => void pollBattery(), p.battery), window.setInterval(() => void pollWeather(), p.weather), window.setInterval(() => void loadData(), DATA_MS)]
  }

  return {
    get: () => state,
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
    level(l) { if (l === lvl) return; lvl = l; schedule() },
    refresh() { void loadData() },
    async control(a) {
      if (fx) { if (a === 'toggle' && state.media) { state.media = { ...state.media, playing: !state.media.playing }; state.mediaAt = Date.now(); emit() } return }
      await src.control(a)
      setTimeout(() => void pollMedia(), 350)
    },
    setMedia(m) { void applyMedia(m) },
    destroy() { alive = false; timers.forEach(clearInterval); if (state.art) URL.revokeObjectURL(state.art); subs.clear() },
  }
}

