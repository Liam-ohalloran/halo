import '../styles/shell.css'
import '../styles/island-live.css'
import { h } from './dom'
import type { ShellHandle } from './Shell'
import { HUD_LOOK, LOOK, mmss, pickDisplay, pickLive, type LiveKind, type Look } from '../lib/island-live'
import { BANNER, type BannerModel } from '../lib/banner'
import type { HudModel } from '../lib/hud'
import { hudIconMarkup } from './hud-icons'
import { slow } from '../lib/motion'
import { CYCLE_H, CYCLE_KEYS, CYCLE_R, everyMs, DEFAULT_EVERY, nextKey, settleKey, type CycleEvery, type CycleItem, type CycleKey } from '../lib/island-cycle'
import { MOON_SVG, SUN_SVG } from '../lib/base'

// Card 17: the closed island, one live thing at a time. This draws it into the shell's live layer.
//  - Each state is a view that is built once and then patched in place, so a ticking timer or a sliding volume bar
//    only changes the text or width that moved. Nothing is rebuilt and nothing flashes.
//  - Which state shows is decided by lib/island-live.ts (priority) and the size comes from its LOOK table.
//  - A HUD pill (lib/hud.ts) sits above every state except Leave now.
//  - Sizes animate in CSS (shell.css). The content of a view fades in after the size settles (island-live.css).
// Music and Charging only appear while the helper feeds them. Live game comes from the nba function.

export interface TeamBit { tri: string; score: number; colour: string }
export interface LiveData {
  leave: { sub: string; chip: string } | null
  game: { us: TeamBit; them: TeamBit; status: string } | null
  timer: { label: string; left: number; total: number; running: boolean; colour: string } | null
  shift: { label: string; big: string; rightLabel: string; rightValue: string } | null
  music: { title: string; art: string | null; playing: boolean } | null
  charge: { pct: number; toFull: string | null } | null
  /** Card 18: a notification banner. Sits above everything else while it is set. */
  banner: BannerModel | null
  unread: number
}
export const emptyLive = (): LiveData => ({ leave: null, game: null, timer: null, shift: null, music: null, charge: null, banner: null, unread: 0 })

export interface IslandLiveOptions {
  /** The pause and stop buttons on the study timer pill. */
  onTimer?: (action: 'toggle' | 'stop') => void
}
export interface IslandLiveHandle {
  /** Change some of what the island knows. Anything not named stays as it was. */
  update(part: Partial<LiveData>): void
  setUnread(n: number): void
  /** Card 27: live states that are switched off. The island skips them and shows the next one in line. */
  setOff(kinds: readonly LiveKind[]): void
  /** Plug in: the Charging state shows for 3 seconds with its floating bar, then goes. */
  charging(info: { pct: number; toFull: string | null }): void
  /** Show a HUD pill. A pill with the same key as the one on screen updates in place. */
  hud(m: HudModel): void
  /** What the closed island shows right now. */
  readonly shown: 'banner' | 'hud' | 'cycle' | LiveKind
  /**
   * Card 29: the modes the closed island cycles through when no live state, HUD pill or banner is on. An empty list switches the
   * cycle off and the island rests as before. Patched in place: the same items again change nothing.
   */
  setCycle(items: CycleItem[]): void
  /** Seconds between modes (4, 6 or 10). */
  setCycleEvery(sec: CycleEvery | number): void
  /** The mode on show, or null when the island is not cycling. */
  readonly cycleKey: CycleKey | null
  /** Show a notification banner, or null to let it settle back (card 18). */
  banner(m: BannerModel | null): void
  /** What a tap on the banner (`open`) or its button (`action`) does. Set by Banners. */
  onBanner(cb: (what: 'action' | 'open') => void): void
  readonly data: LiveData
  destroy(): void
}

const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg>'
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>'
const STOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
const RING_C = 2 * Math.PI * 14

const set = (el: Element | null, text: string) => { if (el && el.textContent !== text) el.textContent = text }
const q = <T extends Element>(root: Element, sel: string) => root.querySelector(sel) as T

interface View { el: HTMLElement; patch(d: never): void }
const mk = (kind: string, html: string): HTMLElement => {
  const el = h('div', { class: `il-view il-${kind}`, 'data-k': kind })
  el.innerHTML = html
  return el
}

