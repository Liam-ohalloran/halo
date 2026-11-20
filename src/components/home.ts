import '../styles/tokens.css'
import '../styles/home.css'
import '../styles/phone.css'
import '../styles/proto.css'
import './components.css'
import './sixers.css'
import { h } from './dom'
import { reduced } from '../lib/motion'
import { Island, NumberRoll, PanelHost, TabBar, preloadIcons, type IslandHandle, type IslandState, type NumberRollHandle } from './index'
import { TABS, type TabDef } from './TabBar'
import { SixersCard, SixersPill, confetti, type PillHandle } from './Sixers'
import { SIXERS_BLUE, createFeed, sixersWon, teamColour, type NbaResponse } from '../lib/sixers'
import { HomeTab, liveSources, type HomeSources } from '../panels/homeTab'
import { StudyPanel, ICONS_NEEDED as STUDY_ICONS } from '../panels/study'
import { StudyPill } from '../panels/studyPill'
import { createStudyTimer } from '../panels/studyTimer'
import { PayPanel } from '../panels/pay'
import { WeekPanel } from '../panels/week'
import { AlertsPanel } from '../panels/alerts'
import { buildAlertsView, createAlertsStore } from '../lib/alerts'
import type { PvRoot } from '../ui/charts'
import { supabase, supabaseBackend } from '../supabase'
import { isEmbed } from '../lib/embed'
import { EmbedShell } from './EmbedShell'
import { Shell, type ShellHandle } from './Shell'
import { SettingsPanel, type Account } from './Settings'
import { parseTab, type TabId as ShellTabId } from '../styles/tabs'
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
  /** Who is signed in, for the Settings panel on the More tab (it used to be a footer under the page). */
  account?: Account
  /** Sixers feed, swapped for recorded JSON in dev previews. Defaults to the nba edge function. */
  sixers?: () => Promise<NbaResponse>
  /** Where the Home tab gets weather, battery and music. Defaults to Open-Meteo and the Halo helper. */
  home?: HomeSources
}

type TabId = 'now' | 'study' | 'pay' | 'sixers'
const HOME_TABS: TabDef[] = (['now', 'study', 'pay', 'sixers'] as const).map((id) => TABS.find((t) => t.id === id)!)
const TAB_KEY = 'halo.homeTab'
const isTab = (v: unknown): v is TabId => HOME_TABS.some((t) => t.id === v)
function lastTab(): TabId {
  try { const v = localStorage.getItem(TAB_KEY); if (isTab(v)) return v } catch { /* private mode */ }
  return 'now'
}
// Desktop shell tabs (card 15) are Home, Music, Study, Pay, Sixers, Week, More and Controls. Only Home, Study, Pay and
// Sixers have panels yet. The phone stack keeps the old ids, so these two map between them.
const SHELL_KEY = 'halo.shellTab'
const toPanel = (t: ShellTabId): TabId | null => (t === 'home' ? 'now' : t === 'study' || t === 'pay' || t === 'sixers' ? t : null)
function startTab(o: { tab?: string }): ShellTabId {
  let stored: string | null = null
  try { stored = localStorage.getItem(SHELL_KEY) ?? localStorage.getItem(TAB_KEY) } catch { /* private mode */ }
  return parseTab(o.tab) ?? parseTab(stored) ?? 'home'
}

/** Amber, the closed island's colour for a shift. */
const SHIFT_COLOUR = '#FF9F0A'
/** Glow colour while a tab is open: colour comes from the content (HALO.md 3.1b). */
const TAB_TINT: Record<TabId, string> = { now: '#FF9F0A', study: '#BF5AF2', pay: '#30D158', sixers: SIXERS_BLUE }
const QUIET = '#C7C7CC' // glow colour when no content has one
const CHROME = 22 + 44 + 12 + 22 // top padding, tab bar, row gap, bottom padding (matches the demo content)
/** The island adapter: home.ts drives the closed island through the same handle the phone's Island has. */
function shellIsland(sh: ShellHandle): IslandHandle {
  const content: Partial<Record<IslandState, Node[]>> = {}
  const paint = () => sh.pill.replaceChildren(...(content[sh.collapsed] ?? []))
  const api = {
    get state(): IslandState { return sh.isOpen ? 'expanded' : sh.collapsed },
    setState: (s: IslandState) => { if (s === 'resting' || s === 'compact' || s === 'wide') { sh.setCollapsed(s); paint() } },
    setContent: (s: IslandState, c: Node | Node[]) => { content[s] = Array.isArray(c) ? c : [c]; if (s === sh.collapsed) paint() },
    swapContent: (s: IslandState, c: Node | Node[]) => api.setContent(s, c),
    open: () => sh.open(),
    close: () => sh.close(),
    alert: () => {},
    setExpandedHeight: () => {},
    setTint: (hex: string) => sh.setKey(hex),
    setColours: (l: string) => sh.setKey(l),
    setPulse: () => {},
    setDisabled: () => {},
    getBoundingClientRect: () => sh.el.getBoundingClientRect(),
  }
  return api as unknown as IslandHandle
}

