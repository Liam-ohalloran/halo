import { h } from './dom'

// Skeleton: loading is a shimmer, never a spinner (HALO.md 3.6). The shimmer is a transform on a
// pseudo element, so it stays cheap. It goes static under Reduce motion and while the tab is hidden.

export interface SkeletonOptions { width?: number | string; height?: number; radius?: number; circle?: boolean }

const px = (v: number | string) => (typeof v === 'number' ? `${v}px` : v)

export function Skeleton(o: SkeletonOptions = {}): HTMLSpanElement {
  const el = h('span', { class: 'h-skel', 'aria-hidden': 'true' })
  const hgt = o.height ?? 16
  el.style.width = px(o.circle ? hgt : (o.width ?? '100%'))
  el.style.height = `${hgt}px`
  el.style.borderRadius = o.circle ? '50%' : `${o.radius ?? Math.min(8, hgt / 2)}px`
  return el
}

/** A few text lines, the last one shorter. */
export function SkeletonText(lines = 3, lineHeight = 13): HTMLDivElement {
  const wrap = h('div', { class: 'h-skel-text', role: 'status', 'aria-label': 'Loading' })
  for (let i = 0; i < lines; i++) wrap.append(Skeleton({ height: lineHeight, width: i === lines - 1 ? '60%' : '100%' }))
  return wrap
}
