import '../styles/tokens.css'
import '../styles/home.css'
import './components.css'
import { h } from './dom'
import { Island, NumberRoll, PanelHost, TabBar, preloadIcons, type IslandHandle, type IslandState, type NumberRollHandle } from './index'
import { NowPanel, SHIFT_COLOUR } from '../panels/now'
import { supabaseNowSource, getTravelMinutes, type NowData, type NowSource } from '../lib/now'
import { perthDayBounds, shiftView, type ShiftView } from '../lib/now-model'

// Home: the island. Resting when nothing is close, a compact "shift soon" pill inside two hours of a
// shift, and the Now panel when it opens (HALO.md 3.1e, tab 1).

export interface HomeOptions {
  source?: NowSource
  /** Fixed clock for dev previews, so screenshots are repeatable. */
  now?: () => Date
  /** Open the island on load (dev previews). */
  open?: boolean
}

const NOW_TAB = { id: 'now', label: 'Now', icon: 'house' }
const QUIET = '#C7C7CC' // glow colour when no content has one
const CHROME = 22 + 44 + 12 + 22 // top padding, tab bar, row gap, bottom padding (matches the demo content)
const REFRESH_MS = 5 * 60_000

export function mountHome(app: HTMLElement, o: HomeOptions = {}): () => void {
  document.documentElement.classList.add('home')
  const source = o.source ?? supabaseNowSource
  const clock = o.now ?? (() => new Date())

  // The stage is the visible window, so the island can grow as tall as the screen allows.
  const stageH = Math.max(innerHeight - 8, 300)

  let wantBase: IslandState = 'resting'
  const isl: IslandHandle = Island({
    initial: 'resting', base: 'resting', stageHeight: stageH, tint: QUIET, label: 'Halo island',
    hover: matchMedia('(hover: hover)').matches,
    onState: (s) => {
      // The base can only change while the island is closed, otherwise it would collapse under the user.
      if (s !== 'expanded' && s !== 'alert') queueMicrotask(syncBase)
    },
  })
  const stage = h('div', { class: 'home-stage' }, isl)
  app.replaceChildren(stage)

  // ---- Expanded content: tab bar and the Now panel
  const tabs = TabBar({ tabs: [NOW_TAB], active: 'now', settings: false })
  const host = PanelHost()
  isl.setContent('expanded', [tabs, host])
  const panel = NowPanel()
  host.show(panel.el, 0)
  const relayout = () => {
    const ph = panel.el.offsetHeight
    host.style.height = `${ph}px`
    isl.setExpandedHeight(Math.min(CHROME + ph, stageH - 4))
  }
  const ro = new ResizeObserver(relayout)
  ro.observe(panel.el)
  void document.fonts?.ready.then(relayout)
  void preloadIcons(['house', 'briefcase', 'exam', 'book-open', 'check', 'warning-circle', 'wifi-slash', 'arrow-clockwise'], ['regular', 'fill'])

  // ---- Compact pill
  let pillKey = ''
  let pillNum: NumberRollHandle | null = null
  function setPill(sv: ShiftView) {
    const live = sv.phase === 'live'
    const key = `${sv.shift.id}:${sv.phase}`
    if (key !== pillKey) {
      pillKey = key
      pillNum = NumberRoll({ value: sv.countdown, label: live ? 'Time left' : 'Time until' })
      isl.setContent('compact', [h('span', { class: 'n-pill-t' }, live ? 'On shift' : sv.pillLabel), h('span', { class: 'n-pill-n' }, pillNum)])
    } else pillNum?.set(sv.countdown)
  }

  // ---- Data
  let data: NowData | null = null
  let failed = false
  let loadedDay = 0
  let inflight = 0

  async function refresh() {
    const mine = ++inflight
    const now = clock()
    try {
      const d = await source.load(now)
      if (mine !== inflight) return
      data = d; failed = false; loadedDay = perthDayBounds(now).from.getTime()
    } catch {
      if (mine !== inflight) return
      failed = true
    }
    render()
  }

  function render() {
    const now = clock()
    if (!data) {
      if (failed) panel.showError(!navigator.onLine, () => { panel.showLoading(); void refresh() })
      else panel.showLoading()
    } else panel.render(data, now, getTravelMinutes())
    syncIsland(now)
  }

  function syncBase() {
    if (isl.state === 'expanded' || isl.state === 'alert') return
    if (isl.state !== wantBase) isl.setState(wantBase)
  }

  function syncIsland(now: Date) {
    const sv = data?.shift ? shiftView(data.shift, now, getTravelMinutes()) : null
    if (sv?.soon) {
      setPill(sv)
      isl.setTint(SHIFT_COLOUR)
      wantBase = 'compact'
    } else {
      isl.setTint(sv || data?.test ? SHIFT_COLOUR : QUIET)
      wantBase = 'resting'
    }
    syncBase()
  }

  // ---- Clock: once a second, only while the page is visible (HALO.md 3.8)
  let tickTimer = 0
  let refreshTimer = 0
  function tick() {
    const now = clock()
    if (data) {
      const endsAt = data.shift ? new Date(data.shift.ends_at).getTime() : Infinity
      // The shift finished, or midnight passed in Perth: today's rows and the "next" shift have moved on.
      if (now.getTime() >= endsAt || perthDayBounds(now).from.getTime() !== loadedDay) { void refresh(); return }
      panel.tick(now, getTravelMinutes())
      syncIsland(now)
    }
  }
  function start() {
    stop()
    tickTimer = window.setInterval(tick, 1000)
    refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS)
  }
  function stop() { clearInterval(tickTimer); clearInterval(refreshTimer) }
  const onVisible = () => { if (document.hidden) stop(); else { start(); void refresh() } }
  const onOnline = () => void refresh()
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('online', onOnline)
  const unsub = source.onChange(() => void refresh())

  render()
  void refresh()
  start()
  if (o.open) requestAnimationFrame(() => requestAnimationFrame(() => isl.open()))

  return () => {
    stop(); ro.disconnect(); unsub()
    document.removeEventListener('visibilitychange', onVisible)
    removeEventListener('online', onOnline)
  }
}
