import '../styles/embed.css'
import { h } from './dom'
import { Icon } from './Icon'
import { NumberRoll } from './NumberRoll'
import type { IslandHandle } from './Island'
import { TOP_MAX, TOP_STEP, embedTop, setEmbedTop } from '../lib/embed'

// Embedded shell (HALO.md 1, v1 inside NotchPixel). No island body, ears, key line or glow: a pure black
// page with the tab bar on top and the panel under it, edge to edge. It answers to the same handle as
// Island so home.ts can drive either one, and it is always "expanded".

export interface EmbedShellOptions {
  /** Signs out. Shown in the settings popover because the usual footer note would cover the panel. */
  onSignOut?: () => void
}
export interface EmbedShellHandle extends IslandHandle {
  bar: HTMLDivElement
  body: HTMLDivElement
  toggleSettings(open?: boolean): void
}

export function EmbedShell(o: EmbedShellOptions = {}): EmbedShellHandle {
  const root = h('div', { class: 'embed-root', 'data-state': 'expanded' }) as unknown as EmbedShellHandle
  const bar = h('div', { class: 'embed-bar' })
  const body = h('div', { class: 'embed-body' })
  root.append(bar, body)
  root.bar = bar
  root.body = body

  // ---- Settings popover: top padding
  let top = embedTop()
  document.documentElement.style.setProperty('--embed-top', `${top}px`)
  const roll = NumberRoll({ value: String(top), label: 'Top padding' })
  const dec = h('button', { type: 'button', class: 'h-ibtn', 'aria-label': 'Less top padding' }, Icon('caret-left', 'fill', 22))
  const inc = h('button', { type: 'button', class: 'h-ibtn', 'aria-label': 'More top padding' }, Icon('caret-right', 'fill', 22))
  const apply = (n: number) => {
    top = setEmbedTop(n)
    roll.set(String(top))
    dec.disabled = top <= 0
    inc.disabled = top >= TOP_MAX
  }
  dec.addEventListener('click', () => apply(top - TOP_STEP))
  inc.addEventListener('click', () => apply(top + TOP_STEP))
  apply(top)
  const pop = h('div', { class: 'embed-pop', role: 'dialog', 'aria-label': 'Halo settings', hidden: true },
    h('div', { class: 'embed-pop-row' },
      h('div', { class: 'embed-pop-text' }, h('span', { class: 'embed-pop-t' }, 'Top padding'), h('span', { class: 'embed-pop-s' }, 'Space above the tabs')),
      h('div', { class: 'embed-step' }, dec, h('span', { class: 'embed-val' }, roll, h('small', {}, 'px')), inc)),
    o.onSignOut ? h('button', { type: 'button', class: 'h-btn embed-out', onclick: () => o.onSignOut?.() }, 'Sign out') : null)
  root.append(pop)

  root.toggleSettings = (open) => {
    const next = open ?? pop.hidden
    pop.hidden = !next
    root.classList.toggle('is-settings', next)
    if (next) (pop.querySelector('button:not(:disabled)') as HTMLElement | null)?.focus()
  }
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Element
    if (!pop.hidden && !pop.contains(t) && !t.closest('[data-settings]')) root.toggleSettings(false)
  })
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') root.toggleSettings(false) })

  // ---- Size classes, so the CSS can pick compact layouts for the bar and the padding
  const size = () => {
    const w = root.clientWidth
    const hh = root.clientHeight
    root.classList.toggle('is-short', hh < 360)
    root.classList.toggle('is-tiny', hh < 280 || w < 480)
    root.classList.toggle('is-narrow', w < 560)
  }
  new ResizeObserver(size).observe(root)

  // ---- The parts of IslandHandle that home.ts calls. The shell has no shape, springs or glow.
  const nop = () => {}
  Object.defineProperty(root, 'state', { get: () => 'expanded' })
  Object.assign(root, { setState: nop, open: nop, close: nop, alert: nop, setContent: nop, swapContent: nop, setExpandedHeight: nop, setTint: nop, setColours: nop, setPulse: nop, setDisabled: nop })
  return root
}
