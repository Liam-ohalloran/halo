import { h, svg, clamp } from './dom'
import { LightSpill, type LightSpillHandle } from './LightSpill'
import { Spring, SPRING, addTicker, after, animate, reduced, type SpringParams } from '../lib/motion'

// Island shell (HALO.md 3.1, 3.3, 3.5). The pull-out is the most important animation in Halo.
//
// How it is built
//  - The black body, the ears and the key line are SVG paths redrawn from three springs: width,
//    height and bottom radius. They share one spring so the shape moves as a single piece.
//  - The content sits in a layer clipped to the same shape (clip-path), so nothing pokes out of the
//    rounded corners while it morphs. Only paint changes per frame, never layout.
//  - Springs keep position and velocity when retargeted, so leaving mid open reverses smoothly.
//  - LightSpill gets the live shape every frame, so the glow pours out with the island.
//
// Open (3.5): 0 to 90 ms compact content fades, scales to 0.94 and blurs 4 px while the island does a
// tiny squash (scaleX 1.03, scaleY 0.97). From 60 ms the shape springs open (k 380, c 28). At about 55%
// of the shape motion the expanded rows stagger in, 30 ms apart, tab bar first.
// Close: the reverse, about 30% faster (k 420, c 32), content gone before the shape finishes shrinking.
// Alert: a bouncier spring (c 22) and one glow flare. Reduce motion: no squash, overshoot or blur, 200 ms.

export type IslandState = 'resting' | 'compact' | 'wide' | 'alert' | 'expanded'

/** Sizes from the approved design canvas, HALO.md 3.3. */
export const SIZES: Record<IslandState, { w: number; h: number; r: number }> = {
  resting: { w: 200, h: 34, r: 17 },
  compact: { w: 300, h: 40, r: 20 },
  wide: { w: 400, h: 40, r: 20 },
  alert: { w: 520, h: 84, r: 34 },
  expanded: { w: 660, h: 200, r: 48 },
}
/** Ear fillet radius. Ears stay attached the whole time. */
export const EAR = 10
const EDGE = 12
/** Expanded padding: 22 top, 26 right, 22 bottom, 24 left. */
export const EXPANDED_PAD = { top: 22, right: 26, bottom: 22, left: 24 }

export interface IslandOptions {
  /** Height of the stage the island hangs in. Must fit the tallest expanded state. */
  stageHeight?: number
  initial?: IslandState
  /** Where close returns to. */
  base?: IslandState
  /** Key line and glow colour from the content, e.g. '#FF9F0A'. */
  tint?: string
  pulse?: 'slow' | 'music'
  /** Pointer hover opens after openDelay and leaving closes. Off by default. */
  hover?: boolean
  openDelay?: number
  /** Click or Enter toggles open. On by default. */
  toggleOnClick?: boolean
  label?: string
  onState?: (s: IslandState) => void
}

export interface IslandHandle extends HTMLDivElement {
  readonly state: IslandState
  setState(s: IslandState): void
  open(): void
  close(): void
  /** Grow into the alert banner, hold, then settle back. */
  alert(content?: Node | Node[], holdMs?: number): void
  setContent(state: IslandState, content: Node | Node[]): void
  /** Replace the content of the visible state with a blur crossfade (compact music to shift and so on). */
  swapContent(state: IslandState, content: Node | Node[]): void
  setExpandedHeight(h: number): void
  setTint(hex: string): void
  /** Split colours left and right, e.g. the two teams in a live game. */
  setColours(left: string, right?: string): void
  setPulse(p: 'slow' | 'music'): void
  setDisabled(disabled: boolean): void
  spill: LightSpillHandle
  /** Called every frame with the live shape, for readouts. */
  onFrame?: (s: { w: number; h: number; r: number }) => void
}

type View = HTMLDivElement
const tokens = new WeakMap<View, number>()

