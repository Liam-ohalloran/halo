import { h } from './dom'
import type { ShellHandle } from './Shell'
import type { IslandLiveHandle } from './IslandLive'
import type { AlertRow } from '../types'
import { alertMeta } from '../lib/alerts'
import {
  CLOSE_MS, GAP_MS, HOLD_MS, OPEN_MS, SNOOZE_MS, addToStack, bannerModel, createBannerQueue, fanOffsets, holdLeft, newRows, pruneStack,
  type BannerAction, type BannerModel,
} from '../lib/banner'
import { slow } from '../lib/motion'

// Card 18: notification banners and the stack. Alerts pop out of the island as a 520 x 84 banner, hold 4 s (hover
// pauses), settle back, and become a small pill in a stack under the island. Hovering the stack fans it out, and the
// pill under the pointer grows into a banner sized card. One banner at a time. Actions only open a link or a tab, or snooze.
// The island itself is drawn by IslandLive (live.banner). This file is the flow and the stack.

export interface AlertSource {
  rows(): readonly AlertRow[]
  status(): 'loading' | 'ok' | 'error'
  subscribe(cb: () => void): () => void
  markRead(ids: string[]): Promise<void>
}
export interface BannersOptions {
  source: AlertSource
  clock?: () => Date
  /** Open a tab in the window (the Alerts tab). Opening a tab is an allowed action. */
  go: (tab: 'alerts') => void
  /** Open a web link. Defaults to a new browser tab. */
  openUrl?: (url: string) => void
}
export interface BannersHandle {
  /** Play an alert as if it had just arrived (the /island page). It is not marked as read and never removed by the store. */
  play(r: AlertRow): void
  /** Alerts waiting for their turn. */
  readonly waiting: number
  /** The pills in the stack, newest first. */
  readonly stack: readonly AlertRow[]
  destroy(): void
}

const TICK_MS = 100

