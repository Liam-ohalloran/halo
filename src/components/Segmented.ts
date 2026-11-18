import { h } from './dom'
import { Icon } from './Icon'

// Segmented control: a pill with a selection that slides on a spring. Arrow keys move the selection.

export interface SegmentOption { label: string; icon?: string }
export interface SegmentedOptions {
  options: (string | SegmentOption)[]
  selected?: number
  label: string
  disabled?: boolean
  onChange?: (index: number) => void
}
export interface SegmentedHandle extends HTMLDivElement { select(i: number, emit?: boolean): void; readonly index: number; buttons: HTMLButtonElement[] }

export function Segmented(o: SegmentedOptions): SegmentedHandle {
  let cur = o.selected ?? 0
  const el = h('div', { class: 'h-seg', role: 'tablist', 'aria-label': o.label }) as SegmentedHandle
  const ind = h('span', { class: 'h-seg-ind', 'aria-hidden': 'true' })
  const buttons = o.options.map((opt, i) => {
    const d = typeof opt === 'string' ? { label: opt } : opt
    const b = h('button', { type: 'button', role: 'tab', disabled: !!o.disabled })
    if (d.icon) b.append(Icon(d.icon, 'fill', 18))
    b.append(d.label)
    b.addEventListener('click', () => select(i, true))
    return b
  })
  el.append(ind, ...buttons)
  el.buttons = buttons

  const place = () => {
    buttons.forEach((b, i) => { b.setAttribute('aria-selected', String(i === cur)); b.tabIndex = i === cur ? 0 : -1 })
    const b = buttons[cur]
    if (!b || !b.offsetWidth) return
    ind.style.width = `${b.offsetWidth}px`
    ind.style.transform = `translateX(${b.offsetLeft}px)`
  }
  function select(i: number, emit = false) {
    cur = Math.max(0, Math.min(buttons.length - 1, i))
    place()
    if (emit) o.onChange?.(cur)
  }
  el.select = select
  Object.defineProperty(el, 'index', { get: () => cur })
  el.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    select((cur + step + buttons.length) % buttons.length, true)
    buttons[cur].focus()
  })
  // Place once attached and whenever the width changes (fonts, window resize).
  const ro = new ResizeObserver(place)
  ro.observe(el)
  place()
  document.fonts?.ready.then(place)
  return el
}
