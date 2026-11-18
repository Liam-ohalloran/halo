import { h } from './dom'
import { Icon } from './Icon'

// Button (36 or 44) and IconButton (44 hit area, 22 icon). HALO.md 3.4.
// States are real CSS: rest, :hover, :active (scale 0.96 spring), :focus-visible, :disabled.

export interface ButtonOptions {
  label: string
  kind?: 'primary' | 'secondary' | 'tinted'
  size?: 36 | 44
  icon?: string
  /** Content colour for the tinted kind, e.g. '#FF9F0A'. */
  colour?: string
  disabled?: boolean
  onClick?: (e: MouseEvent) => void
}
export interface ButtonHandle extends HTMLButtonElement { setLabel(t: string): void }

export function Button(o: ButtonOptions): ButtonHandle {
  const el = h('button', { type: 'button', class: `h-btn ${o.kind ?? 'secondary'}${o.size === 44 ? ' lg' : ''}`, disabled: !!o.disabled }) as ButtonHandle
  if (o.colour) el.style.setProperty('--c', o.colour)
  const text = h('span', {}, o.label)
  if (o.icon) el.append(Icon(o.icon, 'fill', 18))
  el.append(text)
  if (o.onClick) el.addEventListener('click', o.onClick)
  el.setLabel = (t) => { text.textContent = t }
  return el
}

export interface IconButtonOptions {
  icon: string
  /** Accessible name. Required because there is no visible text. */
  label: string
  weight?: 'regular' | 'fill'
  disabled?: boolean
  onClick?: (e: MouseEvent) => void
}
export interface IconButtonHandle extends HTMLButtonElement { setIcon(name: string, weight?: 'regular' | 'fill'): void }

export function IconButton(o: IconButtonOptions): IconButtonHandle {
  const el = h('button', { type: 'button', class: 'h-ibtn', 'aria-label': o.label, disabled: !!o.disabled }) as IconButtonHandle
  const ic = Icon(o.icon, o.weight ?? 'fill', 22)
  el.append(ic)
  if (o.onClick) el.addEventListener('click', o.onClick)
  el.setIcon = (n, w = o.weight ?? 'fill') => ic.set(n, w)
  return el
}
