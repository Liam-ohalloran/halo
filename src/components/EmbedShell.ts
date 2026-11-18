import '../styles/embed.css'
import { h } from './dom'
import { NumberRoll } from './NumberRoll'
import { Icon } from './Icon'
import type { IslandHandle } from './Island'
import { SHELL_H, SHELL_W } from './Shell'
import { TOP_MAX, TOP_STEP, embedTop, setEmbedTop } from '../lib/embed'

// Embedded mode (HALO.md 3.9, v1 inside NotchPixel's web tab): NotchPixel is already the island, so Halo draws no
// island, ears, key line or glow of its own. Since card 15 the page is a pure black field with the 600 x 290 shell
// panel on it, centred at the top and scaled down only if the window is smaller than the panel. It answers to the
// same handle as Island so home.ts can drive either one.

export interface EmbedShellHandle extends IslandHandle {
  /** Where the 600 x 290 panel goes. */
  panelSlot: HTMLDivElement
}

export function EmbedShell(): EmbedShellHandle {
  const root = h('div', { class: 'embed-root', 'data-state': 'expanded' }) as unknown as EmbedShellHandle
  const slot = h('div', { class: 'embed-slot' })
  root.append(slot)
  root.panelSlot = slot

  document.documentElement.style.setProperty('--embed-top', `${embedTop()}px`)

  // Scale to fit: the panel is a fixed 600 x 290, so a smaller window shrinks it instead of cutting it off.
  const fit = () => {
    const top = parseFloat(getComputedStyle(root).paddingTop) || 0
    const s = Math.min(1, root.clientWidth / SHELL_W, Math.max(root.clientHeight - top, 1) / SHELL_H)
    slot.style.transform = s < 1 ? `scale(${s})` : ''
  }
  new ResizeObserver(fit).observe(root)

  // The parts of IslandHandle that home.ts calls. The embedded page has no shape, springs or glow.
  const nop = () => {}
  Object.defineProperty(root, 'state', { get: () => 'expanded' })
  Object.assign(root, { setState: nop, open: nop, close: nop, alert: nop, setContent: nop, swapContent: nop, setExpandedHeight: nop, setTint: nop, setColours: nop, setPulse: nop, setDisabled: nop })
  return root
}

/** Top padding and sign out for the embedded page. They used to sit behind a gear in the tab bar. Until card 23 gives
 *  More its own settings, they live on the More tab. */
export function EmbedSettings(o: { onSignOut?: () => void } = {}): HTMLElement {
  let top = embedTop()
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
  return h('div', { class: 'embed-set' },
    h('span', { class: 'embed-set-t' }, 'Top padding'),
    h('div', { class: 'embed-step' }, dec, h('span', { class: 'embed-val' }, roll, h('small', {}, 'px')), inc),
    o.onSignOut ? h('button', { type: 'button', class: 'h-btn embed-out', onclick: () => o.onSignOut?.() }, 'Sign out') : null)
}
