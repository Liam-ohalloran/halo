import '../styles/shell.css'
import { h } from './dom'
import { tabMeta } from '../lib/shell-meta'
import { RAIL, RAIL_ICONS, TAB_THEMES, type TabId, type TabTheme } from '../styles/tabs'

// Shell (card 15): the 600 x 290 panel every tab sits in, copied from the Home2 board.
// Header: title and a small grey line on the left, the icon rail on the right. Under it the tab's panel.
// Each tab has its own tinted frame and corner glow (src/styles/tabs.ts). Switching tabs crossfades the frame
// and the panel in 180 ms. Tabs that are not built yet show an empty panel in their colour that says "Coming soon".

export const SHELL_W = 600
export const SHELL_H = 290
export const FADE_MS = 180

export interface ShellHost extends HTMLDivElement {
  /** Show a panel, fading the old one out. Returns nothing: the host has a fixed size. */
  show(panel: HTMLElement, dir?: number): void
}
export interface ShellOptions {
  active: TabId
  now?: () => Date
  /** Fired when the user picks a tab (click, tap or arrow keys). */
  onChange?: (id: TabId, from: TabId) => void
}
export interface ShellHandle {
  el: HTMLElement
  host: ShellHost
  readonly active: TabId
  setActive(id: TabId, emit?: boolean): void
  /** Redraw the grey line next to the title (the clock moved on, for example). */
  refreshMeta(): void
  /** The panel shown for a tab that is not built yet. */
  soon(id: TabId): HTMLElement
}

const style = (el: HTMLElement, css: string) => { el.setAttribute('style', css); return el }

function railIcon(id: TabId, active: boolean): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const [k, v] of Object.entries({ width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': active ? '2.2' : '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v)
  s.innerHTML = RAIL_ICONS[id]
  return s
}

export function Shell(o: ShellOptions): ShellHandle {
  const clock = o.now ?? (() => new Date())
  let active = o.active

  // ---- Frame and skins. One skin per tab, stacked: the active one is opaque, the rest fade out and stop painting.
  const el = h('div', { class: 'sh', role: 'region', 'aria-label': 'Halo' })
  const skins = new Map<TabId, HTMLElement>()
  for (const t of Object.values(TAB_THEMES)) {
    const skin = h('div', { class: 'sh-skin', 'aria-hidden': 'true' })
    skin.style.background = t.bg
    const glow = style(h('span', { class: 'sh-glow' }), t.glow)
    skin.append(glow, ...t.layers.map((css) => style(h('span', { class: 'sh-layer' }), css)))
    skins.set(t.id, skin)
  }

  // ---- Header
  const title = h('h1', { class: 'sh-title' })
  const meta = h('span', { class: 'sh-meta' })
  const rail = h('nav', { class: 'sh-rail', role: 'tablist', 'aria-label': 'Halo sections', 'aria-orientation': 'horizontal' })
  const buttons = new Map<TabId, HTMLButtonElement>()
  for (const id of RAIL) {
    if (id === null) { rail.append(h('span', { class: 'sh-div', 'aria-hidden': 'true' })); continue }
    const t = TAB_THEMES[id]
    const b = h('button', { type: 'button', class: 'sh-tab', role: 'tab', id: `sh-tab-${id}`, 'aria-label': t.aria, title: t.label, 'aria-controls': 'sh-body', onclick: () => setActive(id, true) })
    b.style.setProperty('--rail', t.rail)
    b.style.setProperty('--tab', t.colour)
    b.append(railIcon(id, false))
    buttons.set(id, b)
    rail.append(b)
  }
  rail.addEventListener('keydown', (e) => {
    const ids = [...buttons.keys()]
    const i = ids.indexOf(active)
    const to = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i + ids.length - 1) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : null
    if (!to) return
    e.preventDefault()
    setActive(to, true)
    buttons.get(to)!.focus()
  })
  const header = h('header', { class: 'sh-head' }, h('div', { class: 'sh-lead' }, title, meta), rail)

  // ---- Body: panels crossfade. A panel is kept after it fades out and shown again later, so no animation may
  // outlive its switch: a fade that held opacity 0 once pinned a panel invisible (the old opacity 0 bug).
  const host = h('div', { class: 'sh-body', id: 'sh-body', role: 'tabpanel' }) as ShellHost
  let current: HTMLElement | null = null
  const clear = (p: HTMLElement) => { for (const a of p.getAnimations()) a.cancel() }
  host.show = (panel) => {
    const old = current
    for (const c of [...host.children] as HTMLElement[]) if (c !== panel && c !== old) { clear(c); c.remove() }
    clear(panel)
    panel.style.pointerEvents = ''
    panel.classList.add('h-panel')
    host.append(panel)
    if (old && old !== panel) {
      clear(old)
      old.style.pointerEvents = 'none'
      const out = old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease', fill: 'forwards' })
      out.onfinish = () => { out.cancel(); if (current !== old) old.remove() }
      const inn = panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease', fill: 'backwards' })
      inn.onfinish = () => inn.cancel() // back to the plain CSS state: opacity 1
    }
    current = panel
  }

  el.append(...skins.values(), header, host)

  // ---- Coming soon panels, one per tab, made on demand
  const soonPanels = new Map<TabId, HTMLElement>()
  const soon = (id: TabId): HTMLElement => {
    let p = soonPanels.get(id)
    if (!p) {
      p = h('div', { class: 'sh-soon', 'data-tab': id }, h('span', { class: 'sh-soon-t' }, 'Coming soon'))
      p.style.setProperty('--tab', TAB_THEMES[id].colour)
      soonPanels.set(id, p)
    }
    return p
  }

  function apply(t: TabTheme) {
    el.dataset.tab = t.id
    el.style.setProperty('--sh-border', t.border)
    el.style.setProperty('--sh-text', t.text)
    el.style.setProperty('--sh-pt', `${t.pad[0]}px`)
    el.style.setProperty('--sh-pr', `${t.pad[1]}px`)
    el.style.setProperty('--sh-pb', `${t.pad[2]}px`)
    el.style.setProperty('--sh-pl', `${t.pad[3]}px`)
    title.textContent = t.label
    for (const [id, skin] of skins) skin.classList.toggle('is-on', id === t.id)
    for (const [id, b] of buttons) {
      const on = id === t.id
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current')
      b.replaceChildren(railIcon(id, on))
    }
    host.setAttribute('aria-labelledby', `sh-tab-${t.id}`)
  }

  function refreshMeta() {
    const next = tabMeta(active, clock())
    if (meta.textContent !== next) meta.textContent = next
    meta.hidden = !next
  }

  function setActive(id: TabId, emit = false) {
    if (id === active && el.dataset.tab) return
    const from = active
    active = id
    apply(TAB_THEMES[id])
    refreshMeta()
    if (emit) o.onChange?.(id, from)
  }

  apply(TAB_THEMES[active])
  refreshMeta()

  return { el, host, get active() { return active }, setActive, refreshMeta, soon }
}
