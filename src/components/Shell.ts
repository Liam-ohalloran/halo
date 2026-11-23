import '../styles/shell.css'
import { h } from './dom'
import { clockPm } from '../lib/night'
import { moveTab, normalisePrefs, toggleHidden, visibleIds, PINNED, type TabPrefs } from '../lib/tabprefs'
import { DEFAULT_ORDER, RAIL_ICONS, TAB_THEMES, type TabId, type TabTheme } from '../styles/tabs'

// Shell (cards 15 and 15b): the island IS the window. One element pinned top centre, flat top edge on the top of the
// screen, ears at both top corners, black base. Collapsed it is the island (200 x 34). A click, or a hover for 300 ms,
// grows it into the 600 x 290 tab window, with the tab's tint and corner glow layered over the black. Click outside,
// Escape, or moving away for 1 s shrinks it back. The content fades in only after the size settles and fades out
// first when closing (shell.css has the timings).
// Header (card 23): the prototype's top bar. One glass pill of tab icons, the open tab grows into a white pill with its label,
// the time on the right. Arrow keys step through the tabs. A long press on the bar, or the pencil, edits the order and hides tabs.
// Under it the tab's panel.
// Switching tabs crossfades the frame and the panel in 180 ms. Tabs that are not built yet say "Coming soon".

export const SHELL_W = 600
export const SHELL_H = 290
export const FADE_MS = 180
/** Collapsed sizes (HALO.md 3.3). The island grows from one of these into 600 x 290. */
export type CollapsedState = 'resting' | 'compact' | 'wide'
export const COLLAPSED: Record<CollapsedState, { w: number; h: number; r: number }> = {
  resting: { w: 200, h: 34, r: 17 },
  compact: { w: 300, h: 40, r: 20 },
  wide: { w: 400, h: 40, r: 20 },
}
export const HOVER_OPEN_MS = 300
export const LEAVE_CLOSE_MS = 1000

export interface ShellHost extends HTMLDivElement {
  /** Show a panel, fading the old one out. Returns nothing: the host has a fixed size. */
  show(panel: HTMLElement, dir?: number): void
}
export interface ShellOptions {
  active: TabId
  now?: () => Date
  /** Fired when the user picks a tab (click, tap or arrow keys). */
  onChange?: (id: TabId, from: TabId) => void
  /** Start grown into the window. Default false: the island. */
  open?: boolean
  /** Hover opens and leaving or clicking outside closes. Off in the embedded page, where the window is always shown. */
  auto?: boolean
  /** Fired when it opens or closes. */
  onToggle?: (open: boolean) => void
  /** Saved tab order and hidden tabs (from the settings row). */
  prefs?: unknown
  /** Fired when Liam hides, shows or moves a tab, so it can be saved. */
  onPrefs?: (p: TabPrefs) => void
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
  readonly isOpen: boolean
  open(): void
  close(): void
  /** What the island shows while it is closed (the live pills). */
  pill: HTMLElement
  setCollapsed(s: CollapsedState): void
  readonly collapsed: CollapsedState
  /** Key line colour of the closed island, from its content. */
  setKey(hex: string): void
  /** Unread alerts. Above zero, the resting island shows a small gold dot (card 20, card 17 restyles it). */
  setUnread(n: number): void
  /** Apply a saved order and hidden list, for example when the settings row arrives. */
  setPrefs(p: unknown): void
  readonly prefs: TabPrefs
  /** Edit mode: pick tabs to hide and move them. */
  edit(on: boolean): void
  readonly editing: boolean
  /** The closed island's live layer (card 17). It sits over the pill and only its buttons take clicks. */
  live: HTMLElement
  /**
   * Size of the closed island (card 17). `live` animates 380 ms, `hud` 420 ms with a spring, `banner` 520 ms with the open spring (card 18), `snap` doesn't animate.
   * It only moves the closed island: opening still grows to 600 x 290.
   */
  setSize(s: { w: number; h: number; r: number }, how?: 'live' | 'hud' | 'banner' | 'snap'): void
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
  const el = h('div', { class: 'sh', role: 'region', 'aria-label': 'Halo', 'data-open': 'false' })
  // The clip is the only element with overflow hidden. The ears hang off `el`, outside it.
  const clip = h('div', { class: 'sh-clip' })
  const skinsEl = h('div', { class: 'sh-skins', 'aria-hidden': 'true' })
  const inner = h('div', { class: 'sh-inner' })
  const pill = h('button', { type: 'button', class: 'sh-pill', 'aria-label': 'Open Halo', 'aria-expanded': 'false', 'aria-controls': 'sh-body' }) as HTMLButtonElement
  const live = h('div', { class: 'sh-live' })
  const skins = new Map<TabId, HTMLElement>()
  let skinZ = 0
  for (const t of Object.values(TAB_THEMES)) {
    const skin = h('div', { class: 'sh-skin', 'aria-hidden': 'true' })
    skin.style.background = t.bg
    const glow = style(h('span', { class: 'sh-glow' }), t.glow)
    skin.append(glow, ...t.layers.map((css) => style(h('span', { class: 'sh-layer' }), css)))
    skins.set(t.id, skin)
  }

