import '../styles/shell.css'
import '../styles/island-live.css'
import { h } from './dom'
import type { ShellHandle } from './Shell'
import { HUD_LOOK, LOOK, mmss, pickDisplay, pickLive, type LiveKind } from '../lib/island-live'
import { BANNER, type BannerModel } from '../lib/banner'
import type { HudModel } from '../lib/hud'
import { hudIconMarkup } from './hud-icons'
import { slow } from '../lib/motion'

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
  /** Plug in: the Charging state shows for 3 seconds with its floating bar, then goes. */
  charging(info: { pct: number; toFull: string | null }): void
  /** Show a HUD pill. A pill with the same key as the one on screen updates in place. */
  hud(m: HudModel): void
  /** What the closed island shows right now. */
  readonly shown: 'banner' | 'hud' | LiveKind
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
  let bannerCb: (what: 'action' | 'open') => void = () => {}
  const layer = sh.live
  const ring = h('div', { class: 'il-ring', 'aria-hidden': 'true' })
  const hudEl = h('div', { class: 'il-view il-hud', 'data-k': 'hud' })
  const dot = h('span', { class: 'il-unread', 'aria-hidden': 'true' })
  const views: Record<string, View> = {
    leave: leaveView(), game: gameView(), timer: timerView((a) => o.onTimer?.(a)), shift: shiftView(), music: musicView(), charge: chargeView(), banner: bannerView((w) => bannerCb(w)),
  }
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
  let shown: 'banner' | 'hud' | LiveKind | '' = ''
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

  function render() {
    if (!alive) return
    const kind = pickLive({ leave: !!data.leave, game: !!data.game, timer: !!data.timer, shift: !!data.shift, music: !!data.music, charge: !!data.charge, unread: data.unread })
    const disp = pickDisplay(kind, !!hud, !!data.banner)
    if (disp === 'banner' && data.banner) (views.banner.patch as (x: unknown) => void)(data.banner)
    else if (disp === 'hud' && hud) showHud(hud)
    else if (disp !== 'hud') {
      const v = views[disp]
      const d = data[disp as keyof LiveData]
      if (v && d) (v.patch as (x: unknown) => void)(d)
    }
    // Sizes and colours only move when what is shown changes.
    const look = disp === 'banner' && data.banner ? { ...BANNER, colour: data.banner.colour, ring: false }
      : disp === 'hud' && hud ? { ...(hud.wide ? HUD_LOOK.wide : HUD_LOOK.narrow), colour: hud.colour, ring: false } : LOOK[kind]
    const colour = disp === 'hud' || disp === 'banner' ? look.colour : kind === 'timer' && data.timer ? data.timer.colour : look.colour
    const key = `${disp}|${look.w}`
    if (key !== sizeKey) {
      const first = sizeKey === ''
      sizeKey = key
      sh.setSize(look, first ? 'snap' : disp === 'banner' ? 'banner' : disp === 'hud' || shown === 'hud' ? 'hud' : 'live')
    }
    if (disp !== shown) {
      shown = disp
      sh.el.dataset.live = disp
      sh.el.dataset.ring = look.ring ? '1' : '0'
      for (const [k, v] of Object.entries(views)) { const on = k === disp; v.el.classList.toggle('on', on); v.el.toggleAttribute('inert', !on) }
      hudEl.classList.toggle('on', disp === 'hud'); hudEl.toggleAttribute('inert', disp !== 'hud')
      dot.classList.toggle('on', disp === 'unread')
      chg.classList.toggle('on', disp === 'charge')
      if (disp === 'charge' && data.charge) {
        const fill = q<HTMLElement>(chg, '.hTr i')
        fill.style.width = '0'
        const pct = data.charge.pct
        window.setTimeout(() => { if (shown === 'charge') fill.style.width = `${pct}%` }, slow(300))
      } else q<HTMLElement>(chg, '.hTr i').style.width = '0'
    }
    sh.setKey(colour)
    sh.el.style.setProperty('--lc', colour)
    if (disp === 'charge' && data.charge) set(q(chg, '.il-full'), data.charge.toFull ?? 'Charging')
  }

  render()
  return {
    update(part) { Object.assign(data, part); render() },
    setUnread(n) { data.unread = n; sh.setUnread(n); render() },
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
    get shown() { return (shown || 'idle') as 'banner' | 'hud' | LiveKind },
    get data() { return data },
    destroy() { alive = false; window.clearTimeout(hudTimer); window.clearTimeout(chargeTimer); chg.remove(); layer.replaceChildren() },
  }
}