export function Island(o: IslandOptions = {}): IslandHandle {
  const H = o.stageHeight ?? 340
  let W = 0
  let cur: IslandState = o.initial ?? 'compact'
  let base: IslandState = o.base ?? (cur === 'expanded' || cur === 'alert' ? 'compact' : cur)
  let expandedH = SIZES.expanded.h
  let returnTo: IslandState = base

  const root = h('div', { class: 'h-island' }) as IslandHandle
  root.style.height = `${H}px`
  if (o.tint) root.style.setProperty('--k', o.tint)

  const spill = LightSpill({ colours: [o.tint ?? '#FF9F0A', o.tint ?? '#FF9F0A'], pulse: o.pulse })
  const body = h('div', { class: 'h-isl-body' })
  const s = svg('svg', { class: 'h-isl-svg', 'aria-hidden': 'true' })
  const fillP = svg('path', { class: 'h-isl-fill' })
  const keyP = svg('path', { class: 'h-isl-key', fill: 'none' })
  const hlP = svg('path', { class: 'h-isl-hl', fill: 'none', pathLength: 1 })
  s.append(fillP, keyP, hlP)
  const clip = h('div', { class: 'h-isl-clip', role: 'button', tabindex: 0, 'aria-label': o.label ?? 'Island', 'aria-expanded': String(cur === 'expanded') })
  body.append(s, clip)
  root.append(spill, body)
  root.spill = spill

  // ---- Views, one per state, each laid out at its own final size so content never reflows mid morph
  const views: Partial<Record<IslandState, View>> = {}
  const viewFor = (st: IslandState): View => {
    let v = views[st]
    if (!v) {
      v = h('div', { class: 'h-isl-view', 'data-state': st }) as View
      v.style.visibility = st === cur ? 'visible' : 'hidden'
      v.style.opacity = st === cur ? '1' : '0'
      views[st] = v
      clip.append(v)
      layoutViews()
    }
    return v
  }
  const fit = (w: number) => (W ? Math.min(w, W - 2 * (EAR + EDGE)) : w)
  const target = (st: IslandState) => ({ w: fit(SIZES[st].w), h: st === 'expanded' ? expandedH : SIZES[st].h, r: SIZES[st].r })
  function layoutViews() {
    for (const [st, v] of Object.entries(views) as [IslandState, View][]) {
      const t = target(st)
      v.style.width = `${t.w}px`
      v.style.height = `${t.h}px`
      v.style.left = `${(W - t.w) / 2}px`
    }
  }

  // ---- Springs
  const t0 = target(cur)
  const sw = new Spring(t0.w)
  const sh = new Spring(t0.h)
  const sr = new Spring(t0.r)
  const sx = new Spring(1)
  const sy = new Spring(1)
  const all = [sw, sh, sr, sx, sy]
  const setParams = (p: SpringParams) => { sw.set(p); sh.set(p); sr.set(p) }
  sx.set(SPRING.squash); sy.set(SPRING.squash)
  setParams(SPRING.change)

  // ---- Drawing
  function draw() {
    const w = sw.x
    const hh = sh.x
    const r = clamp(sr.x, 0, Math.min(w / 2, hh - EAR))
    const cx = W / 2
    const x0 = cx - w / 2
    const x1 = cx + w / 2
    const e = EAR
    const f = (n: number) => Math.round(n * 100) / 100
    const side = `L${f(x0)} ${f(hh - r)} A${f(r)} ${f(r)} 0 0 0 ${f(x0 + r)} ${f(hh)} L${f(x1 - r)} ${f(hh)} A${f(r)} ${f(r)} 0 0 0 ${f(x1)} ${f(hh - r)} L${f(x1)} ${e}`
    // Flat top, concave ear fillets, straight sides, rounded bottom corners.
    fillP.setAttribute('d', `M${f(x0 - e)} 0 A${e} ${e} 0 0 1 ${f(x0)} ${e} ${side} A${e} ${e} 0 0 1 ${f(x1 + e)} 0 Z`)
    const key = `M${f(x0)} ${e} ${side}`
    keyP.setAttribute('d', key)
    hlP.setAttribute('d', key)
    clip.style.clipPath = `inset(0px ${f(x0)}px ${f(H - hh)}px ${f(x0)}px round 0px 0px ${f(r)}px ${f(r)}px)`
    body.style.transform = sx.x === 1 && sy.x === 1 ? '' : `scale(${sx.x.toFixed(4)}, ${sy.x.toFixed(4)})`
    // Same width, height and radius as the drawn body, including the open squash scale.
    spill.setShape({ cx, w: w * sx.x, h: hh * sy.x, r })
    root.onFrame?.({ w, h: hh, r })
  }

  // ---- Frame loop with progress watchers
  type Watch = { frac: number; from: { w: number; h: number }; to: { w: number; h: number }; fn: () => void }
  let watchers: Watch[] = []
  let ticking = false
  function progress(wt: Watch): number {
    const dw = wt.to.w - wt.from.w
    const dh = wt.to.h - wt.from.h
    if (Math.abs(dw) < 4 && Math.abs(dh) < 4) return 1
    return Math.abs(dw) >= Math.abs(dh) ? (sw.x - wt.from.w) / dw : (sh.x - wt.from.h) / dh
  }
  function tick(dt: number): boolean {
    for (const sp of all) sp.step(dt)
    draw()
    for (const wt of [...watchers]) {
      if (progress(wt) >= wt.frac) { watchers = watchers.filter((x) => x !== wt); wt.fn() }
    }
    if (all.every((sp) => sp.settled) && !watchers.length) { ticking = false; return false }
    return true
  }
  function kick() { if (!ticking) { ticking = true; addTicker(tick) } }

  // ---- View transitions
  const readOpacity = (v: View) => (v.style.visibility === 'hidden' ? 0 : parseFloat(getComputedStyle(v).opacity) || 0)
  function bump(v: View): number {
    const n = (tokens.get(v) ?? 0) + 1
    tokens.set(v, n)
    for (const a of v.getAnimations({ subtree: true })) a.cancel()
    return n
  }
  function fadeOut(v: View, dur: number) {
    const o = readOpacity(v)
    const n = bump(v)
    v.style.opacity = '0'
    if (o <= 0.01) { v.style.visibility = 'hidden'; return }
    const rm = reduced()
    const a = animate(v, rm ? [{ opacity: o }, { opacity: 0 }] : [
      { opacity: o, transform: `scale(${1 - 0.06 * (1 - o)})`, filter: `blur(${4 * (1 - o)}px)` },
      { opacity: 0, transform: 'scale(0.94)', filter: 'blur(4px)' }], { duration: dur, easing: 'ease-out' })
    a.onfinish = () => { if (tokens.get(v) === n) { v.style.visibility = 'hidden'; a.cancel() } }
  }
  /** Show a view but keep its children invisible until reveal() runs. */
  function prepare(v: View) {
    bump(v)
    v.style.visibility = 'visible'
    v.style.opacity = '1'
    v.classList.add('is-pre')
  }
  function reveal(v: View, stagger: boolean) {
    const rm = reduced()
    const n = bump(v)
    v.classList.remove('is-pre')
    v.style.visibility = 'visible'
    v.style.opacity = '1'
    if (stagger && !rm) {
      // Each row fades in, rises 6 px and scales 0.98 to 1, clearing a 4 px blur, 30 ms apart.
      ;[...v.children].forEach((c, i) => {
        const a = animate(c, [
          { opacity: 0, transform: 'translateY(6px) scale(0.98)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' }], { duration: 340, delay: i * 30, fill: 'backwards' })
        a.onfinish = () => { if (tokens.get(v) === n) a.cancel() }
      })
      return
    }
    const a = animate(v, rm ? [{ opacity: 0 }, { opacity: 1 }] : [
      { opacity: 0, transform: 'scale(0.94)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }], { duration: rm ? 200 : 220, fill: 'backwards' })
    a.onfinish = () => { if (tokens.get(v) === n) a.cancel() }
  }

  // ---- State machine
  let cancels: (() => void)[] = []
  let holdCancel: (() => void) | null = null
  const later = (ms: number, fn: () => void) => { cancels.push(after(ms, fn)) }

  function go(next: IslandState) {
    if (next === cur) return
    const prev = cur
    cur = next
    cancels.forEach((c) => c()); cancels = []
    watchers = []
    if (prev === 'alert') { holdCancel?.(); holdCancel = null }
    const kind = next === 'expanded' ? 'open' : prev === 'expanded' ? 'close' : next === 'alert' ? 'alert' : 'change'
    const rm = reduced()
    const params = rm ? SPRING.reduced : kind === 'open' ? SPRING.open : kind === 'close' ? SPRING.close : kind === 'alert' ? SPRING.alert : SPRING.change
    const to = target(next)
    const from = { w: sw.x, h: sh.x }

    root.setAttribute('data-state', next)
    clip.setAttribute('aria-expanded', String(next === 'expanded'))
    o.onState?.(next)

    // Old content goes first: 0 to 90 ms on open, quicker on close so it is gone before the shape shrinks.
    fadeOut(viewFor(prev), rm ? 200 : kind === 'close' ? 100 : kind === 'open' ? 90 : 110)
    const nv = viewFor(next)
    prepare(nv)

    const startShape = () => {
      setParams(params)
      sw.to(to.w); sh.to(to.h); sr.to(to.r)
      kick()
    }
    if (kind === 'open' && !rm) {
      // Anticipation squash, then the shape springs from 60 ms.
      sx.set(SPRING.squash); sy.set(SPRING.squash)
      sx.to(1.03); sy.to(0.97)
      later(90, () => { sx.to(1); sy.to(1); kick() })
      later(60, startShape)
      kick()
    } else {
      sx.to(1); sy.to(1)
      startShape()
    }
    // New content arrives once the shape is far enough along. Expanded rows start at 55%.
    const frac = kind === 'open' ? 0.55 : kind === 'close' ? 0.5 : 0.3
    watchers.push({ frac, from, to: { w: to.w, h: to.h }, fn: () => reveal(nv, next === 'expanded') })
    kick()
    if (kind === 'alert') spill.flare()
  }

  // ---- Public API
  Object.defineProperty(root, 'state', { get: () => cur })
  root.setState = (st) => {
    if (st !== 'alert' && st !== 'expanded') { base = st; returnTo = st }
    go(st)
  }
  root.open = () => go('expanded')
  root.close = () => go(cur === 'alert' ? returnTo : base)
  root.alert = (content, holdMs = 2600) => {
    if (cur !== 'alert') returnTo = cur === 'expanded' ? 'expanded' : cur
    if (content) root.setContent('alert', content)
    holdCancel?.()
    go('alert')
    holdCancel = after(holdMs, () => { holdCancel = null; go(returnTo) })
  }
  root.setContent = (st, content) => {
    const v = viewFor(st)
    v.replaceChildren(...(Array.isArray(content) ? content : [content]))
  }
  let swapSeq = 0
  root.swapContent = (st, content) => {
    const nodes = Array.isArray(content) ? content : [content]
    const v = viewFor(st)
    const kids = [...v.children]
    const mine = ++swapSeq
    if (st !== cur || !kids.length) { root.setContent(st, nodes); return }
    const rm = reduced()
    let pending = kids.length
    const swap = () => {
      if (mine !== swapSeq) return
      v.replaceChildren(...nodes)
      for (const c of v.children) {
        const a = animate(c, rm ? [{ opacity: 0 }, { opacity: 1 }] : [
          { opacity: 0, transform: 'scale(0.94)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }], { duration: rm ? 200 : 180, fill: 'backwards' })
        a.onfinish = () => a.cancel()
      }
    }
    for (const k of kids) {
      const a = animate(k, rm ? [{ opacity: 1 }, { opacity: 0 }] : [
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'scale(0.94)', filter: 'blur(4px)' }], { duration: rm ? 200 : 110, easing: 'ease-out' })
      a.onfinish = () => { if (--pending === 0) swap() }
    }
  }
  root.setExpandedHeight = (hv) => {
    expandedH = hv
    layoutViews()
    if (cur === 'expanded') {
      setParams(reduced() ? SPRING.reduced : SPRING.change)
      sh.to(hv)
      kick()
    }
  }
  root.setTint = (hex) => {
    root.style.setProperty('--k', hex)
    spill.setColours(hex, hex)
  }
  root.setColours = (l, r) => spill.setColours(l, r ?? l)
  root.setPulse = (p) => spill.setPulse(p)
  root.setDisabled = (d) => {
    root.classList.toggle('is-disabled', d)
    clip.tabIndex = d ? -1 : 0
    clip.setAttribute('aria-disabled', String(d))
  }

  // ---- Input: click, keyboard, optional hover
  if (o.toggleOnClick !== false) {
    clip.addEventListener('click', () => (cur === 'expanded' ? root.close() : root.open()))
  }
  clip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cur === 'expanded' ? root.close() : root.open() }
    else if (e.key === 'Escape' && cur === 'expanded') root.close()
  })
  if (o.hover) {
    let timer = 0
    clip.addEventListener('pointerenter', () => { clearTimeout(timer); timer = window.setTimeout(() => root.open(), o.openDelay ?? 280) })
    clip.addEventListener('pointerleave', () => { clearTimeout(timer); timer = window.setTimeout(() => { if (cur === 'expanded') root.close() }, 200) })
  }

  // ---- Size to the stage
  const measure = () => {
    const w = root.clientWidth
    if (!w || w === W) return
    W = w
    s.setAttribute('viewBox', `0 0 ${W} ${H}`)
    s.setAttribute('width', String(W))
    s.setAttribute('height', String(H))
    layoutViews()
    const t = target(cur)
    sw.snap(t.w); sh.snap(t.h); sr.snap(t.r)
    draw()
  }
  new ResizeObserver(measure).observe(root)
  viewFor(cur)
  root.setAttribute('data-state', cur)
  measure()
  return root
}

// ---- PanelHost: tab switch inside the expanded island ----------------------
// The panel slides 12 px left or right depending on tab order, with a quick cross blur.
// show() returns the new panel's natural height so the caller can spring the island to fit.

export interface PanelHostHandle extends HTMLDivElement {
  /** dir: 1 when the new tab is later in the bar, -1 when earlier, 0 for no slide. */
  show(panel: HTMLElement, dir?: number): number
}

export function PanelHost(): PanelHostHandle {
  const host = h('div', { class: 'h-panelhost' }) as PanelHostHandle
  let current: HTMLElement | null = null
  host.show = (panel, dir = 0) => {
    panel.classList.add('h-panel')
    host.append(panel)
    const natural = panel.offsetHeight
    host.style.height = `${natural}px`
    const old = current
    const rm = reduced()
    if (old && old !== panel) {
      const out = animate(old, rm ? [{ opacity: 1 }, { opacity: 0 }] : [
        { opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)' },
        { opacity: 0, transform: `translateX(${-12 * dir}px)`, filter: 'blur(4px)' }], { duration: rm ? 200 : 160, easing: 'ease-out' })
      out.onfinish = () => old.remove()
      old.style.pointerEvents = 'none'
    }
    if (old && old !== panel) {
      animate(panel, rm ? [{ opacity: 0 }, { opacity: 1 }] : [
        { opacity: 0, transform: `translateX(${12 * dir}px)`, filter: 'blur(4px)' },
        { opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)' }], { duration: rm ? 200 : 280, delay: rm ? 0 : 50, fill: 'backwards' })
    }
    current = panel
    return natural
  }
  return host
}