export function Banners(sh: ShellHandle, live: IslandLiveHandle, o: BannersOptions): BannersHandle {
  const clock = o.clock ?? (() => new Date())
  const queue = createBannerQueue()
  const seen = new Set<string>()
  const local = new Set<string>() // played from the demo page: the store knows nothing about them
  let seeded = false
  let alive = true
  let busy = false
  let current: AlertRow | null = null
  let stack: AlertRow[] = []
  let timers: number[] = []
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers = timers.filter((x) => x !== t); if (alive) fn() }, ms); timers.push(t); return t }

  // Is the pointer on the island? Tracked from enter and leave events, not :hover, because inside the desktop app the
  // window is click through away from the island and the browser's own hover state can go stale there.
  let hovering = false
  const enter = (e: PointerEvent) => { if (e.pointerType !== 'touch') hovering = true }
  const leave = (e: PointerEvent) => { if (e.pointerType !== 'touch') hovering = false }
  sh.el.addEventListener('pointerenter', enter)
  sh.el.addEventListener('pointerleave', leave)

  // ---- Stack under the island ----
  const nst = h('div', { class: 'nst', 'aria-label': 'Recent alerts', role: 'group' })
  const more = h('button', { type: 'button', class: 'npMore' }) as HTMLButtonElement
  nst.append(more)
  sh.el.append(nst)
  const pills = new Map<string, HTMLElement>()
  let fan = false
  let hovered: string | null = null

  function pillFor(r: AlertRow): HTMLElement {
    const m = alertMeta(r.type)
    const act = bannerModel(r, clock()).action
    const el = h('div', { class: 'np in', role: 'button', tabindex: '0', 'data-id': r.id })
    el.style.setProperty('--k', m.colour)
    el.innerHTML = `<span class="npI"><svg viewBox="0 0 24 24" aria-hidden="true">${m.icon}</svg></span><div class="npT"><b></b><span></span></div><div class="npR"><small class="num"></small><button type="button" class="npA"></button></div><button type="button" class="npX" aria-label="Dismiss">×</button>`
    ;(el.querySelector('b') as HTMLElement).textContent = r.title
    ;(el.querySelector('.npT span') as HTMLElement).textContent = r.body
    const a = el.querySelector('.npA') as HTMLButtonElement
    a.textContent = act?.label ?? ''
    a.classList.toggle('has', !!act)
    return el
  }

  function layout() {
    const rows = stack
    nst.classList.toggle('on', rows.length > 0)
    nst.classList.toggle('fan', fan)
    nst.style.setProperty('--n', String(rows.length))
    const offs = fanOffsets(rows.length, hovered ? rows.findIndex((r) => r.id === hovered) : null)
    rows.forEach((r, i) => {
      const el = pills.get(r.id)
      if (!el) return
      el.style.setProperty('--d', String(i))
      el.style.setProperty('--y', `${offs[i]}px`)
      el.classList.toggle('card', fan && hovered === r.id)
      el.style.pointerEvents = ''
      const t = el.querySelector('small') as HTMLElement
      const ago = bannerModel(r, clock()).time
      if (t.textContent !== ago) t.textContent = ago
    })
    const last = offs.length ? offs[offs.length - 1] + (hovered === rows[rows.length - 1]?.id ? 84 : 46) + 8 : 0
    nst.style.setProperty('--more-y', `${last}px`)
    more.hidden = rows.length < 2
    more.textContent = fan ? 'Show less' : `${rows.length} notifications`
  }

  function setStack(next: AlertRow[]) {
    const keep = new Set(next.map((r) => r.id))
    for (const [id, el] of pills) {
      if (keep.has(id)) continue
      pills.delete(id)
      el.classList.add('out')
      later(() => el.remove(), 320)
    }
    for (const r of next) {
      if (pills.has(r.id)) continue
      const el = pillFor(r)
      pills.set(r.id, el)
      nst.prepend(el)
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('in')))
    }
    stack = next
    if (!stack.length) { fan = false; hovered = null }
    layout()
  }

  const drop = (id: string) => {
    setStack(stack.filter((r) => r.id !== id))
    if (!local.has(id)) void o.source.markRead([id])
  }

  nst.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { fan = true; layout() } })
  nst.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { fan = false; hovered = null; layout() } })
  nst.addEventListener('pointerover', (e) => {
    const id = (e.target as Element).closest<HTMLElement>('.np')?.dataset.id ?? null
    if (id !== hovered) { hovered = id; layout() }
  })
  nst.addEventListener('focusin', (e) => {
    const id = (e.target as Element).closest<HTMLElement>('.np')?.dataset.id ?? null
    fan = true; hovered = id; layout()
  })
  nst.addEventListener('click', (e) => {
    e.stopPropagation()
    const t = e.target as Element
    const x = t.closest<HTMLElement>('.npX')
    if (x) { drop(x.closest<HTMLElement>('.np')!.dataset.id!); return }
    if (t.closest('.npMore')) { fan = !fan; layout(); return }
    const np = t.closest<HTMLElement>('.np')
    if (!np) return
    const r = stack.find((s) => s.id === np.dataset.id)
    if (t.closest('.npA') && r) { runAction(r, bannerModel(r, clock()).action); return }
    // Tapping a pill opens the Alerts tab, where the alerts are listed. The stack clears, the alerts stay unread until read there.
    setStack([])
    o.go('alerts')
    sh.open()
  })
  nst.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { fan = false; hovered = null; layout() }
    if (e.key === 'Enter' || e.key === ' ') { const np = (e.target as Element).closest<HTMLElement>('.np'); if (np && e.target === np) { e.preventDefault(); np.click() } }
  })

  // ---- Actions: open a link, snooze, nothing else ----
  function runAction(r: AlertRow, a: BannerAction | null) {
    if (!a) return
    if (a.kind === 'link') (o.openUrl ?? ((u) => window.open(u, '_blank', 'noopener,noreferrer')))(a.url)
    else {
      setStack(stack.filter((s) => s.id !== r.id))
      later(() => { queue.push(r); pump() }, slow(SNOOZE_MS))
    }
  }

  // ---- One banner at a time ----
  function pump() {
    if (!alive || busy || !queue.size) return
    // The window is open: the alerts are already in front of Liam. Wait until it closes.
    if (sh.isOpen) { later(pump, 500); return }
    const r = queue.next()
    if (!r) return
    busy = true
    current = r
    const model: BannerModel = bannerModel(r, clock())
    live.banner(model)
    let left = HOLD_MS
    const tick = () => {
      if (!alive) return
      // Hovering the island holds the banner open, and so does the window opening (the loop then finishes at once).
      left = holdLeft(left, hovering, TICK_MS)
      if (left > 0 && !sh.isOpen) { later(tick, TICK_MS); return }
      live.banner(null)
      later(() => { setStack(addToStack(stack, r)); current = null; busy = false; later(pump, slow(GAP_MS)) }, slow(CLOSE_MS))
    }
    later(tick, slow(OPEN_MS))
  }

  live.update({}) // make sure the live layer exists before the first banner
  // The banner and its button. A banner tap opens the Alerts tab. The button runs its action.
  live.onBanner((what) => {
    const r = current
    if (!r) return
    if (what === 'action') { const a = bannerModel(r, clock()).action; if (a?.kind === 'snooze') { live.banner(null); busy = false; current = null; runAction(r, a); later(pump, slow(GAP_MS)) } else runAction(r, a) }
    else { o.go('alerts'); sh.open() }
  })

  // ---- Feed: the shared alerts store ----
  const sync = () => {
    if (o.source.status() === 'error') return
    const rows = o.source.rows()
    const fresh = newRows(seen, rows, seeded)
    if (o.source.status() === 'ok') seeded = true
    for (const r of fresh) queue.push(r)
    const unread = new Set(rows.map((r) => r.id))
    if (seeded) { const next = pruneStack(stack, unread, local); if (next.length !== stack.length) setStack(next) }
    pump()
  }
  const off = o.source.subscribe(sync)
  sync()

  return {
    play(r) { local.add(r.id); queue.push(r); pump() },
    get waiting() { return queue.size + (busy ? 1 : 0) },
    get stack() { return stack },
    destroy() { alive = false; off(); timers.forEach(clearTimeout); nst.remove(); sh.el.removeEventListener('pointerenter', enter); sh.el.removeEventListener('pointerleave', leave) },
  }
}