  // ---- Header: the top bar
  const PEN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'
  const sel = h('i', { class: 'sh-sel', 'aria-hidden': 'true' })
  const rail = h('nav', { class: 'sh-rail', role: 'tablist', 'aria-label': 'Halo sections', 'aria-orientation': 'horizontal' }, sel)
  const time = h('span', { class: 'sh-time' })
  const pen = h('button', { type: 'button', class: 'sh-pen', 'aria-label': 'Edit tabs', title: 'Edit tabs', onclick: () => edit(!editing) })
  pen.innerHTML = PEN
  const buttons = new Map<TabId, HTMLButtonElement>()
  for (const id of DEFAULT_ORDER) {
    const t = TAB_THEMES[id]
    const b = h('button', { type: 'button', class: 'sh-tab', role: 'tab', id: `sh-tab-${id}`, 'aria-label': t.aria, title: t.label, 'aria-controls': 'sh-body', onclick: () => setActive(id, true) }, h('span', { class: 'lb' }, t.label))
    b.prepend(railIcon(id, false))
    buttons.set(id, b)
  }
  let prefs: TabPrefs = normalisePrefs(o.prefs, DEFAULT_ORDER)
  const shown = (): TabId[] => visibleIds(prefs) as TabId[]
  function placeSel() {
    const b = buttons.get(active)
    if (!b || !b.isConnected || !b.offsetWidth) return
    sel.style.left = `${b.offsetLeft}px`
    sel.style.width = `${b.offsetWidth}px`
  }
  /** Put the visible tabs in the bar in order. The tab buttons are kept, only moved or taken out. */
  function layoutBar() {
    for (const id of DEFAULT_ORDER) if (!shown().includes(id)) buttons.get(id)!.remove()
    for (const id of shown()) rail.append(buttons.get(id)!)
    requestAnimationFrame(placeSel)
  }
  rail.addEventListener('keydown', (e) => {
    const ids = shown()
    const to = e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : null
    if (!to) return
    e.preventDefault()
    setActive(to, true)
    buttons.get(to)!.focus()
  })
  const header = h('header', { class: 'sh-head' }, h('div', { class: 'sh-seg' }, rail), h('div', { class: 'sh-rt' }, time, pen))

  // ---- Body: switching tabs swaps panels. Nothing fades and nothing is rebuilt (HALO.md: no flash on interaction).
  // A panel is built the first time its tab is shown and then stays mounted. The one that is not showing is only hidden
  // (display none), so it is not taken out of the page and put back, and no two panels are ever on screen half faded at
  // once, which is what made fast tab switching flicker. The tab's own entrance animation (tiles popping in) is played by
  // the caller after show().
  const host = h('div', { class: 'sh-body', id: 'sh-body', role: 'tabpanel' }) as ShellHost
  let current: HTMLElement | null = null
  host.show = (panel) => {
    const old = current
    panel.classList.add('h-panel')
    panel.classList.remove('h-off')
    if (panel.parentElement !== host) host.append(panel)
    if (old && old !== panel) old.classList.add('h-off')
    current = panel
  }

