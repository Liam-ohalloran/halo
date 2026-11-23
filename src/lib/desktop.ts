// Card 25: the bridge between the web code and the Halo desktop app (Tauri). Only active when the page is loaded with
// ?desktop=1 (the app does this). In a normal browser every call here does nothing.
//
// The window is made once, at startup, big enough for the open island plus the glow margin, and is never resized again.
// The web code only tells the app which parts of it take the mouse (`set_regions`); the rest is click through.

import { setHelperConnection } from './helper'
import { px, regionsFor, shellTarget, stackBox, windowSize, type DesktopStyle, type IslandShape, type Layout } from './desktop-size'

interface TauriGlobal {
  core: { invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T> }
  event: { listen: <T = unknown>(name: string, cb: (e: { payload: T }) => void) => Promise<() => void> }
}
const tauri = (): TauriGlobal | null => (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null

const KEY = 'halo.desktop'
let cached: boolean | null = null

/** True inside the desktop app. ?desktop=1 turns it on and remembers it, ?desktop=0 turns it off. */
export function isDesktop(): boolean {
  if (cached !== null) return cached
  let on = false
  try {
    const q = new URLSearchParams(location.search).get('desktop')
    if (q === '1' || q === 'true') { localStorage.setItem(KEY, '1'); on = true }
    else if (q === '0' || q === 'false') localStorage.removeItem(KEY)
    else on = localStorage.getItem(KEY) === '1' && tauri() !== null
  } catch { on = new URLSearchParams(location.search).get('desktop') === '1' }
  cached = on
  document.documentElement.classList.toggle('desktop', on)
  return on
}

export interface DesktopState {
  style: DesktopStyle
  monitor: string | null
  monitors: string[]
  paused: boolean
  autostart: boolean
}

export interface DesktopBridge {
  /** Tell the app the island's size in px. Only the click through regions follow, the window stays as it is. `r` is the bottom corner radius. */
  setSize(w: number, h: number, r?: number): void
  /** Let the window take keyboard focus (open island, sign-in) or not (a closed island never steals focus). */
  setFocusable(on: boolean): void
  state(): Promise<DesktopState | null>
  setStyle(style: DesktopStyle): void
  setMonitor(name: string | null): void
  setAutostart(on: boolean): void
  pauseForAnHour(): void
  quit(): void
}

const call = (cmd: string, args?: Record<string, unknown>): Promise<unknown> => tauri()?.core.invoke(cmd, args).catch(() => null) ?? Promise.resolve(null)

let style: DesktopStyle = 'notch'
let layout: Layout = { island: { w: 200, h: 34, r: 17 }, stack: null }
let regionsKey = ''

/** Make the window, once: its full size for the whole life of the app, with the regions for the current shape. */
function sendWindow(regions: unknown) {
  const win = windowSize()
  regionsKey = JSON.stringify(regions)
  void call('set_island', { winW: win.w, winH: win.h, regions })
}

/** Only ever the click through regions. Never the window. */
function setRegions(regions: unknown) {
  const k = JSON.stringify(regions)
  if (k === regionsKey) return
  regionsKey = k
  void call('set_regions', { regions })
}

function apply(l: Layout) {
  layout = l
  setRegions(regionsFor(l, style))
}

export const bridge: DesktopBridge = {
  setSize(w, h, r = Math.min(20, h / 2)) { apply({ ...layout, island: { w, h, r } }) },
  setFocusable: (on) => void call('set_focusable', { on }),
  state: () => call('get_state') as Promise<DesktopState | null>,
  setStyle: (s) => void call('set_style', { style: s }),
  setMonitor: (name) => void call('set_monitor', { name }),
  setAutostart: (on) => void call('set_autostart', { on }),
  pauseForAnHour: () => void call('pause_for_hour'),
  quit: () => void call('quit'),
}

declare global { interface Window { halo?: { desktop?: DesktopBridge } } }
export const installBridge = () => { window.halo = { ...(window.halo ?? {}), desktop: bridge } }

/** The shell's own handle, as much of it as the bridge needs. */
export interface ShellLike {
  el: HTMLElement
  readonly isOpen: boolean
  open(): void
  close(): void
  setActive(id: 'more', emit?: boolean): void
}

/**
 * Connect the island to the app: size, focus, click through, hotkey and tray events. Returns a function that undoes it.
 */
export function attachDesktop(sh: ShellLike): () => void {
  installBridge()
  const el = sh.el
  const cleanups: Array<() => void> = []

  const island = (): IslandShape => {
    const cs = getComputedStyle(el)
    const v = (n: string, d: number) => px(el.style.getPropertyValue(n) || cs.getPropertyValue(n), d)
    return shellTarget(el.dataset.open === 'true', v('--cw', 200), v('--ch', 34), v('--cr', 17))
  }
  let lastOpen = el.dataset.open === 'true'
  const fit = () => {
    const open = el.dataset.open === 'true'
    if (open !== lastOpen) { lastOpen = open; bridge.setFocusable(open) }
    // Open or closed the window is the same. The regions follow the island's end shape at once, so a closing island
    // lets the mouse through where it used to be while it is still shrinking.
    const nst = open ? null : el.querySelector('.nst')
    const count = nst && nst.classList.contains('on') ? Number((nst as HTMLElement).style.getPropertyValue('--n') || 0) : 0
    apply({ island: island(), stack: stackBox(count, !!nst?.classList.contains('fan')), charge: el.dataset.live === 'charge' })
  }
  // Watch the island itself, and its stack of alert pills, for a change of state or size. Not what is inside the open
  // panels: a tab switch changes hundreds of styles in there and none of them is the window's business.
  const mo = new MutationObserver(fit)
  const watchAttrs = { attributes: true, attributeFilter: ['data-open', 'data-collapsed', 'data-size', 'data-live', 'style', 'class'] }
  mo.observe(el, watchAttrs)
  let nstSeen: Element | null = null
  const watchStack = () => {
    const nst = el.querySelector('.nst')
    if (nst && nst !== nstSeen) { nstSeen = nst; mo.observe(nst, watchAttrs) }
  }
  const mo2 = new MutationObserver(() => { watchStack(); fit() })
  mo2.observe(el, { childList: true })
  watchStack()
  cleanups.push(() => { mo.disconnect(); mo2.disconnect() })

  // Style (Island or Notch) comes from the app. It changes the shape and the window size, so refit when it moves.
  const applyStyle = (s: DesktopStyle) => {
    style = s
    document.documentElement.dataset.deskStyle = s
    regionsKey = '' // the shape moved (8 px gap in Island style), so say so. The window stays as it is.
    fit()
  }
  // The one and only time the window is sized: now, at startup, before anything shows.
  sendWindow(regionsFor(layout, style))
  bridge.setFocusable(lastOpen) // a closed island never takes the keyboard (sign-in had it)
  void bridge.state().then((st) => { if (st) applyStyle(st.style); else fit() })

  const t = tauri()
  const listeners: Array<Promise<() => void>> = []
  if (t) {
    const on = <T>(name: string, cb: (p: T) => void) => listeners.push(t.event.listen<T>(name, (e) => cb(e.payload)))
    on<DesktopStyle>('halo-style', applyStyle)
    on<null>('halo-toggle', () => (sh.isOpen ? sh.close() : sh.open()))
    on<null>('halo-open', () => sh.open())
    on<null>('halo-settings', () => { sh.setActive('more', true); sh.open() })
    // The app watches the cursor, because a click through window never sees the mouse leave. These stand in for it.
    let hover = false
    el.addEventListener('pointerenter', () => { hover = true })
    el.addEventListener('pointerleave', () => { hover = false })
    on<{ inside: boolean }>('halo-cursor', ({ inside }) => {
      if (inside === hover) return
      hover = inside
      el.dispatchEvent(new PointerEvent(inside ? 'pointerenter' : 'pointerleave', { pointerType: 'mouse' }))
    })
    // A click anywhere else on the desktop closes the island, as a click outside it does in a browser.
    on<null>('halo-outside-click', () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })))
  }
  cleanups.push(() => listeners.forEach((p) => void p.then((off) => off())))
  return () => cleanups.forEach((f) => f())
}

/** A fixed size for screens that are not the island (the sign-in card). Takes keyboard focus. */
export function sizeForScreen(w: number, h: number) {
  installBridge()
  regionsKey = ''
  void call('set_island', { winW: w, winH: h, regions: [{ x: 0, y: 0, w, h, rt: 0, rb: 26 }] })
  bridge.setFocusable(true)
}

/**
 * Card 26: ask the app for the bundled helper's port and pairing token, and keep them current (the app restarts the
 * helper if it stops, and may pick a new port). Call it before anything talks to the helper.
 */
export async function connectDesktopHelper(): Promise<void> {
  const t = tauri()
  if (!t) return
  const apply = (i: { port: number; token: string; running?: boolean } | null) => {
    if (i && i.token && i.running !== false) setHelperConnection({ url: `http://127.0.0.1:${i.port}`, token: i.token })
  }
  apply(await t.core.invoke<{ port: number; token: string; running: boolean } | null>('helper_info').catch(() => null))
  void t.event.listen<{ port: number; token: string }>('halo-helper', (e) => apply(e.payload))
}
