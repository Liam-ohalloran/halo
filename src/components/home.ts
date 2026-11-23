import '../styles/tokens.css'
import '../styles/home.css'
import '../styles/phone.css'
import '../styles/proto.css'
import '../styles/desktop.css'
import './components.css'
import './sixers.css'
import { h } from './dom'
import { reduced } from '../lib/motion'
import { Island, NumberRoll, PanelHost, TabBar, preloadIcons, type IslandHandle, type IslandState, type NumberRollHandle } from './index'
import { TABS, type TabDef } from './TabBar'
import { SixersCard, SixersPill, confetti, type PillHandle } from './Sixers'
import { SIXERS_BLUE, createFeed, sixersWon, teamColour, type NbaResponse } from '../lib/sixers'
import { HomeTab, liveSources, type HomeSources } from '../panels/homeTab'
import { BaseTab, type BaseTabHandle } from '../panels/baseTab'
import { createBaseStore, type BaseSnapshot, type BaseStore } from '../lib/base-data'
import { buildCycle } from '../lib/island-cycle'
import { StudyPanel, ICONS_NEEDED as STUDY_ICONS } from '../panels/study'
import { StudyPill } from '../panels/studyPill'
import { createStudyTimer } from '../panels/studyTimer'
import { PayPanel } from '../panels/pay'
import { WeekPanel } from '../panels/week'
import { AlertsPanel } from '../panels/alerts'
import { MoneyPanel } from '../panels/money'
import { MarksPanel } from '../panels/marks'
import { ClaudePanel } from '../panels/claude'
import { ShelfPanel } from '../panels/shelf'
import { WidgetsPanel } from '../panels/widgets'
import { NightPanel } from '../panels/night'
import { createNightMode, isMuted } from '../lib/night'
import { normalisePrefs, pinnedIds, samePrefs, type TabPrefs } from '../lib/tabprefs'
import { SIZE_SCALE, createUiStore, cssVars, hudAllowed, liveOff } from '../lib/ui-settings'
import { DEFAULT_ORDER } from '../styles/tabs'
import { buildAlertsView, createAlertsStore } from '../lib/alerts'
import type { PvRoot } from '../ui/charts'
import { supabase, supabaseBackend } from '../supabase'
import { isEmbed } from '../lib/embed'
import { attachDesktop, isDesktop } from '../lib/desktop'
import { EmbedShell } from './EmbedShell'
import { Shell, type ShellHandle } from './Shell'
import { MusicPanel } from '../panels/music'
import { ControlsPanel } from '../panels/controls'
import { AudioPanel } from '../panels/audio'
import { LaunchPanel } from '../panels/launch'
import { SixersPanel } from '../panels/sixers'
import { SettingsPanel, type Account } from './Settings'
import { parseTab, type TabId as ShellTabId } from '../styles/tabs'
import type { Backend } from '../types'
import { supabaseNowSource, getTravelMinutes, type NowData, type NowSource } from '../lib/now'
import { fmtClockPm, perthDayBounds, shiftView, type ShiftView } from '../lib/now-model'
import { Banners, type BannersHandle } from './Banners'
import { IslandLive, type IslandLiveHandle, type LiveData } from './IslandLive'
import { fmtToFull, gameStatus, leaveChip, pillTime } from '../lib/island-live'
import { hudFromEvent, newHudMemory } from '../lib/hud'
import { getArtUrl, notificationAccess, requestNotificationAccess, setClipboardOn, subscribeEvents, type Media } from '../lib/helper'
import { createWinNotes, noteSource } from '../lib/win-notifications'
import { attachScrollVolume } from '../lib/scroll-volume'
import { shortSubject } from '../lib/study'
import { subjectHex } from '../panels/studyPill'
import { view as timerView } from '../panels/studyTimer'

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
  /** Dev previews only: fixed numbers for the Base tab and the island's cycle, so screenshots are repeatable. */
  base?: Partial<BaseSnapshot>
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
// Card 29: Halo opens on the Base tab. Inside one run it still stays on whichever tab Liam picked last.
function startTab(o: { tab?: string }): ShellTabId {
  return parseTab(o.tab) ?? 'base'
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
  // The desktop app's window is only as wide as the island, so a narrow width must not mean a phone there.
  const phone = !embed && !isDesktop() && matchMedia('(max-width: 480px)').matches
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
  // Tab order and hidden tabs (card 23). A copy is kept on this device so a reload never flashes the default order, then the
  // settings row (which the phone shares) takes over.
  const PREFS_KEY = 'halo.tabprefs'
  const cachedPrefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as unknown } catch { return null } })()
  const nightMode = createNightMode()
  // Card 27: the pinned tabs live in one place. Settings changes them, the settings row loads them, the shell and the phone follow.
  let tabPrefs: TabPrefs = normalisePrefs(cachedPrefs, DEFAULT_ORDER)
  const tabSubs = new Set<() => void>()
  const tabsStore = {
    get: () => tabPrefs,
    set(p: TabPrefs) {
      if (samePrefs(p, tabPrefs)) return
      tabPrefs = p
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* private mode */ }
      void api.saveUiPrefs(p).catch(() => {})
      sh?.setPrefs(p)
      applyPhonePrefs(p)
      tabSubs.forEach((f) => f())
    },
    subscribe: (cb: () => void) => { tabSubs.add(cb); return () => tabSubs.delete(cb) },
  }
  // The Settings window's switches (card 27), saved in the same row. A copy stays on this device so a reload never flashes the defaults.
  const uiStore = createUiStore((v) => void api.saveUiSettings(v).catch(() => {}))
  // Card 29: the Base tab and the island's cycle read the same weather, battery, music, shift, pay and test, fetched once.
  const baseStore: BaseStore | null = phone ? null : createBaseStore({ api, sources: o.home ?? liveSources, clock, fixture: o.base })
  const sh = phone ? null : Shell({
    active: activeTab, now: clock, open: embed || !!o.open, auto: !embed, prefs: tabPrefs,
    onChange: (id) => showShellTab(id, true),
    onToggle: (isOpen) => { applyTint(); syncHomeActive(); syncBaseLevel(); if (!isOpen) queueMicrotask(syncBase) },
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
  // Card 17: on desktop the closed island is drawn by IslandLive (live states and HUD pills). The phone keeps its island.
  let live: IslandLiveHandle | null = null

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
  if (sh) {
    live = IslandLive(sh, {
      onTimer: (a) => { if (a === 'stop') void timer.reset(); else if (timer.state.status === 'running') timer.pause(); else timer.resume() },
    })
  }
  // Card 27: the look and the switches take effect the moment they change, on every device that has them.
  const applyUi = () => {
    const v = uiStore.get()
    for (const [k, val] of Object.entries(cssVars(v))) document.documentElement.style.setProperty(k, val)
    sh?.setScale(SIZE_SCALE[v.size])
    live?.setOff(liveOff(v))
    live?.setCycleEvery(v.cycleEvery)
    syncCycle(clock())
    syncBaseLevel()
    setClipboardOn(v.clipboard)
  }
  uiStore.subscribe(applyUi)
  applyUi()
  const unsubBase = baseStore?.subscribe(() => syncCycle(clock()))
  const studyPill = StudyPill(timer)
  const payListeners = new Set<() => void>()
  let payPanel: ReturnType<typeof PayPanel> | null = null
  const sixersCard = SixersCard({ onRetry: () => void sixers.refresh() })
  sixersCard.loading()
  // Card 24: the 600 x 290 window gets the black island Sixers tab with its Box, Leaders, Team and Form views. The phone keeps the card.
  const sixersPanel = phone ? null : SixersPanel({ onRetry: () => void sixers.refresh() })
  sixersPanel?.loading()
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
  // Card 29: who is looking decides how often the Base data is polled. The Base tab on screen is fast, a closed island that cycles
  // is slow, and anything else (another tab, a hidden page, nothing to cycle) is not polled at all.
  function syncBaseLevel() {
    if (!baseStore || !sh) return
    const cycling = Object.values(uiStore.get().cycle).some(Boolean)
    baseStore.level(document.hidden ? 'off' : sh.isOpen ? (activeTab === 'base' ? 'tab' : 'off') : cycling ? 'cycle' : 'off')
  }
  /** Work out the modes the closed island cycles through from what the store knows, and hand them to it. */
  function syncCycle(now: Date) {
    if (!live || !baseStore) return
    const s = baseStore.get()
    live.setCycle(buildCycle({ weather: s.weather, battery: s.battery, media: s.media, art: s.art, shift: s.shift, pay: s.pay, test: s.test }, now, uiStore.get().cycle, getTravelMinutes()))
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
  // The phone has four of the tabs. It follows the saved order and hidden list, so it matches the laptop.
  let phoneIds: TabId[] = HOME_TABS.map((t) => t.id as TabId)
  function applyPhonePrefs(raw: unknown) {
    if (!phone) return
    const p = normalisePrefs(raw, DEFAULT_ORDER)
    const known = HOME_TABS.map((t) => t.id as TabId)
    let ids = (pinnedIds(p).map((id) => (id === 'home' ? 'now' : id)).filter((id) => known.includes(id as TabId)) as TabId[])
    if (!ids.length) ids = ['now']
    phoneIds = ids
    tabs.setOrder(ids)
    tabs.setHidden(known.filter((id) => !ids.includes(id)))
    for (const id of ids) scroller.append(slides.get(id)!)
    for (const [id, s] of slides) s.hidden = !ids.includes(id)
    if (!ids.includes(activeId)) phoneShow(ids[0], false)
    else requestAnimationFrame(() => phoneShow(activeId, false))
  }
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
    const id = phoneIds[Math.min(Math.max(i, 0), phoneIds.length - 1)]
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
  let settings: ReturnType<typeof SettingsPanel> | undefined
  const weekListeners = new Set<() => void>()
  let weekPanel: ReturnType<typeof WeekPanel> | null = null
  // Alerts (card 20). One shared list feeds the tab and the island's gold dot. Desktop and embed only.
  const alertsStore = sh ? createAlertsStore(api) : null
  // Night mode mutes the unread dot and the alert banners, like the other banners. Leave reminders are never muted.
  const pushUnread = () => { if (alertsStore) live!.setUnread(isMuted('unread', nightMode.get()) ? 0 : buildAlertsView(alertsStore.rows()).unread) }
  const unsubAlerts = alertsStore?.subscribe(pushUnread)
  const unsubNight = nightMode.subscribe(() => pushUnread())
  // Card 18: new alerts pop out of the island as banners, then settle into a stack under it. At night only leave reminders do.
  // Card 26: Windows notifications and Phone Link's phone notifications join the same banners and stack. They are
  // kept in memory only, and a message's text was already dropped by the helper.
  const winNotes = createWinNotes()
  const bannerSource = alertsStore ? {
    ...alertsStore,
    rows: () => { const all = [...(uiStore.get().sources.halo ? alertsStore.rows() : []), ...winNotes.rows()]; return nightMode.get() ? all.filter((r) => r.type === 'leave_reminder') : all },
    subscribe: (cb: () => void) => { const a = alertsStore.subscribe(cb); const b = nightMode.subscribe(cb); const c = winNotes.subscribe(cb); return () => { a(); b(); c() } },
    markRead: (ids: string[]) => {
      const win = ids.filter((i) => i.startsWith('win-'))
      const db = ids.filter((i) => !i.startsWith('win-'))
      if (win.length) winNotes.markRead(win)
      return db.length ? alertsStore.markRead(db) : Promise.resolve()
    },
  } : null
  // Card 25: inside the Halo desktop app the window follows the island's size and lets clicks through everywhere else.
  const detachDesktop = sh && isDesktop() ? attachDesktop(sh) : null
  const banners: BannersHandle | null = sh && bannerSource && live ? Banners(sh, live, { source: bannerSource, clock, go: () => showShellTab('alerts') }) : null
  let alertsPanel: ReturnType<typeof AlertsPanel> | null = null
  // Dev only (never in a production build): lets scripts/desktop-demo.mjs fire a HUD pill and a banner in the real app.
  if (import.meta.env.DEV && sh && live) (window as unknown as { __haloDev?: unknown }).__haloDev = { sh, live, banners, winNotes }
  let moneyPanel: ReturnType<typeof MoneyPanel> | null = null
  let marksPanel: ReturnType<typeof MarksPanel> | null = null
  let claudePanel: ReturnType<typeof ClaudePanel> | null = null
  let nightPanel: ReturnType<typeof NightPanel> | null = null
  let shelfPanel: ReturnType<typeof ShelfPanel> | null = null
  let widgetsPanel: ReturnType<typeof WidgetsPanel> | null = null
  let musicPanel: ReturnType<typeof MusicPanel> | null = null
  let controlsPanel: ReturnType<typeof ControlsPanel> | null = null
  let audioPanel: ReturnType<typeof AudioPanel> | null = null
  let launchPanel: ReturnType<typeof LaunchPanel> | null = null
  let baseTab: BaseTabHandle | null = null
  panelFor = (id) => {
    if (id === 'base' && baseStore) return (baseTab ??= BaseTab({ store: baseStore, ui: uiStore, clock }))
    if (id === 'money') return (moneyPanel ??= MoneyPanel(api, clock))
    if (id === 'marks') return (marksPanel ??= MarksPanel(api, clock))
    if (id === 'night') return (nightPanel ??= NightPanel(api, nightMode, clock))
    if (id === 'claude') return (claudePanel ??= ClaudePanel(api, clock))
    if (id === 'shelf') return (shelfPanel ??= ShelfPanel(api))
    if (id === 'widgets') return (widgetsPanel ??= WidgetsPanel(api, o.home ?? liveSources, clock))
    if (id === 'alerts' && alertsStore) return (alertsPanel ??= AlertsPanel(alertsStore, clock))
    if (id === 'sixers' && sixersPanel) return sixersPanel
    if (id === 'music') return (musicPanel ??= MusicPanel())
    if (id === 'controls') return (controlsPanel ??= ControlsPanel())
    if (id === 'audio') return (audioPanel ??= AudioPanel())
    if (id === 'launch') return (launchPanel ??= LaunchPanel(api))
    if (id === 'week') return (weekPanel ??= WeekPanel(api, (cb) => { weekListeners.add(cb); return () => weekListeners.delete(cb) }, clock))
    const p = toPanel(id)
    if (p) return getPanel(p)
    const soon = sh!.soon(id)
    // Embedded, the top padding and sign out used to sit behind a gear. They live on More until card 23.
    if (id === 'more') return (settings ??= SettingsPanel({ account: o.account, embed, onSignOut: () => void supabase.auth.signOut(), ui: uiStore, tabs: tabsStore }))
    return soon
  }
  showShellTab = (id, fromShell = false) => {
    activeTab = id
    const p = toPanel(id)
    if (p) activeId = p
    try { localStorage.setItem(SHELL_KEY, id) } catch { /* private mode */ }
    if (!fromShell) sh!.setActive(id)
    syncBaseLevel()
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
    if (live) return // the live layer sizes the closed island itself
    if (isl.state === 'expanded' || isl.state === 'alert') return
    if (isl.state !== wantBase) isl.setState(wantBase)
  }

  // The glow follows the open tab while expanded, otherwise whatever the pill is showing.
  function applyTint() {
    if (live) return // the live layer sets the key line, the open window takes its tab's glow from the shell
    if (isl.state !== 'expanded' && sixersLive && game?.game) isl.setColours(teamColour(game.game.sixers.tri), teamColour(game.game.opponent.tri))
    else isl.setTint(isl.state === 'expanded' ? TAB_TINT[activeId] : baseTint)
  }

  // One live thing at a time (HALO.md 1): a running study session takes the pill, otherwise a shift soon.
  let studyOn = false
  /** The study timer as the closed island shows it, or null when no session is running. */
  const timerBit = (): LiveData['timer'] => {
    const st = timer.state
    if (st.status === 'idle') return null
    return { label: `FOCUS · ${shortSubject(st.subject).toUpperCase()}`, left: timerView(st, Date.now()).left, total: st.targetMs, running: st.status === 'running', colour: subjectHex(st.subject) }
  }
  /** Card 17: work out each live state from the data and hand it to the island. Highest priority wins inside it. */
  function syncLive(now: Date) {
    const t = now.getTime()
    const sv = data?.shift ? shiftView(data.shift, now, getTravelMinutes()) : null
    const chip = sv && sv.phase === 'upcoming' ? leaveChip(sv.leaveBy, sv.start, t) : null
    const g = game?.game
    const station = sv?.shift.station?.trim()
    live!.update({
      leave: sv && chip ? { chip, sub: `Shift ${pillTime(fmtClockPm(sv.start))} · leave by ${pillTime(fmtClockPm(sv.leaveBy))}` } : null,
      game: g && g.status === 'live'
        ? { us: { tri: g.sixers.tri, score: g.sixers.score, colour: teamColour(g.sixers.tri) }, them: { tri: g.opponent.tri, score: g.opponent.score, colour: teamColour(g.opponent.tri) }, status: gameStatus(g.statusText) }
        : null,
      timer: timerBit(),
      shift: sv?.soon
        ? sv.phase === 'live'
          ? { label: `ON SHIFT${station ? ` · ${station}` : ''}`, big: `${sv.countdown} left`, rightLabel: 'ENDS', rightValue: pillTime(fmtClockPm(sv.end)) }
          : { label: `SHIFT${station ? ` · ${station}` : ''} · ${pillTime(fmtClockPm(sv.start))}`, big: `in ${sv.countdown}`, rightLabel: 'LEAVE BY', rightValue: pillTime(fmtClockPm(sv.leaveBy)) }
        : null,
    })
  }
  function syncIsland(now: Date) {
    if (live) return syncLive(now)
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
    live?.update({ timer: timerBit() }) // the countdown text moves with the timer, nothing else is touched
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
      sixersPanel?.update(r)
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
    onError: (offline) => { if (!game) { sixersCard.error(offline); sixersPanel?.error(offline); homeTab.setGame(null) } },
  })

  // ---- The laptop (card 17): the helper tells the island what is playing, when the charger goes in and every change
  // Liam makes (volume, brightness, Wi-Fi and so on). Without the helper (the phone, helper off) none of this shows.
  let stopEvents: (() => void) | null = null
  let artUrl: string | null = null
  let artFor = ''
  if (live && !embed) {
    const mem = newHudMemory()
    const setArt = (url: string | null) => { if (artUrl) URL.revokeObjectURL(artUrl); artUrl = url }
    stopEvents = subscribeEvents((name, d) => {
      if (name === 'media') {
        const m = d as Media
        baseStore?.setMedia(m.available ? m : null)
        const on = !!m.available && !!m.title && m.playing
        const cur = live!.data.music
        live!.update({ music: on ? { title: m.title, art: cur && artFor === `${m.title}|${m.artist}` ? cur.art : null, playing: true } : null })
        const id = `${m.title}|${m.artist}`
        if (on && m.has_art && artFor !== id) {
          artFor = id
          void getArtUrl().then((u) => {
            if (!u) return
            if (artFor !== id) { URL.revokeObjectURL(u); return }
            setArt(u)
            const now = live!.data.music
            if (now) live!.update({ music: { ...now, art: u } })
          })
        }
        return
      }
      if (name === 'notification') { if (uiStore.get().sources[noteSource(d)]) winNotes.add(d); return }
      const hud = hudFromEvent(mem, name, d)
      if (!hud) return
      // Card 27: pills Liam switched off in Settings (the charging pill follows the Charging live state).
      if (hud.kind === 'charge' ? !uiStore.get().live.charge : !hudAllowed(uiStore.get(), name)) return
      // A plug in is the Charging state for 3 seconds, with its floating bar. Everything else is a HUD pill.
      if (isMuted(hud.kind === 'charge' ? 'charge' : 'hud', nightMode.get())) return
      if (hud.kind === 'charge' && hud.on) live!.charging({ pct: hud.pct, toFull: fmtToFull((d as { minutes_left?: number | null }).minutes_left) })
      else live!.hud(hud)
    }, (up) => { if (!up) live!.update({ music: null, charge: null }) })
    // Card 26: Windows only tells Halo about notifications once Liam has said yes in Windows (its own question).
    if (isDesktop()) void notificationAccess().then((a) => { if (a === 'unspecified') void requestNotificationAccess() })
  }
  // Card 26: scroll on the closed island changes the volume. The pill comes from the helper's volume event.
  const detachScroll = sh ? attachScrollVolume(sh.el, () => sh.isOpen) : null

  // ---- Clock: once a second, only while the page is visible (HALO.md 3.8)
  let tickTimer = 0
  let refreshTimer = 0
  function tick() {
    const now = clock()
    baseTab?.tick(now)
    syncCycle(now)
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
  // The saved tab order and hidden tabs come from the settings row, so the laptop and the phone match (card 23).
  const loadPrefs = () => {
    void api.uiSettings().then((raw) => { if (raw != null) uiStore.load(raw) }).catch(() => {})
    return api.uiPrefs().then((raw) => {
      if (raw == null) return
      const p = normalisePrefs(raw, DEFAULT_ORDER)
      if (samePrefs(p, tabPrefs)) return
      tabPrefs = p
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* private mode */ }
      sh?.setPrefs(p)
      applyPhonePrefs(p)
      tabSubs.forEach((f) => f())
    }).catch(() => {})
  }
  const onVisible = () => { syncHomeActive(); syncBaseLevel(); if (document.hidden) stop(); else { start(); void refresh(); void alertsStore?.load(); void loadPrefs() } }
  const onOnline = () => void refresh()
  // Tapping or clicking anywhere outside the open island closes it (phones have no Escape key).
  const onOutside = (e: PointerEvent) => { if (!sh && isl.state === 'expanded' && !(e.target as Element).closest('.h-island')) isl.close() }
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('online', onOnline)
  const unsub = source.onChange(() => { void refresh(); baseStore?.refresh(); payListeners.forEach((f) => f()); weekListeners.forEach((f) => f()) })

  render()
  void refresh()
  start()
  void timer.init().then(() => syncIsland(clock())).catch(() => {})
  if (o.open && !phone && !sh) requestAnimationFrame(() => requestAnimationFrame(() => isl.open()))
  applyPhonePrefs(cachedPrefs)
  void loadPrefs()
  syncBaseLevel()
  syncCycle(clock())

  return () => {
    stop(); ro.disconnect(); unsub(); unsubTimer(); unsubBase?.(); baseTab?.destroy(); baseStore?.destroy(); stopEvents?.(); live?.destroy(); if (artUrl) URL.revokeObjectURL(artUrl); payPanel?.destroy(); alertsPanel?.destroy(); moneyPanel?.destroy(); marksPanel?.destroy(); claudePanel?.destroy(); nightPanel?.destroy(); unsubNight(); shelfPanel?.destroy(); widgetsPanel?.destroy(); unsubAlerts?.(); banners?.destroy(); detachScroll?.(); detachDesktop?.(); settings?.destroy(); musicPanel?.destroy(); controlsPanel?.destroy(); audioPanel?.destroy(); launchPanel?.destroy(); sixersPanel?.destroy(); alertsStore?.destroy(); homeTab.destroy(); sixers.stop(); sixersCard.destroy(); studyPill.destroy(); timer.destroy()
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('visibilitychange', onVisible)
    removeEventListener('online', onOnline)
  }
}