  skinsEl.append(...skins.values())
  const editEl = h('div', { class: 'sh-edit', role: 'dialog', 'aria-label': 'Edit tabs' })
  editEl.hidden = true
  inner.append(header, host, editEl)
  const dot = h('span', { class: 'sh-dot', 'aria-hidden': 'true' })
  clip.append(skinsEl, pill, live, dot, inner)
  el.append(clip)

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
    el.style.setProperty('--glow', t.shadow ?? t.colour)
    el.style.setProperty('--sh-border', t.border)
    el.style.setProperty('--sh-text', t.text)
    inner.style.setProperty('--sh-pt', `${t.pad[0]}px`)
    inner.style.setProperty('--sh-pr', `${t.pad[1]}px`)
    inner.style.setProperty('--sh-pb', `${t.pad[2]}px`)
    inner.style.setProperty('--sh-pl', `${t.pad[3]}px`)
    // The skin coming in goes on top and fades in over the one leaving, which stays solid until it is covered. Fading
    // one out while the other fades in dips through the black base for a moment.
    for (const [id, skin] of skins) {
      const on = id === t.id
      if (on && !skin.classList.contains('is-on')) skin.style.zIndex = String(++skinZ)
      skin.classList.toggle('is-on', on)
    }
    for (const [id, b] of buttons) {
      const on = id === t.id
      b.classList.toggle('on', on)
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current')
      b.querySelector('svg')!.replaceWith(railIcon(id, on))
    }
    requestAnimationFrame(placeSel)
    host.setAttribute('aria-labelledby', `sh-tab-${t.id}`)
  }

  function refreshMeta() {
    const next = clockPm(clock())
    if (time.textContent !== next) time.textContent = next
  }

  function setActive(id: TabId, emit = false) {
    if (id === active && el.dataset.tab) return
    const from = active
    active = id
    apply(TAB_THEMES[id])
    refreshMeta()
    if (emit) o.onChange?.(id, from)
  }

  // ---- Edit mode (card 23): hide, show and move tabs. Saved through onPrefs, so the phone picks it up too.
  let editing = false
  const eye = (off: boolean) => off
    ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><path d="M4 4l16 16"/></svg>'
    : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/></svg>'
  const chev = (d: 'l' | 'r') => `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`
  function paintEdit(focus?: string) {
    editEl.innerHTML = `<div class="ehd"><div><b>Edit tabs</b><span>Hide a tab or move it. Saved on all your devices.</span></div><button type="button" class="ebtn" data-e="reset">Reset</button><button type="button" class="ebtn go" data-e="done">Done</button></div>
      <div class="egrid">${prefs.order.map((id, i) => {
        const t = TAB_THEMES[id as TabId]
        const off = prefs.hidden.includes(id)
        const pinned = PINNED.includes(id)
        return `<div class="ec${off ? ' off' : ''}" data-id="${id}"><div class="et"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RAIL_ICONS[id as TabId]}</svg><b>${t.label}</b></div>
          <div class="ea"><button type="button" data-a="l" aria-label="Move ${t.label} earlier"${i === 0 ? ' disabled' : ''}>${chev('l')}</button><button type="button" data-a="eye" aria-pressed="${!off}" aria-label="${off ? 'Show' : 'Hide'} ${t.label}"${pinned ? ' disabled title="Always shown"' : ''}>${eye(off)}</button><button type="button" data-a="r" aria-label="Move ${t.label} later"${i === prefs.order.length - 1 ? ' disabled' : ''}>${chev('r')}</button></div></div>`
      }).join('')}</div>`
    if (focus) editEl.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true })
  }
  function commit(next: TabPrefs, focus?: string) {
    prefs = next
    layoutBar()
    if (!shown().includes(active)) setActive('home', true)
    o.onPrefs?.(prefs)
    paintEdit(focus)
  }
  function edit(on: boolean) {
    if (on === editing) return
    editing = on
    editEl.hidden = !on
    host.toggleAttribute('inert', on)
    host.style.visibility = on ? 'hidden' : ''
    pen.setAttribute('aria-pressed', String(on))
    if (on) { paintEdit('[data-e="done"]') } else { editEl.replaceChildren(); buttons.get(active)?.focus({ preventScroll: true }) }
  }
  editEl.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-e="done"]')) return edit(false)
    if (t.closest('[data-e="reset"]')) return commit(normalisePrefs(null, DEFAULT_ORDER), '[data-e="reset"]')
    const b = t.closest<HTMLButtonElement>('[data-a]')
    const id = b?.closest<HTMLElement>('[data-id]')?.dataset.id
    if (!b || !id) return
    const a = b.dataset.a
    commit(a === 'eye' ? toggleHidden(prefs, id) : moveTab(prefs, id, a === 'l' ? -1 : 1), `[data-id="${id}"] [data-a="${a}"]`)
  })
  editEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); edit(false) } })
  // A long press on the bar does the same as the pencil.
  let pressT = 0
  let pressAt = [0, 0]
  rail.addEventListener('pointerdown', (e) => { pressAt = [e.clientX, e.clientY]; clearTimeout(pressT); pressT = window.setTimeout(() => { if (isOpen) edit(true) }, 550) })
  const cancelPress = () => clearTimeout(pressT)
  rail.addEventListener('pointerup', cancelPress); rail.addEventListener('pointerleave', cancelPress); rail.addEventListener('pointercancel', cancelPress)
  rail.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 6) cancelPress() })
  // Arrow keys step through the open tabs, unless the keys are being used to type or pick a date.
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented || !el.isConnected || !isOpen || editing || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, select, [contenteditable="true"], .sheet')) return
    const ids = shown()
    const i = ids.indexOf(active)
    const to = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]
    e.preventDefault()
    setActive(to, true)
    buttons.get(to)?.focus({ preventScroll: true })
  })

  // ---- Island <-> window. The CSS does the animation off data-open, this is only input and state.
  const auto = o.auto !== false
  let isOpen = false
  let collapsed: CollapsedState = 'resting'
  let hoverT = 0
  let leaveT = 0
  const setOpen = (v: boolean) => {
    clearTimeout(hoverT); clearTimeout(leaveT)
    if (v === isOpen) return
    isOpen = v
    el.dataset.open = String(v)
    delete el.dataset.size // the next size change after a close starts from a settled island
    pill.setAttribute('aria-expanded', String(v))
    inner.toggleAttribute('inert', !v)
    pill.tabIndex = v ? -1 : 0
    if (!v) edit(false)
    if (v) requestAnimationFrame(() => { placeSel(); buttons.get(active)?.focus({ preventScroll: true }) })
    else if (inner.contains(document.activeElement)) pill.focus({ preventScroll: true })
    o.onToggle?.(v)
  }
  const open = () => setOpen(true)
  const close = () => setOpen(false)
  pill.addEventListener('click', open)
  // Card 18: resting on a notification banner holds it open, and resting on the stack of pills under the island fans it
  // out. Neither should pull the window open, so hover only opens when it is on the island itself.
  const hoverOpen = () => { if (el.dataset.live === 'banner' || el.querySelector('.nst:hover')) return; open() }
  if (auto) {
    // Hover for 300 ms opens. Moving away for 1 s closes, and coming back in time cancels it.
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return
      clearTimeout(leaveT)
      if (!isOpen) { clearTimeout(hoverT); hoverT = window.setTimeout(hoverOpen, HOVER_OPEN_MS) }
    })
    // Card 26: turning the wheel over the closed island is for the volume, so it must not also open the window.
    el.addEventListener('wheel', () => { if (!isOpen) clearTimeout(hoverT) }, { passive: true })
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return
      clearTimeout(hoverT)
      if (isOpen) { clearTimeout(leaveT); leaveT = window.setTimeout(close, LEAVE_CLOSE_MS) }
    })
    document.addEventListener('pointerdown', (e) => { if (isOpen && !el.contains(e.target as Node)) close() })
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) { e.preventDefault(); close() } })
  }

  const setCollapsed = (s: CollapsedState) => {
    collapsed = s
    const c = COLLAPSED[s]
    el.style.setProperty('--cw', `${c.w}px`)
    el.style.setProperty('--ch', `${c.h}px`)
    el.style.setProperty('--cr', `${c.r}px`)
    el.dataset.collapsed = s
  }
  setCollapsed('resting')
  const setSize = (s: { w: number; h: number; r: number }, how: 'live' | 'hud' | 'banner' | 'snap' = 'live') => {
    el.style.setProperty('--cw', `${s.w}px`)
    el.style.setProperty('--ch', `${s.h}px`)
    el.style.setProperty('--cr', `${s.r}px`)
    if (isOpen) return
    // Closed to closed: no waiting for a window to shrink first, so drop the close delay.
    el.dataset.size = how
  }

  layoutBar()
  apply(TAB_THEMES[active])
  refreshMeta()
  inner.toggleAttribute('inert', true)
  if (o.open) { isOpen = true; el.dataset.open = 'true'; pill.setAttribute('aria-expanded', 'true'); inner.removeAttribute('inert'); pill.tabIndex = -1 }

  return {
    el, host, get active() { return active }, setActive, refreshMeta, soon,
    get isOpen() { return isOpen }, open, close, pill, setCollapsed, get collapsed() { return collapsed },
    live, setSize,
    setPrefs: (raw) => { prefs = normalisePrefs(raw, DEFAULT_ORDER); layoutBar(); if (!shown().includes(active)) setActive('home', true); if (editing) paintEdit() },
    get prefs() { return prefs }, edit, get editing() { return editing },
    setKey: (hex) => el.style.setProperty('--k', hex),
    setUnread: (n) => {
      el.dataset.unread = n > 0 ? '1' : '0'
      pill.setAttribute('aria-label', n > 0 ? `Open Halo, ${n} new ${n === 1 ? 'alert' : 'alerts'}` : 'Open Halo')
    },
  }
}
