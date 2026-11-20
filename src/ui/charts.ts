// Card 16: the prototype's SVG helpers (ring, arc, curve, spark) and the entrance that fills them.
// They return markup strings, the way the prototype does, so a tab can build its tiles in one go.
// Nothing here runs until a tab calls animateIn(), which only happens when the tab is switched to.

import { h } from '../components/dom'

/** True under prefers-reduced-motion: charts jump straight to their final state. */
export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A ring with a glowing arc. `f` is 0 to 1. `inner` is extra SVG drawn on top (a centre label). */
export function ring(c: string, f: number, size = 46, w = 5, inner = ''): string {
  const r = (size - w) / 2 - 1
  const C = 2 * Math.PI * r
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${c}" stroke-opacity=".2" stroke-width="${w}"/><circle class="anim-ring" data-c="${C}" data-f="${f}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset calc(900ms*var(--slow)) var(--spring);filter:drop-shadow(0 0 4px ${c})"/>${inner}</svg>`
}

/** A curved gauge with a knob that rides the end of the arc. */
export function arc(c: string, f: number, w = 130, hgt = 54): string {
  return `<svg width="${w}" height="${hgt}" viewBox="0 0 130 54" aria-hidden="true"><path d="M10 40 C 40 12, 90 12, 120 34" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="6" stroke-linecap="round"/><path class="anim-arc" data-f="${f}" d="M10 40 C 40 12, 90 12, 120 34" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" style="filter:drop-shadow(0 0 5px ${c})"/><circle class="anim-knob" r="5.5" fill="#fff" style="filter:drop-shadow(0 0 6px #fff)"/></svg>`
}

/** A filled area with a glowing line, stretched to its box. `pts` are [x, y] inside a w x h box. */
export function curve(c: string, pts: [number, number][], w = 135, hgt = 34): string {
  const d = 'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L')
  return `<svg width="100%" height="${hgt}" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" style="position:absolute;left:0;right:0;bottom:0" aria-hidden="true"><path d="${d} L${w} ${hgt} L0 ${hgt}z" fill="${c}" fill-opacity=".14"/><path class="anim-line" d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px ${c})"/></svg>`
}

/** A tiny trend line with a dot on the last value. */
export function spark(c: string, vals: number[]): string {
  const mn = Math.min(...vals) - 3
  const mx = Math.max(...vals) + 2
  const y = (v: number) => 26 - ((v - mn) / (mx - mn)) * 22
  const p = vals.map((v, i) => `${i * 15},${y(v)}`).join(' ')
  return `<svg width="62" height="28" viewBox="0 0 62 28" aria-hidden="true"><polyline class="anim-line" points="${p}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" style="filter:drop-shadow(0 0 3px ${c})"/><circle cx="60" cy="${y(vals[vals.length - 1])}" r="2.5" fill="#fff"/></svg>`
}

/** Markup to one element. */
export function fromHtml(html: string): HTMLElement {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

/** getTotalLength throws on an element that is not drawn yet (not attached, or inside display none). Zero then. */
const lengthOf = (el: SVGGeometryElement): number => { try { return el.getTotalLength() } catch { return 0 } }

const slow = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slow')) || 1
const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)

/** Set a ring to a new fraction in place (the transition on the circle does the rest). */
export function setRing(root: Element, f: number): void {
  const r = root.querySelector<SVGCircleElement>('.anim-ring')
  if (!r) return
  r.dataset.f = String(f)
  r.style.strokeDashoffset = String(Number(r.dataset.c) * (1 - Math.min(1, Math.max(0, f))))
}

/**
 * Fill every chart under `root`. `instant` skips the animation, for a tile that was rebuilt after the entrance (a data
 * refresh must never replay it) and for reduced motion. Bars with data-bar grow to that percentage.
 */
