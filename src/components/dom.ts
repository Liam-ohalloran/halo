// Tiny DOM helper shared by every component.

type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, String(v))
  }
  for (const kid of kids) if (kid) el.append(kid)
  return el
}

export function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Parse #rgb or #rrggbb into 0 to 1 floats for shaders. */
export function hexToRgb(hex: string): [number, number, number] {
  let s = hex.trim().replace('#', '')
  if (s.length === 3) s = [...s].map((c) => c + c).join('')
  const n = parseInt(s, 16)
  if (Number.isNaN(n) || s.length !== 6) return [1, 1, 1]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

let uid = 0
export const nextId = (p: string): string => `${p}-${++uid}`
