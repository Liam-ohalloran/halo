import { h } from './dom'
import { Icon } from './Icon'

// TabBar for the top of the open island (HALO.md 3.1e).
// Phosphor icons: regular when inactive, fill plus a 4 px dot when active. The dot slides.
// A thin divider sits before Settings. Hide and reorder are ready: setOrder and setHidden re-render
// in place, and at most 8 tabs are ever visible. Arrow keys, Home and End move between tabs.

export interface TabDef { id: string; label: string; icon: string; disabled?: boolean }

/** Order and icons straight from HALO.md 3.1e. */
export const TABS: TabDef[] = [
  { id: 'now', label: 'Now', icon: 'house' },
  { id: 'music', label: 'Music', icon: 'music-notes' },
  { id: 'study', label: 'Study', icon: 'book-open' },
  { id: 'pay', label: 'Pay', icon: 'wallet' },
  { id: 'sixers', label: 'Sixers', icon: 'basketball' },
  { id: 'claude', label: 'Claude', icon: 'sparkle' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
  { id: 'shelf', label: 'Shelf', icon: 'tray' },
  { id: 'widgets', label: 'Widgets', icon: 'squares-four' },
  { id: 'controls', label: 'Controls', icon: 'sliders-horizontal' },
]
export const SETTINGS_TAB: TabDef = { id: 'settings', label: 'Settings', icon: 'gear-six' }
export const MAX_VISIBLE_TABS = 8
/** Controls needs the native app, so v1 hides it by default. */
export const V1_HIDDEN = ['controls']

export interface TabBarOptions {
  tabs?: TabDef[]
  /** Ids in display order. Missing ids go last. */
  order?: string[]
  hidden?: string[]
  active?: string
  /** Show the divider and Settings button. Default true. */
  settings?: boolean
  onChange?: (id: string, from: string | null) => void
  onSettings?: () => void
}
export interface TabBarHandle extends HTMLDivElement {
  setActive(id: string, emit?: boolean): void
  setOrder(ids: string[]): void
  setHidden(ids: string[]): void
  readonly active: string | null
  /** Visible tab ids in order, for direction maths. */
  visibleIds(): string[]
  buttons: Map<string, HTMLButtonElement>
}

export function TabBar(o: TabBarOptions = {}): TabBarHandle {
  const all = o.tabs ?? TABS
  let order = o.order ?? all.map((t) => t.id)
  let hidden = o.hidden ?? V1_HIDDEN
  let active: string | null = null
  const buttons = new Map<string, HTMLButtonElement>()
  const icons = new Map<string, ReturnType<typeof Icon>>()

  const el = h('div', { class: 'h-tabbar' }) as TabBarHandle
  const list = h('div', { class: 'h-tabs', role: 'tablist', 'aria-label': 'Halo sections' })
  const dot = h('span', { class: 'h-tabdot', 'aria-hidden': 'true' })
  list.append(dot)
  el.append(list)
  el.buttons = buttons

  const visible = (): TabDef[] => {
    const byId = new Map(all.map((t) => [t.id, t]))
    const ordered = [...order, ...all.map((t) => t.id).filter((id) => !order.includes(id))]
    return ordered.map((id) => byId.get(id)).filter((t): t is TabDef => !!t && !hidden.includes(t.id)).slice(0, MAX_VISIBLE_TABS)
  }

  function build() {
    buttons.clear(); icons.clear()
    list.replaceChildren(dot)
    const tabs = visible()
    if (!active || !tabs.some((t) => t.id === active)) active = o.active && tabs.some((t) => t.id === o.active) ? o.active : (tabs[0]?.id ?? null)
    for (const t of tabs) {
      const ic = Icon(t.icon, t.id === active ? 'fill' : 'regular', 22)
      const b = h('button', { type: 'button', class: 'h-tab', role: 'tab', 'aria-label': t.label, title: t.label, 'data-id': t.id, disabled: !!t.disabled }, ic)
      b.addEventListener('click', () => setActive(t.id, true))
      buttons.set(t.id, b); icons.set(t.id, ic)
      list.append(b)
    }
    sync()
    if (o.settings !== false) {
      const sb = h('button', { type: 'button', class: 'h-tab', 'aria-label': 'Settings', title: 'Settings', 'data-settings': true }, Icon(SETTINGS_TAB.icon, 'regular', 22))
      sb.addEventListener('click', () => o.onSettings?.())
      el.replaceChildren(list, h('span', { class: 'h-tab-div', 'aria-hidden': 'true' }), sb)
    } else el.replaceChildren(list)
  }

  function sync() {
    for (const [id, b] of buttons) {
      const on = id === active
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
      icons.get(id)!.set(all.find((t) => t.id === id)!.icon, on ? 'fill' : 'regular')
    }
    placeDot()
  }
  function placeDot() {
    const b = active ? buttons.get(active) : undefined
    if (!b || !b.offsetWidth) { dot.style.opacity = '0'; return }
    dot.style.opacity = '1'
    dot.style.transform = `translateX(${b.offsetLeft + b.offsetWidth / 2 - 2}px)`
  }
  function setActive(id: string, emit = false) {
    if (!buttons.has(id) || id === active) return
    const from = active
    active = id
    sync()
    if (emit) o.onChange?.(id, from)
  }

  list.addEventListener('keydown', (e) => {
    const ids = [...buttons.keys()].filter((id) => !buttons.get(id)!.disabled)
    const i = ids.indexOf(document.activeElement ? (document.activeElement as HTMLElement).dataset.id ?? '' : '')
    let to = -1
    if (e.key === 'ArrowRight') to = (i + 1) % ids.length
    else if (e.key === 'ArrowLeft') to = (i - 1 + ids.length) % ids.length
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = ids.length - 1
    if (to < 0 || !ids.length) return
    e.preventDefault()
    setActive(ids[to], true)
    buttons.get(ids[to])!.focus()
  })

  el.setActive = setActive
  el.setOrder = (ids) => { order = ids; build() }
  el.setHidden = (ids) => { hidden = ids; build() }
  el.visibleIds = () => visible().map((t) => t.id)
  Object.defineProperty(el, 'active', { get: () => active })

  build()
  new ResizeObserver(placeDot).observe(list)
  document.fonts?.ready.then(placeDot)
  return el
}