export function animateIn(root: Element, instant = reducedMotion()): void {
  const s = slow()
  root.querySelectorAll<SVGCircleElement>('.anim-ring').forEach((r) => {
    // Read the fraction when it is applied, so a value set in the meantime (a tab filling in) is not overwritten.
    const finalNow = () => Number(r.dataset.c) * (1 - Number(r.dataset.f))
    const final = finalNow()
    if (instant) { r.style.transition = 'none'; r.style.strokeDashoffset = String(final); return }
    r.style.transition = 'none'
    r.style.strokeDashoffset = r.dataset.c ?? '0'
    requestAnimationFrame(() => setTimeout(() => {
      r.style.transition = 'stroke-dashoffset calc(900ms*var(--slow)) var(--spring)'
      r.style.strokeDashoffset = String(finalNow())
    }, 200 * s))
  })
  root.querySelectorAll<SVGPathElement>('.anim-arc').forEach((a) => {
    const L = lengthOf(a)
    if (!L) return
    const f = Number(a.dataset.f)
    const kn = a.parentNode?.querySelector<SVGCircleElement>('.anim-knob')
    a.style.strokeDasharray = String(L)
    const put = (k: number) => {
      a.style.strokeDashoffset = String(L * (1 - f * k))
      const p = a.getPointAtLength(Math.max(0.1, L * f * k))
      kn?.setAttribute('cx', String(p.x)); kn?.setAttribute('cy', String(p.y))
    }
    if (instant) { put(1); return }
    put(0)
    const t0 = performance.now() + 250 * s
    const d = 1000 * s
    const step = (t: number) => { const k = easeOut((t - t0) / d); put(k); if (k < 1) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  })
  root.querySelectorAll<SVGGeometryElement>('.anim-line').forEach((l) => {
    const L = lengthOf(l)
    if (!L) return
    l.style.strokeDasharray = String(L)
    l.style.transition = 'none'
    if (instant) { l.style.strokeDashoffset = '0'; return }
    l.style.strokeDashoffset = String(L)
    requestAnimationFrame(() => setTimeout(() => {
      l.style.transition = 'stroke-dashoffset calc(1000ms*var(--slow)) var(--ease)'
      l.style.strokeDashoffset = '0'
    }, 250 * s))
  })
  root.querySelectorAll<HTMLElement>('[data-bar]').forEach((b) => {
    if (instant) { b.style.transition = 'none'; b.style.width = `${b.dataset.bar}%`; return }
    b.style.width = '0'
    requestAnimationFrame(() => setTimeout(() => { b.style.width = `${b.dataset.bar}%` }, 150 * s))
  })
}

/** Count a number up from 0 to `to`. Reduced motion shows the final value at once. */
export function countUp(to: number, put: (v: number) => void, ms = 900): () => void {
  if (reducedMotion()) { put(to); return () => {} }
  const s = slow()
  const t0 = performance.now() + 200 * s
  const d = ms * s
  let alive = true
  const step = (t: number) => { if (!alive) return; const k = easeOut((t - t0) / d); put(to * k); if (k < 1) requestAnimationFrame(step) }
  requestAnimationFrame(step)
  return () => { alive = false }
}

/**
 * The root every prototype tab sits in. `enter()` replays the pop in (call it when the tab is switched to). It also plays
 * once by itself the first time the tab is on screen, so a host that never calls enter() still shows the tab.
 */
export interface PvRoot extends HTMLDivElement { enter(): void; onEnter?: () => void }
export function pvRoot(cls: string): PvRoot {
  const el = h('div', { class: `pv ${cls}` }) as PvRoot
  let entered = false
  el.enter = () => {
    entered = true
    el.classList.remove('on')
    void el.offsetWidth // restart the transitions
    el.classList.add('on')
    animateIn(el)
    el.onEnter?.()
  }
  requestAnimationFrame(() => { if (!entered) el.enter() })
  return el
}

/** Show a line of help over the panel for a couple of seconds. */
export function tip(root: HTMLElement, text: string): void {
  let t = root.querySelector<HTMLElement>(':scope > .pv-tip')
  if (!t) { t = h('div', { class: 'pv-tip', role: 'status' }); root.append(t) }
  t.textContent = text
  t.classList.add('show')
  const el = t
  clearTimeout((el as unknown as { _t?: number })._t)
  ;(el as unknown as { _t?: number })._t = window.setTimeout(() => el.classList.remove('show'), 2400)
}
