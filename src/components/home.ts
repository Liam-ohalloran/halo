import '../styles/tokens.css'
import '../styles/home.css'
import './components.css'
import './sixers.css'
import { h } from './dom'
import { Island, NumberRoll, PanelHost, TabBar, preloadIcons, type IslandHandle, type IslandState, type NumberRollHandle } from './index'
import { TABS, type TabDef } from './TabBar'
import { SixersCard, SixersPill, confetti, type PillHandle } from './Sixers'
import { SIXERS_BLUE, createFeed, sixersWon, teamColour, type NbaResponse } from '../lib/sixers'
import { NowPanel, SHIFT_COLOUR } from '../panels/now'
import { StudyPanel, ICONS_NEEDED as STUDY_ICONS } from '../panels/study'
import { StudyPill } from '../panels/studyPill'
import { createStudyTimer } from '../panels/studyTimer'
import { mountPay } from '../panels/pay'
import { supabaseBackend } from '../supabase'
import type { Backend } from '../types'
import { supabaseNowSource, getTravelMinutes, type NowData, type NowSource } from '../lib/now'
import { perthDayBounds, shiftView, type ShiftView } from '../lib/now-model'

// Home: the island. Resting when nothing is close, a compact pill inside two hours of a shift or while a
// study session runs, and the tab bar with the Now, Study, Pay and Sixers panels when it opens (HALO.md 3.1e).
// Tab order follows the bible: Now (1), Study (3), Pay (4), Sixers (5). A live Sixers game takes the wide pill.

export interface HomeOptions {
  source?: NowSource
  /** Fixed clock for dev previews, so screenshots are repeatable. */
  now?: () => Date
  /** Open the island on load (dev previews). */
  open?: boolean
  /** Data for the Pay and Study panels. Defaults to Supabase. */
  api?: Backend
  /** Tab to start on (dev previews). Otherwise the last tab used. */
  tab?: string
  /** Sixers feed, swapped for recorded JSON in dev previews. Defaults to the nba edge function. */
  sixers?: () => Promise<NbaResponse>
}

type TabId = 'now' | 'study' | 'pay' | 'sixers'
const HOME_TABS: TabDef[] = (['now', 'study', 'pay', 'sixers'] as const).map((id) => TABS.find((t) => t.id === id)!)
const TAB_KEY = 'halo.homeTab'
const isTab = (v: unknown): v is TabId => HOME_TABS.some((t) => t.id === v)
function lastTab(): TabId {
  try { const v = localStorage.getItem(TAB_KEY); if (isTab(v)) return v } catch { /* private mode */ }
  return 'now'
}

/** Glow colour while a tab is open: colour comes from the content (HALO.md 3.1b). */
const TAB_TINT: Record<TabId, string> = { now: '#FF9F0A', study: '#BF5AF2', pay: '#30D158', sixers: SIXERS_BLUE }
const QUIET = '#C7C7CC' // glow colour when no content has one
const CHROME = 22 + 44 + 12 + 22 // top padding, tab bar, row gap, bottom padding (matches the demo content)
const MAX_FIT = 2 // compact layout steps a panel may take before it is allowed to scroll
const REFRESH_MS = 5 * 60_000

