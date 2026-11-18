import { h, svg, clamp } from './dom'

// RingProgress for the shift countdown and study timer. Value 0 to 1, animates when it changes.
// The stroke offset transitions in CSS, so it follows slow motion and Reduce motion with the rest.

export interface RingOptions {
  size?: number
  stroke?: number
  /** Content colour, e.g. '#FF9F0A'. */
  colour?: string
  value: number
  /** Optional centre text, 15/700 tabular. */
  text?: string
  label: string
}
export interface RingHandle extends HTMLDivElement { setValue(v: number, text?: string): void }

export function RingProgress(o: RingOptions): RingHandle {
  const size = o.size ?? 64
  const stroke = o.stroke ?? 6
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  const mk = (cls: string) => svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, class: cls })
  const fg = mk('h-ring-fg')
  fg.setAttribute('stroke-dasharray', String(C))
  const set = (v: number) => fg.setAttribute('stroke-dashoffset', String(C * (1 - clamp(v, 0, 1))))
  set(0) // start empty so the first value animates in
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' })
  s.append(mk('h-ring-bg'), fg)
  const txt = h('span', { class: 'h-ring-txt' }, o.text ?? '')
  const el = h('div', { class: 'h-ring', role: 'progressbar', 'aria-label': o.label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(clamp(o.value, 0, 1) * 100) }, s, txt) as RingHandle
  if (o.colour) el.style.setProperty('--c', o.colour)
  requestAnimationFrame(() => requestAnimationFrame(() => set(o.value)))
  el.setValue = (v, t) => {
    set(v)
    el.setAttribute('aria-valuenow', String(Math.round(clamp(v, 0, 1) * 100)))
    if (t != null) txt.textContent = t
  }
  return el
}