function leaveView(): View {
  const el = mk('leave', '<div class="il-in"><span class="il-pulse"></span><b>Leave now</b><span class="il-s"></span><span class="il-chip num"></span></div>')
  return { el, patch: (d: NonNullable<LiveData['leave']>) => { set(q(el, '.il-s'), d.sub); set(q(el, '.il-chip'), d.chip) } }
}

function gameView(): View {
  const logo = (cls: string) => `<span class="il-logo ${cls}"></span>`
  const el = mk('game', `<div class="il-in">${logo('us')}<b class="num il-sc us"></b><span class="il-q"><i></i><em></em></span><b class="num il-sc them"></b>${logo('them')}</div>`)
  return {
    el,
    patch: (d: NonNullable<LiveData['game']>) => {
      for (const [side, t] of [['us', d.us], ['them', d.them]] as const) {
        const lg = q<HTMLElement>(el, `.il-logo.${side}`)
        set(lg, t.tri)
        lg.style.background = t.colour
        set(q(el, `.il-sc.${side}`), String(t.score))
        q<HTMLElement>(el, `.il-sc.${side}`).style.opacity = t.score < (side === 'us' ? d.them.score : d.us.score) ? '.55' : '1'
      }
      set(q(el, '.il-q em'), d.status)
      q<HTMLElement>(el, '.il-q i').style.display = /^Q\d|OT|Live/i.test(d.status) ? '' : 'none'
    },
  }
}

function timerView(onTimer: (a: 'toggle' | 'stop') => void): View {
  const el = mk('timer', `<div class="il-in il-big">
    <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="14" class="il-trk"/><circle cx="19" cy="19" r="14" class="il-arc" stroke-dasharray="${RING_C}" transform="rotate(-90 19 19)"/></svg>
    <div class="il-t"><small></small><b class="num"></b></div>
    <button type="button" class="il-b w" data-a="toggle"></button>
    <button type="button" class="il-b r" data-a="stop" aria-label="Stop timer">${STOP}</button></div>`)
  const toggle = q<HTMLButtonElement>(el, '[data-a=toggle]')
  let running: boolean | null = null
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-a]')
    if (!b) return
    e.stopPropagation()
    onTimer(b.dataset.a as 'toggle' | 'stop')
  })
  return {
    el,
    patch: (d: NonNullable<LiveData['timer']>) => {
      set(q(el, '.il-t small'), d.label)
      set(q(el, '.il-t b'), mmss(d.left))
      const f = d.total > 0 ? 1 - d.left / d.total : 0
      q<SVGElement>(el, '.il-arc').style.strokeDashoffset = String(RING_C * (1 - Math.min(1, Math.max(0, f))))
      if (running !== d.running) {
        running = d.running
        toggle.innerHTML = d.running ? PAUSE : PLAY
        toggle.setAttribute('aria-label', d.running ? 'Pause timer' : 'Resume timer')
      }
    },
  }
}

function shiftView(): View {
  const el = mk('shift', `<div class="il-in il-big"><span class="il-ic">${BOLT}</span><div class="il-t"><small></small><b class="num"></b></div><div class="il-t r"><small></small><b class="num sm"></b></div></div>`)
  return {
    el,
    patch: (d: NonNullable<LiveData['shift']>) => {
      const [a, b] = el.querySelectorAll('.il-t')
      set(a.querySelector('small'), d.label); set(a.querySelector('b'), d.big)
      set(b.querySelector('small'), d.rightLabel); set(b.querySelector('b'), d.rightValue)
    },
  }
}

function musicView(): View {
  const bars = [0.5, 0.9, 0.6, 1, 0.5].map((v, i) => `<i style="--h:${v};animation-delay:${i * 0.12}s"></i>`).join('')
  const el = mk('music', `<div class="il-in"><span class="il-art"></span><span class="il-mq"><b class="il-tt"></b></span><span class="il-eq">${bars}</span></div>`)
  const tt = q<HTMLElement>(el, '.il-tt')
  const mq = q<HTMLElement>(el, '.il-mq')
  let lastTitle = ''
  return {
    el,
    patch: (d: NonNullable<LiveData['music']>) => {
      if (d.title !== lastTitle) {
        lastTitle = d.title
        tt.textContent = d.title
        tt.classList.remove('run')
        // A title wider than its space scrolls slowly with a pause at the start, never cut at both ends (HALO.md 3.1c).
        requestAnimationFrame(() => {
          const over = tt.scrollWidth - mq.clientWidth
          if (over > 2) { tt.style.setProperty('--d', `${over}px`); tt.style.setProperty('--t', `${Math.max(6, over / 14 + 4)}s`); tt.classList.add('run') }
        })
      }
      const art = q<HTMLElement>(el, '.il-art')
      const want = d.art ? `url("${d.art}")` : ''
      if (art.style.backgroundImage !== want) art.style.backgroundImage = want
      q(el, '.il-eq').classList.toggle('on', d.playing)
    },
  }
}