export function mountHome(app: HTMLElement, o: HomeOptions = {}): () => void {
  document.documentElement.classList.add('home')
  const source = o.source ?? supabaseNowSource
  const api = o.api ?? supabaseBackend
  const clock = o.now ?? (() => new Date())

  // The stage is the visible window, so the island can grow as tall as the screen allows.
  const stageH = Math.max(innerHeight - 8, 300)

  let wantBase: IslandState = 'resting'
  let baseTint = QUIET // glow colour of whatever the closed island shows
  let game: NbaResponse | null = null // latest Sixers response
  let sixersLive = false // a live or final game: the wide pill shows
  let sixersPill: PillHandle | null = null
  const isl: IslandHandle = Island({
    initial: 'resting', base: 'resting', stageHeight: stageH, tint: QUIET, label: 'Halo island',
    hover: matchMedia('(hover: hover)').matches,
    onState: (s) => {
      // The base can only change while the island is closed, otherwise it would collapse under the user.
      applyTint()
      if (s !== 'expanded' && s !== 'alert') queueMicrotask(syncBase)
    },
  })
  const stage = h('div', { class: 'home-stage' }, isl)
  app.replaceChildren(stage)

  // ---- Expanded content: tab bar and one panel per tab
  let activeId: TabId = isTab(o.tab) ? o.tab : lastTab()
  const tabs = TabBar({
    tabs: HOME_TABS, active: activeId, settings: false,
    onChange: (id, from) => {
      const ids = tabs.visibleIds()
      showTab(id as TabId, ids.indexOf(id) - ids.indexOf(from ?? id))
    },
  })
  const host = PanelHost()
  isl.setContent('expanded', [tabs, host])

  const timer = createStudyTimer(api, 'Human Biology')
  const studyPill = StudyPill(timer)
  const nowPanel = NowPanel()
  const payListeners = new Set<() => void>()
  let unmountPay: () => void = () => {}
  const sixersCard = SixersCard({ onRetry: () => void sixers.refresh() })
  sixersCard.loading()
  const made: Partial<Record<TabId, HTMLElement>> = { now: nowPanel.el, sixers: sixersCard.el }

  // Panels are built the first time their tab is shown, then kept.
  function getPanel(id: TabId): HTMLElement {
    let el = made[id]
    if (el) return el
    if (id === 'study') el = StudyPanel(api, timer, () => requestAnimationFrame(relayout))
    else {
      const root = h('div', { class: 'home-pay' })
      unmountPay = mountPay(root, api, (cb) => { payListeners.add(cb); return () => payListeners.delete(cb) })
      el = root
    }
    made[id] = el
    return el
  }

  // The island's height springs to the active tab's content height (HALO.md 3.5, tab switch).
  const ro = new ResizeObserver(() => relayout())
  function relayout() {
    const el = made[activeId]
    if (!el) return
    const room = stageH - 4 - CHROME
    // Start roomy and compact the layout one step at a time until the panel fits, so the island can
    // spring to the full content height with nothing clipped and nothing to scroll.
    let fit = 0
    el.dataset.fit = '0'
    let ph = el.offsetHeight // layout height: ignores the slide and scale of a tab switch
    while (ph > room && fit < MAX_FIT) {
      el.dataset.fit = String(++fit)
      ph = el.offsetHeight
    }
    host.style.height = `${Math.min(ph, room)}px`
    host.style.overflowY = ph > room ? 'auto' : 'hidden'
    host.classList.toggle('is-scroll', ph > room)
    isl.setExpandedHeight(Math.min(CHROME + ph, stageH - 4))
  }
  function showTab(id: TabId, dir: number) {
    activeId = id
    try { localStorage.setItem(TAB_KEY, id) } catch { /* private mode */ }
    ro.disconnect()
    const el = getPanel(id)
    host.show(el, dir)
    ro.observe(el)
    relayout()
    applyTint()
  }
  showTab(activeId, 0)
  void document.fonts?.ready.then(relayout)
  void preloadIcons(['house', 'briefcase', 'exam', 'book-open', 'wallet', 'check', 'warning-circle', 'wifi-slash', 'arrow-clockwise', 'caret-left', 'caret-right', ...STUDY_ICONS], ['regular', 'fill'])

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
      if (failed) nowPanel.showError(!navigator.onLine, () => { nowPanel.showLoading(); void refresh() })
      else nowPanel.showLoading()
    } else nowPanel.render(data, now, getTravelMinutes())
    syncIsland(now)
  }

  function syncBase() {
    if (isl.state === 'expanded' || isl.state === 'alert') return
    if (isl.state !== wantBase) isl.setState(wantBase)
  }

  // The glow follows the open tab while expanded, otherwise whatever the pill is showing.
  function applyTint() {
    if (isl.state !== 'expanded' && sixersLive && game?.game) isl.setColours(teamColour(game.game.sixers.tri), teamColour(game.game.opponent.tri))
    else isl.setTint(isl.state === 'expanded' ? TAB_TINT[activeId] : baseTint)
  }

  // One live thing at a time (HALO.md 1): a running study session takes the pill, otherwise a shift soon.
  let studyOn = false
  function syncIsland(now: Date) {
    const sv = data?.shift ? shiftView(data.shift, now, getTravelMinutes()) : null
    if (sixersLive) {
      wantBase = 'wide'
    } else if (timer.state.status !== 'idle') {
      if (!studyOn) { studyOn = true; isl.swapContent('compact', studyPill.nodes) }
      baseTint = studyPill.colour()
      wantBase = 'compact'
    } else if (sv?.soon) {
      if (studyOn) { studyOn = false; pillKey = ''; pillNum = null }
      setPill(sv)
      baseTint = SHIFT_COLOUR
      wantBase = 'compact'
    } else {
      studyOn = false
      baseTint = sv || data?.test ? SHIFT_COLOUR : QUIET
      wantBase = 'resting'
    }
    applyTint()
    syncBase()
  }
  // The timer calls back about 4 times a second while running. Only react when the live thing changes.
  let timerKey = ''
  const unsubTimer = timer.subscribe(() => {
    const k = `${timer.state.status}|${timer.state.subject}`
    if (k === timerKey) return
    timerKey = k
    syncIsland(clock())
  })

  // ---- Sixers: the edge function feed. Live or final shows the wide pill, otherwise the island rests.
  const sixers = createFeed({
    load: o.sixers,
    onData: (r, prev) => {
      game = r
      sixersCard.update(r)
      relayout()
      const g = r.game
      sixersLive = !!g && g.status !== 'scheduled'
      if (sixersLive && g) {
        if (!sixersPill) { sixersPill = SixersPill(r); isl.setContent('wide', sixersPill.nodes) } else sixersPill.update(r)
      }
      syncIsland(clock())
      // A Sixers win just went final: celebrate once, on the transition only.
      if (prev?.game?.status === 'live' && sixersWon(r) && r.game?.id === prev.game.id) {
        const b = isl.getBoundingClientRect()
        confetti({ x: b.left + b.width / 2, y: b.top + 36 })
      }
    },
    onError: (offline) => { if (!game) sixersCard.error(offline) },
  })

  // ---- Clock: once a second, only while the page is visible (HALO.md 3.8)
  let tickTimer = 0
  let refreshTimer = 0
  function tick() {
    const now = clock()
    if (data) {
      const endsAt = data.shift ? new Date(data.shift.ends_at).getTime() : Infinity
      // The shift finished, or midnight passed in Perth: today's rows and the "next" shift have moved on.
      if (now.getTime() >= endsAt || perthDayBounds(now).from.getTime() !== loadedDay) { void refresh(); return }
      nowPanel.tick(now, getTravelMinutes())
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
  // Tapping or clicking anywhere outside the open island closes it (phones have no Escape key).
  const onOutside = (e: PointerEvent) => { if (isl.state === 'expanded' && !(e.target as Element).closest('.h-island')) isl.close() }
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('online', onOnline)
  const unsub = source.onChange(() => { void refresh(); payListeners.forEach((f) => f()) })

  render()
  void refresh()
  start()
  void timer.init().then(() => syncIsland(clock())).catch(() => {})
  if (o.open) requestAnimationFrame(() => requestAnimationFrame(() => isl.open()))

  return () => {
    stop(); ro.disconnect(); unsub(); unsubTimer(); unmountPay(); sixers.stop(); sixersCard.destroy(); studyPill.destroy(); timer.destroy()
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('visibilitychange', onVisible)
    removeEventListener('online', onOnline)
  }
}