const MAX_FIT = 2// compact layout steps a panel may take before it is allowed to scroll
const REFRESH_MS = 5 * 60_000

export function mountHome(app: HTMLElement, o: HomeOptions = {}): () => void {
  document.documentElement.classList.add('home')
  const source = o.source ?? supabaseNowSource
  const api = o.api ?? supabaseBackend
  const clock = o.now ?? (() => new Date())

  // iPhone width: the panels become a swipeable stack under the island (card 10) instead of opening inside it.
  // Embedded in NotchPixel's web tab (?embed=1): no island at all, the panels fill the viewport.
  const embed = isEmbed()
  const phone = !embed && matchMedia('(max-width: 480px)').matches
  document.documentElement.classList.toggle('phone', phone)

  // The stage is the visible window, so the island can grow as tall as the screen allows.
  const stageH = phone ? 320 : Math.max(innerHeight - 8, 300)

  let wantBase: IslandState = 'resting'
  let baseTint = QUIET // glow colour of whatever the closed island shows
  let game: NbaResponse | null = null // latest Sixers response
  let sixersLive = false // a live or final game: the wide pill shows
  let sixersPill: PillHandle | null = null
  // Desktop and NotchPixel get the 600 x 290 shell (card 15). The island above it only shows the live pills now,
  // so it no longer opens. Card 17 gives it its full set of states. The phone keeps the island and the swipeable stack.
  let activeTab: ShellTabId = startTab(o)
  let panelFor: (id: ShellTabId) => HTMLElement = () => document.createElement('div')
  let showShellTab: (id: ShellTabId, emitted?: boolean) => void = () => {}
  // Card 15b: on desktop the shell IS the island. Collapsed it is the pill, open it is the 600 x 290 window. Embedded
  // in NotchPixel the window is always shown, so nothing hovers or closes it.
  const sh = phone ? null : Shell({
    active: activeTab, now: clock, open: embed || !!o.open, auto: !embed,
    onChange: (id) => showShellTab(id, true),
    onToggle: (isOpen) => { applyTint(); syncHomeActive(); if (!isOpen) queueMicrotask(syncBase) },
  })
  const embedRoot = embed ? EmbedShell() : null
  const isl: IslandHandle = sh ? shellIsland(sh) : Island({
    initial: 'resting', base: 'resting', stageHeight: stageH, tint: QUIET, label: 'Halo island',
    hover: false,
    toggleOnClick: !phone,
    onState: (s) => {
      // The base can only change while the island is closed, otherwise it would collapse under the user.
      applyTint()
      if (s !== 'expanded' && s !== 'alert') queueMicrotask(syncBase)
    },
  })
  const stage: HTMLElement = embedRoot ?? sh?.el ?? h('div', { class: 'home-stage' }, isl)
  if (embedRoot && sh) embedRoot.append(sh.el)
  app.replaceChildren(stage)
  const shell = sh // the shell drives layout where the old embedded shell did

  // ---- Expanded content: tab bar and one panel per tab
  let activeId: TabId = toPanel(activeTab) ?? (isTab(o.tab) ? o.tab : lastTab())
  const tabs = TabBar({
    tabs: HOME_TABS, active: activeId, settings: false,
    onChange: (id, from) => {
      const ids = tabs.visibleIds()
      showTab(id as TabId, ids.indexOf(id) - ids.indexOf(from ?? id))
    },
  })
  const host = sh?.host ?? PanelHost()
  // Phone: the tab bar and a scroll-snap row of slides, one panel each, sit in an inset black card under the island.
  const scroller = h('div', { class: 'phone-scroll', role: 'group', 'aria-label': 'Halo panels' })
  const slides = new Map<TabId, HTMLElement>()
  if (phone) {
    for (const t of HOME_TABS) {
      const s = h('section', { class: 'phone-slide', 'aria-label': t.label, 'data-id': t.id })
      slides.set(t.id as TabId, s)
      scroller.append(s)
    }
    stage.after(h('div', { class: 'phone-card' }, tabs, scroller))
  }

  const timer = createStudyTimer(api, 'Human Biology')
  const studyPill = StudyPill(timer)
  const payListeners = new Set<() => void>()
  let payPanel: ReturnType<typeof PayPanel> | null = null
  const sixersCard = SixersCard({ onRetry: () => void sixers.refresh() })
  sixersCard.loading()
  const homeTab = HomeTab({
    api, sources: o.home ?? liveSources, clock,
    go: (t) => { const id = parseTab(t); if (!id) return; if (sh) showShellTab(id); else if (t === 'pay' || t === 'study' || t === 'sixers') phoneShow(t, true) },
  })
  const made: Partial<Record<TabId, HTMLElement>> = { now: homeTab, sixers: sixersCard.el }

  // Panels are built the first time their tab is shown, then kept.
  function getPanel(id: TabId): HTMLElement {
    let el = made[id]
    if (el) return el
    if (id === 'study') el = StudyPanel(api, timer, () => requestAnimationFrame(relayout))
    else {
      payPanel = PayPanel(api, (cb) => { payListeners.add(cb); return () => payListeners.delete(cb) }, clock)
      el = payPanel
    }
    made[id] = el
    return el
  }

  // The prototype tabs play their entrance (tiles pop in, rings fill) when they are switched to, never on a press.
  function enterPanel(el: HTMLElement) {
    ;(el as Partial<PvRoot>).enter?.()
    syncHomeActive()
  }
  // The Home tab polls the helper and the weather only while it is on screen and the page is visible.
  function syncHomeActive() {
    const visible = !document.hidden && (phone ? activeId === 'now' : activeTab === 'home' && !!sh?.isOpen)
    homeTab.setActive(visible)
  }
  // The island's height springs to the active tab's content height (HALO.md 3.5, tab switch).
  const ro = new ResizeObserver(() => relayout())
  function relayout() {
    if (phone) return // slides scroll on their own, nothing to fit
    const el = shell ? panelFor(activeTab) : made[activeId]
    if (!el) return
    // Embedded, the panel host fills whatever is left under the tab bar, so the room is the viewport's.
    const room = shell ? host.clientHeight : stageH - 4 - CHROME
    const maxFit = MAX_FIT
    // Start roomy and compact the layout one step at a time until the panel fits, so the island can
    // spring to the full content height with nothing clipped and nothing to scroll.
    // The window is always 600 x 290, so the shell uses the tightest layout every panel has and shell.css trims it further.
    // Nothing ever scrolls (card 15b): the host clips, and a panel shows its top items then "+N more".
    if (shell) { el.dataset.fit = '2'; return }
    let fit = 0
    el.dataset.fit = '0'
    let ph = el.offsetHeight // layout height: ignores the slide and scale of a tab switch
    while (ph > room && fit < maxFit) {
      el.dataset.fit = String(++fit)
      ph = el.offsetHeight
    }
    host.style.height = `${Math.min(ph, room)}px`
    host.style.overflowY = ph > room ? 'auto' : 'hidden'
    host.classList.toggle('is-scroll', ph > room)
    isl.setExpandedHeight(Math.min(CHROME + ph, stageH - 4))
  }
  // Phone: swiping moves the tab bar, tapping a tab slides to its panel.
  let swipeLock = 0
  function phoneShow(id: TabId, smooth: boolean) {
    activeId = id
    try { localStorage.setItem(TAB_KEY, id) } catch { /* private mode */ }
    const s = slides.get(id)!
    swipeLock = Date.now() + 600
    scroller.scrollTo({ left: s.offsetLeft, behavior: smooth && !reduced() ? 'smooth' : 'auto' })
    tabs.setActive(id)
    applyTint()
    fitPhone(getPanel(id)); enterPanel(getPanel(id))
  }
  // The prototype tabs are drawn 564 x 226. On the phone they are scaled down to the width of the slide.
  function fitPhone(el: HTMLElement) {
    if (!el.classList.contains('pv')) return
    el.style.width = '564px'; el.style.height = '226px'
    const slide = el.parentElement as HTMLElement | null
    const cs = slide ? getComputedStyle(slide) : null
    const room = slide ? slide.clientWidth - (parseFloat(cs!.paddingLeft) || 0) - (parseFloat(cs!.paddingRight) || 0) : 0
    el.style.zoom = String(Math.min(1, (room || scroller.clientWidth || 358) / 564))
  }
  function onSwipe() {
    if (Date.now() < swipeLock) return
    const i = Math.round(scroller.scrollLeft / Math.max(scroller.clientWidth, 1))
    const id = HOME_TABS[Math.min(Math.max(i, 0), HOME_TABS.length - 1)].id as TabId
    if (id === activeId) return
    activeId = id
    try { localStorage.setItem(TAB_KEY, id) } catch { /* private mode */ }
    tabs.setActive(id)
    fitPhone(getPanel(id)); enterPanel(getPanel(id))
  }
  function showTab(id: TabId, dir: number) {
    if (phone) return phoneShow(id, dir !== 0)
    activeId = id
    try { localStorage.setItem(TAB_KEY, id) } catch { /* private mode */ }
    ro.disconnect()
    const el = getPanel(id)
    host.show(el, dir)
    ro.observe(el)
    relayout()
    applyTint()
    enterPanel(el)
  }
  if (phone) {
    for (const t of HOME_TABS) slides.get(t.id as TabId)!.append(getPanel(t.id as TabId))
    scroller.addEventListener('scroll', onSwipe, { passive: true })
    requestAnimationFrame(() => phoneShow(activeId, false))
  }
  // Desktop and embed: the shell shows the panel for the active tab. Tabs without a panel yet show "Coming soon".
  let settings: HTMLElement | undefined
  const weekListeners = new Set<() => void>()
  let weekPanel: ReturnType<typeof WeekPanel> | null = null
  // Alerts (card 20). One shared list feeds the tab and the island's gold dot. Desktop and embed only.
  const alertsStore = sh ? createAlertsStore(api) : null
  const unsubAlerts = alertsStore?.subscribe(() => sh!.setUnread(buildAlertsView(alertsStore.rows()).unread))
  let alertsPanel: ReturnType<typeof AlertsPanel> | null = null
  panelFor = (id) => {
    if (id === 'alerts' && alertsStore) return (alertsPanel ??= AlertsPanel(alertsStore, clock))
    if (id === 'week') return (weekPanel ??= WeekPanel(api, (cb) => { weekListeners.add(cb); return () => weekListeners.delete(cb) }, clock))
    const p = toPanel(id)
    if (p) return getPanel(p)
    const soon = sh!.soon(id)
    // Embedded, the top padding and sign out used to sit behind a gear. They live on More until card 23.
    if (id === 'more') return (settings ??= SettingsPanel({ account: o.account, embed, onSignOut: () => void supabase.auth.signOut() }))
    return soon
  }
  showShellTab = (id, fromShell = false) => {
    activeTab = id
    const p = toPanel(id)
    if (p) activeId = p
    try { localStorage.setItem(SHELL_KEY, id) } catch { /* private mode */ }
    if (!fromShell) sh!.setActive(id)
    ro.disconnect()
    const el = panelFor(id)
    host.show(el)
    ro.observe(host) // the host has a fixed size, resizing it re-fits the panel
    ro.observe(el)
    relayout()
    applyTint()
    enterPanel(el)
  }
  if (sh) showShellTab(activeTab, true)
  else showTab(activeId, 0)
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
  let loadedDay = 0
  let inflight = 0

  async function refresh() {
    const mine = ++inflight
    const now = clock()
    try {
      const d = await source.load(now)
      if (mine !== inflight) return
      data = d; loadedDay = perthDayBounds(now).from.getTime()
      homeTab.refresh()
    } catch {
      if (mine !== inflight) return
      // keep what we had: the Home tab loads its own data and the island only needs the next shift
    }
    render()
  }

  function render() {
    syncIsland(clock())
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
      homeTab.setGame(r)
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
    onError: (offline) => { if (!game) { sixersCard.error(offline); homeTab.setGame(null) } },
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
      homeTab.tick(now)
      sh?.refreshMeta()
      syncIsland(now)
    }
  }
  function start() {
    stop()
    tickTimer = window.setInterval(tick, 1000)
    refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS)
  }
  function stop() { clearInterval(tickTimer); clearInterval(refreshTimer) }
  const onVisible = () => { syncHomeActive(); if (document.hidden) stop(); else { start(); void refresh(); void alertsStore?.load() } }
  const onOnline = () => void refresh()
  // Tapping or clicking anywhere outside the open island closes it (phones have no Escape key).
  const onOutside = (e: PointerEvent) => { if (!sh && isl.state === 'expanded' && !(e.target as Element).closest('.h-island')) isl.close() }
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('online', onOnline)
  const unsub = source.onChange(() => { void refresh(); payListeners.forEach((f) => f()); weekListeners.forEach((f) => f()) })

  render()
  void refresh()
  start()
  void timer.init().then(() => syncIsland(clock())).catch(() => {})
  if (o.open && !phone && !sh) requestAnimationFrame(() => requestAnimationFrame(() => isl.open()))

  return () => {
    stop(); ro.disconnect(); unsub(); unsubTimer(); payPanel?.destroy(); alertsPanel?.destroy(); unsubAlerts?.(); alertsStore?.destroy(); homeTab.destroy(); sixers.stop(); sixersCard.destroy(); studyPill.destroy(); timer.destroy()
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('visibilitychange', onVisible)
    removeEventListener('online', onOnline)
  }
}
