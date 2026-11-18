import { h } from './dom'

// Phosphor icon by name and weight. SVGs live in public/icons (regular: name.svg, fill: name-fill.svg),
// are fetched once, cached and inlined so they take currentColor.

export type IconWeight = 'regular' | 'fill'

const base = import.meta.env.BASE_URL
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

function load(file: string): Promise<string> {
  const hit = cache.get(file)
  if (hit != null) return Promise.resolve(hit)
  let p = inflight.get(file)
  if (!p) {
    p = fetch(`${base}icons/${file}.svg`)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
      .then((t) => { cache.set(file, t); inflight.delete(file); return t })
    inflight.set(file, p)
  }
  return p
}
const fileName = (name: string, weight: IconWeight) => (weight === 'fill' ? `${name}-fill` : name)

export interface IconHandle extends HTMLSpanElement {
  set(name: string, weight?: IconWeight): void
}

export function Icon(name: string, weight: IconWeight = 'regular', size = 22): IconHandle {
  const el = h('span', { class: 'h-icon', 'aria-hidden': 'true' }) as IconHandle
  el.style.setProperty('--sz', `${size}px`)
  let token = 0
  el.set = (n, w = weight) => {
    const file = fileName(n, w)
    const mine = ++token
    const hit = cache.get(file)
    if (hit != null) { el.innerHTML = hit; return }
    load(file).then((t) => { if (mine === token) el.innerHTML = t })
  }
  el.set(name, weight)
  return el
}

/** Warm the cache so first paint has no empty boxes. */
export function preloadIcons(names: string[], weights: IconWeight[] = ['regular', 'fill']): Promise<unknown> {
  return Promise.all(names.flatMap((n) => weights.map((w) => load(fileName(n, w)))))
}