function bannerView(onBanner: (w: 'action' | 'open') => void): View {
  const el = mk('banner', '<div class="il-in il-bn"><span class="bIc"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></span><div class="bTx"><b></b><span></span></div><div class="bR"><small class="num"></small><button type="button" class="bBtn"></button></div></div>')
  const btn = q<HTMLButtonElement>(el, '.bBtn')
  let type = ''
  el.addEventListener('click', (e) => {
    const isBtn = (e.target as Element).closest('.bBtn')
    e.stopPropagation()
    onBanner(isBtn ? 'action' : 'open')
  })
  return {
    el,
    patch: (d: BannerModel) => {
      if (type !== d.type) { type = d.type; q(el, '.bIc svg').innerHTML = d.icon }
      set(q(el, '.bTx b'), d.title)
      set(q(el, '.bTx span'), d.body)
      set(q(el, '.bR small'), d.time)
      set(btn, d.action?.label ?? '')
      btn.hidden = !d.action
    },
  }
}

function chargeView(): View {
  const el = mk('charge', `<div class="il-in"><span class="il-bolt">${BOLT}</span><b class="num il-pct"></b></div>`)
  return { el, patch: (d: NonNullable<LiveData['charge']>) => set(q(el, '.il-pct'), `${d.pct}%`) }
}

// ---- The cycle (card 29) ----------------------------------------------------------------------------------------

const LEAD_ICONS: Record<string, string> = {
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/>',
  bat: '<rect x="2" y="7" width="17" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="4.5" y="9.5" width="9" height="5" rx="1" fill="currentColor"/>',
  cash: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M3 10h18" stroke="currentColor" stroke-width="2.6"/>',
}
/** One element per mode, built once. `patchItem` only touches what changed, so a ticking clock never flashes. */
function cycleView() {
  const el = mk('cycle', CYCLE_KEYS.map((k) => `<div class="cm" data-k="${k}" aria-hidden="true"><span class="cm-lead"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></span><b class="cm-t num"></b><span class="cm-m"></span><span class="cm-r num"><svg class="cm-ri" viewBox="0 0 32 32" aria-hidden="true"></svg><em></em></span></div>`).join(''))
  const parts = new Map<CycleKey, HTMLElement>(CYCLE_KEYS.map((k) => [k, q<HTMLElement>(el, `.cm[data-k="${k}"]`)]))
  function patchItem(it: CycleItem) {
    const m = parts.get(it.key)!
    const lead = q<HTMLElement>(m, '.cm-lead')
    const dot = it.lead !== 'none' && it.lead !== 'art'
    lead.hidden = it.lead === 'none'
    lead.className = `cm-lead${dot ? ' dot' : it.lead === 'art' ? ' art' : ''}`
    if (dot) { lead.style.background = it.colour; const svg = q(lead, 'svg'); const mk2 = LEAD_ICONS[it.lead]; if (svg.innerHTML !== mk2) svg.innerHTML = mk2 }
    else { lead.style.background = ''; const bg = it.lead === 'art' && it.art ? `url("${it.art}")` : ''; if (lead.style.backgroundImage !== bg) lead.style.backgroundImage = bg }
    set(q(m, '.cm-t'), it.title)
    const mid = q<HTMLElement>(m, '.cm-m')
    mid.hidden = !it.mid
    set(mid, it.mid ?? '')
    const ri = q<SVGElement>(m, '.cm-ri')
    const icon = it.rightIcon === 'sun' ? SUN_SVG : it.rightIcon === 'moon' ? MOON_SVG : ''
    if (ri.innerHTML !== icon) ri.innerHTML = icon
    ri.style.display = icon ? '' : 'none'
    set(q(m, '.cm-r em'), it.right)
    q<HTMLElement>(m, '.cm-r').hidden = !it.right && !icon
  }
  function show(key: CycleKey | null) {
    for (const [k, m] of parts) { const on = k === key; m.classList.toggle('on', on); m.setAttribute('aria-hidden', String(!on)) }
  }
  return { el, patchItem, show, patch: () => {} } as View & { patchItem(i: CycleItem): void; show(k: CycleKey | null): void }
}

// ---- HUD pills --------------------------------------------------------------

function hudBody(m: HudModel): string {
  const ic = (lit: boolean) => `<span class="hIc${lit ? ' lit' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${hudIconMarkup(m.icon)}</svg></span>`
  if (m.kind === 'slider') return `${ic(false)}<div class="hMid"><small>${esc(m.label)}</small><div class="hTr"><i style="width:${m.from}%"></i><b style="left:${m.from}%"></b></div></div><span class="hV num">${m.from}</span>`
  if (m.kind === 'toggle') return `${ic(m.on)}<div class="hMid"><b>${esc(m.label)}</b><small>${esc(m.sub)}</small></div><span class="hSt${m.on ? ' on' : ''}">${esc(m.on ? m.onText : m.offText)}</span>`
  if (m.kind === 'choice') return `${ic(true)}<div class="hMid"><b>${esc(m.label)}</b><div class="hCh">${m.options.map((x, i) => `<i class="${i === m.sel ? 'on' : ''}">${esc(x)}</i>`).join('')}</div></div>`
  return `${ic(true)}<div class="hMid"><b>${m.on ? 'Charging' : 'On battery'}</b><div class="hTr bat"><i style="width:${m.on ? 0 : m.pct}%"></i></div></div><span class="hV num">${m.pct}%</span>`
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Moves a pill that is already on screen to the new numbers. Same elements, so bars slide and nothing pops. */
function patchHud(root: HTMLElement, m: HudModel) {
  q(root, '.hIc svg').innerHTML = hudIconMarkup(m.icon)
  if (m.kind === 'slider') {
    set(q(root, '.hMid small'), m.label)
    q<HTMLElement>(root, '.hTr i').style.width = `${m.value}%`
    q<HTMLElement>(root, '.hTr b').style.left = `${m.value}%`
    set(q(root, '.hV'), String(m.value))
  } else if (m.kind === 'toggle') {
    q(root, '.hIc').classList.toggle('lit', m.on)
    set(q(root, '.hMid b'), m.label)
    set(q(root, '.hMid small'), m.sub)
    const st = q(root, '.hSt')
    st.classList.toggle('on', m.on)
    set(st, m.on ? m.onText : m.offText)
  } else if (m.kind === 'choice') {
    set(q(root, '.hMid b'), m.label)
    root.querySelectorAll('.hCh i').forEach((c, i) => c.classList.toggle('on', i === m.sel))
  }
}

export function IslandLive(sh: ShellHandle, o: IslandLiveOptions = {}): IslandLiveHandle {
  const data = emptyLive()
  /** Live states Liam switched off in Settings (card 27). The island skips them. */
  const off = new Set<LiveKind>()
  let bannerCb: (what: 'action' | 'open') => void = () => {}
  const layer = sh.live
  const ring = h('div', { class: 'il-ring', 'aria-hidden': 'true' })
  const hudEl = h('div', { class: 'il-view il-hud', 'data-k': 'hud' })
  const dot = h('span', { class: 'il-unread', 'aria-hidden': 'true' })
  const cycle = cycleView()
  const views: Record<string, View> = {
    leave: leaveView(), game: gameView(), timer: timerView((a) => o.onTimer?.(a)), shift: shiftView(), music: musicView(), charge: chargeView(), banner: bannerView((w) => bannerCb(w)), cycle,
  }
  // Small pips under the island show where the cycle is. They sit on the shell, outside its clip, like the charging bar.
  const pips = h('div', { class: 'il-pips', 'aria-hidden': 'true' })
  sh.el.append(pips)
  const chg = h('div', { class: 'il-chg', 'aria-hidden': 'true' })
  chg.innerHTML = `<span class="il-bolt">${BOLT}</span><div class="hTr bat"><i></i></div><span class="il-full num"></span>`
  layer.append(ring, ...Object.values(views).map((v) => v.el), hudEl, dot)
  sh.el.append(chg)

  let hud: HudModel | null = null
  let hudNode: HTMLElement | null = null
  let hudKey = ''
  let hudDrawn: HudModel | null = null
  let hudTimer = 0
  let chargeTimer = 0
  let shown: 'banner' | 'hud' | 'cycle' | LiveKind | '' = ''
  // Card 29: the cycle. `items` are the modes with something to show, `key` the one on show.
  let items: CycleItem[] = []
  let ckey: CycleKey | null = null
  let everyMsNow = DEFAULT_EVERY * 1000
  let cycleTimer = 0
  let hovered = false
  let pipKey = ''
  let sizeKey = ''
  let alive = true

  function endHud() { hud = null; hudKey = ''; hudNode = null; hudDrawn = null; hudEl.replaceChildren(); render() }

  function showHud(m: HudModel) {
    if (hudDrawn === m) return // render runs for other reasons too (a timer tick), the pill is already right
    hudDrawn = m
    sh.el.style.setProperty('--hc', m.colour)
    if (hudNode && hudKey === m.key) {
      patchHud(hudNode, m)
      return
    }
    hudKey = m.key
    hudNode = h('div', { class: `hIn ${m.kind}` })
    hudNode.innerHTML = hudBody(m)
    hudEl.replaceChildren(hudNode)
    if (m.kind === 'slider') {
      // Start from where the bar was, then move, so it slides instead of appearing.
      requestAnimationFrame(() => requestAnimationFrame(() => { if (hudNode && hud === m) patchHud(hudNode, m) }))
    } else if (m.kind === 'charge' && m.on) {
      const fill = q<HTMLElement>(hudNode, '.hTr i')
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${m.pct}%` }))
    }
  }

  /** One pip per mode, the current one long. Rebuilt only when the list of modes changes. */
  function paintPips() {
    const k = items.map((x) => x.key).join()
    if (k !== pipKey) { pipKey = k; pips.replaceChildren(...items.map(() => h('i'))) }
    ;[...pips.children].forEach((p, i) => p.classList.toggle('on', items[i]?.key === ckey))
  }
  /**
   * The cycle moves on every few seconds, but only while it is on show, the pointer is not over it, the window is closed and the
   * page is visible. Hovering pauses it (hover for 300 ms opens the window anyway). It never restarts on its own, so a clock tick
   * that calls render() does not push the next mode back.
   */
  const canRun = () => alive && !hovered && !sh.isOpen && !document.hidden && items.length > 1
  function syncCycleTimer(cycling: boolean) {
    if (!cycling || !canRun()) { if (cycleTimer) { window.clearTimeout(cycleTimer); cycleTimer = 0 } return }
    if (cycleTimer) return
    cycleTimer = window.setTimeout(() => {
      cycleTimer = 0
      ckey = nextKey(items, ckey)
      render()
    }, everyMsNow)
  }
  const restart = () => { window.clearTimeout(cycleTimer); cycleTimer = 0; render() }
  const onEnter = (e: PointerEvent) => { if (e.pointerType === 'touch') return; hovered = true; restart() }
  const onLeave = () => { hovered = false; restart() }
  const onVis = () => restart()
  sh.el.addEventListener('pointerenter', onEnter)
  sh.el.addEventListener('pointerleave', onLeave)
  document.addEventListener('visibilitychange', onVis)
  // Opening the window stops the cycle, closing it starts it again from a full interval.
  const watchOpen = new MutationObserver(() => restart())
  watchOpen.observe(sh.el, { attributes: true, attributeFilter: ['data-open'] })

  function render() {
    if (!alive) return
    const on = (k: LiveKind) => !off.has(k)
    const kind = pickLive({ leave: !!data.leave && on('leave'), game: !!data.game && on('game'), timer: !!data.timer && on('timer'), shift: !!data.shift && on('shift'), music: !!data.music && on('music'), charge: !!data.charge && on('charge'), unread: data.unread })
    let disp: 'banner' | 'hud' | 'cycle' | LiveKind = pickDisplay(kind, !!hud, !!data.banner)
    // Card 29: nothing live, no pill and no banner, so the island cycles instead of resting blank. Anything live wins at once
    // and the cycle starts again from a full interval when it is over.
    if ((disp === 'idle' || disp === 'unread') && items.length) disp = 'cycle'
    let cycleLook: Look | null = null
    if (disp === 'cycle') {
      ckey = settleKey(items, ckey)
      const cur = items.find((x) => x.key === ckey)!
      for (const it of items) cycle.patchItem(it)
      cycle.show(ckey)
      paintPips()
      cycleLook = { w: cur.w, h: CYCLE_H, r: CYCLE_R, colour: cur.colour, ring: false }
    }
    if (disp === 'banner' && data.banner) (views.banner.patch as (x: unknown) => void)(data.banner)
    else if (disp === 'hud' && hud) showHud(hud)
    else if (disp !== 'hud' && disp !== 'cycle') {
      const v = views[disp]
      const d = data[disp as keyof LiveData]
      if (v && d) (v.patch as (x: unknown) => void)(d)
    }
    // Sizes and colours only move when what is shown changes.
    const look = cycleLook ?? (disp === 'banner' && data.banner ? { ...BANNER, colour: data.banner.colour, ring: false }
      : disp === 'hud' && hud ? { ...(hud.wide ? HUD_LOOK.wide : HUD_LOOK.narrow), colour: hud.colour, ring: false } : LOOK[kind])
    const colour = disp === 'hud' || disp === 'banner' ? look.colour : kind === 'timer' && data.timer ? data.timer.colour : look.colour
    const key = `${disp}|${look.w}`
    if (key !== sizeKey) {
      const first = sizeKey === ''
      sizeKey = key
      sh.setSize(look, first ? 'snap' : disp === 'banner' ? 'banner' : disp === 'hud' || shown === 'hud' ? 'hud' : disp === 'cycle' && shown === 'cycle' ? 'cycle' : 'live')
    }
    if (disp !== shown) {
      shown = disp
      sh.el.dataset.live = disp
      sh.el.dataset.ring = look.ring ? '1' : '0'
      for (const [k, v] of Object.entries(views)) { const on = k === disp; v.el.classList.toggle('on', on); v.el.toggleAttribute('inert', !on) }
      hudEl.classList.toggle('on', disp === 'hud'); hudEl.toggleAttribute('inert', disp !== 'hud')
      chg.classList.toggle('on', disp === 'charge')
      if (disp === 'charge' && data.charge) {
        const fill = q<HTMLElement>(chg, '.hTr i')
        fill.style.width = '0'
        const pct = data.charge.pct
        window.setTimeout(() => { if (shown === 'charge') fill.style.width = `${pct}%` }, slow(300))
      } else q<HTMLElement>(chg, '.hTr i').style.width = '0'
    }
    dot.classList.toggle('on', disp === 'unread' || (disp === 'cycle' && data.unread > 0))
    pips.classList.toggle('on', disp === 'cycle' && items.length > 1)
    syncCycleTimer(disp === 'cycle')
    sh.setKey(colour)
    sh.el.style.setProperty('--lc', colour)
    if (disp === 'charge' && data.charge) set(q(chg, '.il-full'), data.charge.toFull ?? 'Charging')
  }

  render()
  return {
    update(part) { Object.assign(data, part); render() },
    setUnread(n) { data.unread = n; sh.setUnread(n); render() },
    setOff(kinds) { off.clear(); kinds.forEach((k) => off.add(k)); render() },
    banner(m) { data.banner = m; render() },
    onBanner(cb) { bannerCb = cb },
    charging(info) {
      window.clearTimeout(chargeTimer)
      data.charge = info
      render()
      chargeTimer = window.setTimeout(() => { data.charge = null; render() }, slow(3000))
    },
    hud(m) {
      // While the window is open it is already showing the change, so a pill would only pull it shut.
      if (sh.isOpen) return
      hud = m
      window.clearTimeout(hudTimer)
      hudTimer = window.setTimeout(endHud, slow(m.hold))
      render()
    },
    get shown() { return (shown || 'idle') as 'banner' | 'hud' | 'cycle' | LiveKind },
    setCycle(next) {
      // The same modes with the same words change nothing, so the clock's once a second call is free.
      if (JSON.stringify(next) === JSON.stringify(items)) return
      const wasOn = items.length > 0
      items = next
      if (!wasOn || !next.length) { window.clearTimeout(cycleTimer); cycleTimer = 0 }
      render()
    },
    setCycleEvery(sec) { const ms = everyMs(sec); if (ms === everyMsNow) return; everyMsNow = ms; window.clearTimeout(cycleTimer); cycleTimer = 0; render() },
    get cycleKey() { return shown === 'cycle' ? ckey : null },
    get data() { return data },
    destroy() { alive = false; window.clearTimeout(hudTimer); window.clearTimeout(chargeTimer); window.clearTimeout(cycleTimer); watchOpen.disconnect(); sh.el.removeEventListener('pointerenter', onEnter); sh.el.removeEventListener('pointerleave', onLeave); document.removeEventListener('visibilitychange', onVis); chg.remove(); pips.remove(); layer.replaceChildren() },
  }
}
