import '../styles/settings.css'
import { h } from './dom'
import { EmbedSettings } from './EmbedShell'
import { bridge, isDesktop, onDesktopEvent, type DesktopState } from '../lib/desktop'
import { updateRow, type UpdateState } from '../lib/updates'
import { DEFAULT_ORDER, RAIL_ICONS, TAB_THEMES, type TabId } from '../styles/tabs'
import { MAX_PINNED, canPinMore, moreIds, moveTab, movePinnedTo, togglePin, ALWAYS_PINNED, type TabPrefs } from '../lib/tabprefs'
import { MIN_PASSWORD, passwordProblem } from '../lib/auth-form'
import { CYCLE_EVERY, CYCLE_KEYS, CYCLE_LABELS, type CycleEvery } from '../lib/island-cycle'
import { clearPhoto, onPhotoChange, savedPhoto, setPhotoFromFile } from '../lib/base-photo'
import { HUD_KEYS, HUD_LABELS, LIVE_KEYS, LIVE_LABELS, SOURCE_KEYS, SOURCE_LABELS, type IslandSize, type Speed, type UiStore } from '../lib/ui-settings'

// Settings (cards 15b, 23 and 27): the sixth tab in the bar's "•••" grid. A short list of sections on the left, one section
// at a time on the right, so nothing ever scrolls. Every switch changes the page at once and is saved to the settings row,
// so the phone follows where it makes sense. A control only repaints itself, the panel is never rebuilt.

export interface Account {
  email: string
  onSignOut?: () => void
  /** Save a new password. Resolves to a sentence when it fails, or null when it worked. */
  onSetPassword?: (password: string) => Promise<string | null>
}

export interface SettingsOptions {
  account?: Account
  embed: boolean
  onSignOut: () => void
  ui: UiStore
  tabs: { get(): TabPrefs; set(p: TabPrefs): void; subscribe(cb: () => void): () => void }
  /** The desktop app's own state, for the Laptop section. Null outside the app. */
  desktop?: { state(): Promise<DesktopState | null> } | null
}
export interface SettingsHandle extends HTMLElement {
  /** Open a section by name (for screenshots and the tray's Settings item). */
  section(name: SectionId): void
  destroy(): void
}

export type SectionId = 'look' | 'island' | 'cycle' | 'tabs' | 'alerts' | 'laptop' | 'account'
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'look', label: 'Look' }, { id: 'island', label: 'Island' }, { id: 'cycle', label: 'Cycle' }, { id: 'tabs', label: 'Tabs' },
  { id: 'alerts', label: 'Alerts' }, { id: 'laptop', label: 'Laptop' }, { id: 'account', label: 'Account' },
]

const icon = (id: TabId, size = 14): string => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RAIL_ICONS[id]}</svg>`
const CROSS = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'

/** A switch row: label on the left, an on/off switch on the right. */
function switchRow(label: string, on: () => boolean, set: (v: boolean) => void, hint?: string): { el: HTMLElement; sync(): void } {
  const b = h('button', { type: 'button', class: 'st-sw', role: 'switch', 'aria-label': label }) as HTMLButtonElement
  const sync = () => b.setAttribute('aria-checked', String(on()))
  b.addEventListener('click', () => { set(!on()); sync() })
  sync()
  return { el: h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, label, hint ? h('small', {}, hint) : null), b), sync }
}

/** A row of choices with a sliding selection. */
function segRow<T extends string>(label: string, options: { v: T; label: string }[], get: () => T, set: (v: T) => void): { el: HTMLElement; sync(): void } {
  const btns = options.map((o) => h('button', { type: 'button', class: 'st-seg-b', role: 'radio', 'data-v': o.v, onclick: () => { set(o.v); sync() } }, o.label))
  const sync = () => btns.forEach((b) => { const on = b.dataset.v === get(); b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on) })
  sync()
  return { el: h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, label), h('div', { class: 'st-seg', role: 'radiogroup', 'aria-label': label }, ...btns)), sync }
}

/** A slider row: label, the track, the value. Live while dragging. */
function rangeRow(label: string, min: number, max: number, get: () => number, set: (v: number) => void): { el: HTMLElement; sync(): void } {
  const input = h('input', { type: 'range', class: 'st-range', min, max, step: 5, 'aria-label': label }) as HTMLInputElement
  const val = h('span', { class: 'st-val' })
  const paint = () => { input.value = String(get()); val.textContent = `${get()}%`; input.style.setProperty('--p', `${((get() - min) / (max - min)) * 100}%`) }
  input.addEventListener('input', () => { set(Number(input.value)); paint() })
  paint()
  return { el: h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, label), h('div', { class: 'st-rg' }, input, val)), sync: paint }
}

/** "Set a sign-in code": one row that turns into a password field with Show/Hide and Save. The value lives only in the field. */
function signInCodeRow(save: (password: string) => Promise<string | null>): HTMLElement {
  const row = h('div', { class: 'st-row' })
  const open = () => {
    const input = h('input', { type: 'password', class: 'st-pw', placeholder: `${MIN_PASSWORD}+ characters`, autocomplete: 'new-password', 'aria-label': 'New sign-in code' }) as HTMLInputElement
    const eye = h('button', { type: 'button', class: 'st-btn', 'aria-pressed': 'false', onclick: () => { const on = input.type === 'password'; input.type = on ? 'text' : 'password'; eye.textContent = on ? 'Hide' : 'Show'; eye.setAttribute('aria-pressed', String(on)) } }, 'Show') as HTMLButtonElement
    const msg = h('span', { class: 'st-msg', role: 'status' })
    const go = h('button', { type: 'submit', class: 'st-btn' }, 'Save') as HTMLButtonElement
    input.addEventListener('input', () => { msg.className = 'st-msg'; msg.textContent = '' })
    const form = h('form', { class: 'st-pwform', onsubmit: async (e: Event) => {
      e.preventDefault()
      const problem = passwordProblem(input.value)
      if (problem) { msg.className = 'st-msg err'; msg.textContent = problem; return }
      go.disabled = true
      const err = await save(input.value)
      input.value = ''
      go.disabled = false
      if (err) { msg.className = 'st-msg err'; msg.textContent = err; return }
      done('Saved. Use it next time you sign in.')
    } }, input, eye, go)
    row.replaceChildren(h('span', { class: 'st-k' }, 'Sign-in code', msg), form)
    input.focus()
  }
  const done = (text: string) => {
    row.replaceChildren(h('span', { class: 'st-k' }, 'Sign-in code', h('small', { role: 'status' }, text)), h('button', { type: 'button', class: 'st-btn', onclick: open }, 'Change'))
  }
  row.append(h('span', { class: 'st-k' }, 'Sign-in code', h('small', {}, 'Sign in with email and password')), h('button', { type: 'button', class: 'st-btn', onclick: open }, 'Set a sign-in code'))
  return row
}

export function SettingsPanel(o: SettingsOptions): SettingsHandle {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const desk = isDesktop()
  const syncs: Array<() => void> = []
  const offs: Array<() => void> = []
  const reg = (c: { el: HTMLElement; sync(): void }): HTMLElement => { syncs.push(c.sync); return c.el }
  const ui = o.ui

  // ---- Island: which live states and which pills show
  const col = (title: string, rows: HTMLElement[]) => h('div', { class: 'st-col' }, h('div', { class: 'st-h' }, title), ...rows)
  const island = h('section', { class: 'st-sec two', 'data-sec': 'island', 'aria-label': 'Island' },
    col('Live states', LIVE_KEYS.map((k) => reg(switchRow(LIVE_LABELS[k], () => ui.get().live[k], (v) => ui.set({ live: { ...ui.get().live, [k]: v } }))))),
    col('Pills', HUD_KEYS.map((k) => reg(switchRow(HUD_LABELS[k], () => ui.get().hud[k], (v) => ui.set({ hud: { ...ui.get().hud, [k]: v } }))))))

  // ---- Base (card 29): the photo and the clock behind the mountains
  const photoBtn = h('button', { type: 'button', class: 'st-btn', onclick: () => pick.click() }, 'Choose photo') as HTMLButtonElement
  const resetBtn = h('button', { type: 'button', class: 'st-btn', onclick: () => { clearPhoto(); ui.set({ clockBehind: true }); paintPhoto() } }, 'Use the default') as HTMLButtonElement
  const photoMsg = h('small', { role: 'status' }, '')
  const photoK = h('span', { class: 'st-k' }, 'Base background', photoMsg)
  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Choose a photo for the Base tab' }) as HTMLInputElement
  function paintPhoto() {
    const own = savedPhoto() != null
    photoMsg.textContent = own ? 'Your photo, kept on this device' : 'The photo that comes with Halo'
    resetBtn.hidden = !own
  }
  pick.addEventListener('change', async () => {
    const f = pick.files?.[0]
    pick.value = ''
    if (!f) return
    photoMsg.textContent = 'Saving…'
    const err = await setPhotoFromFile(f)
    if (err) { photoMsg.textContent = err; return }
    // The ridge is cut for the photo that ships with Halo, so it is off for your own until you turn it back on.
    ui.set({ clockBehind: false })
    paintPhoto()
  })
  offs.push(onPhotoChange(paintPhoto))
  paintPhoto()
  // ---- Look
  const look = h('section', { class: 'st-sec', 'data-sec': 'look', 'aria-label': 'Look' },
    reg(segRow<IslandSize>('Island size', [{ v: 'normal', label: 'Normal' }, { v: 'large', label: 'Large' }, { v: 'larger', label: 'Larger' }], () => ui.get().size, (v) => ui.set({ size: v }))),
    reg(rangeRow('Glow', 0, 150, () => ui.get().glow, (v) => ui.set({ glow: v }))),
    reg(rangeRow('Blur', 0, 150, () => ui.get().blur, (v) => ui.set({ blur: v }))),
    reg(segRow<Speed>('Animation speed', [{ v: 'slow', label: 'Slow' }, { v: 'normal', label: 'Normal' }, { v: 'fast', label: 'Fast' }], () => ui.get().speed, (v) => ui.set({ speed: v }))),
    // Card 29: the Base tab's photo and its clock
    h('div', { class: 'st-row' }, photoK, h('div', { class: 'st-btns' }, resetBtn, photoBtn, pick)),
    reg(switchRow('Clock behind mountains', () => ui.get().clockBehind, (v) => ui.set({ clockBehind: v }), 'Off for a photo the peaks do not fit')))

  // ---- Cycle (card 29): what the closed island shows when nothing live is happening
  const cycle = h('section', { class: 'st-sec two', 'data-sec': 'cycle', 'aria-label': 'Cycle' },
    col('Modes', CYCLE_KEYS.map((k) => reg(switchRow(CYCLE_LABELS[k], () => ui.get().cycle[k], (v) => ui.set({ cycle: { ...ui.get().cycle, [k]: v } }))))),
    col('Timing', [
      reg(segRow<`${CycleEvery}`>('Every', CYCLE_EVERY.map((n) => ({ v: `${n}` as `${CycleEvery}`, label: `${n} s` })), () => `${ui.get().cycleEvery}` as `${CycleEvery}`, (v) => ui.set({ cycleEvery: Number(v) as CycleEvery }))),
      h('p', { class: 'st-note' }, 'The closed island moves through these when nothing live is on. Hover pauses it. Live states, pills and banners always come first, then it carries on.')]))

  // ---- Tabs: pick up to 8 for the bar and drag them into order
  const pinnedRow = h('div', { class: 'st-chips', role: 'list', 'aria-label': 'Tabs in the bar' })
  const moreGrid = h('div', { class: 'st-tiles' })
  const count = h('span', { class: 'st-n' })
  const tabsSec = h('section', { class: 'st-sec st-tabs', 'data-sec': 'tabs', 'aria-label': 'Tabs' },
    h('div', { class: 'st-h' }, 'In the bar', count, h('small', {}, 'Drag to reorder')),
    pinnedRow,
    h('div', { class: 'st-h' }, 'Under •••', h('small', {}, 'Tap to pin')),
    moreGrid)
  let dragging = false
  function paintTabs(focus?: string) {
    if (dragging) return
    const p = o.tabs.get()
    count.textContent = `${p.pinned.length} of ${MAX_PINNED}`
    pinnedRow.replaceChildren(...p.pinned.map((id, i) => {
      const t = TAB_THEMES[id as TabId]
      const fixed = ALWAYS_PINNED.includes(id)
      const chip = h('div', { class: 'st-chip', role: 'listitem', tabindex: 0, 'data-id': id, 'aria-label': `${t.label}, place ${i + 1} of ${p.pinned.length}. Use the arrow keys to move it.` })
      chip.style.setProperty('--tab', t.colour)
      chip.innerHTML = `${icon(id as TabId)}<span>${t.label}</span>`
      if (!fixed) {
        const x = h('button', { type: 'button', class: 'st-x', 'aria-label': `Unpin ${t.label}`, tabindex: -1, onclick: (e: Event) => { e.stopPropagation(); o.tabs.set(togglePin(o.tabs.get(), id)) } })
        x.innerHTML = CROSS
        chip.append(x)
      }
      return chip
    }))
    const full = !canPinMore(p)
    moreGrid.replaceChildren(...moreIds(p, DEFAULT_ORDER).map((id) => {
      const t = TAB_THEMES[id as TabId]
      const b = h('button', { type: 'button', class: 'st-tile', 'data-id': id, disabled: full, 'aria-label': full ? `${t.label}. The bar is full, unpin one first.` : `Pin ${t.label}`, title: full ? 'The bar is full' : `Pin ${t.label}`, onclick: () => o.tabs.set(togglePin(o.tabs.get(), id)) })
      b.style.setProperty('--tab', t.colour)
      b.innerHTML = `${icon(id as TabId)}<span>${t.label}</span>`
      return b
    }))
    if (!moreGrid.childElementCount) moreGrid.append(h('p', { class: 'st-empty' }, 'Every tab is in the bar.'))
    if (focus) pinnedRow.querySelector<HTMLElement>(`[data-id="${focus}"]`)?.focus({ preventScroll: true })
  }
  // Drag a chip sideways to a new place. A line shows where it will land. Arrow keys do the same one place at a time.
  pinnedRow.addEventListener('pointerdown', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.st-chip')
    if (!chip || (e.target as HTMLElement).closest('.st-x') || e.button !== 0) return
    const id = chip.dataset.id!
    const startX = e.clientX
    const chips = [...pinnedRow.querySelectorAll<HTMLElement>('.st-chip')]
    const rects = chips.map((c) => c.getBoundingClientRect())
    const from = chips.indexOf(chip)
    let to = from
    let moved = false
    const mark = h('i', { class: 'st-drop', 'aria-hidden': 'true' })
    const rowRect = pinnedRow.getBoundingClientRect()
    const place = (x: number, y: number) => {
      // The slot whose middle is closest to the pointer, on the row the pointer is in.
      let best = from, bestD = Infinity
      rects.forEach((r, i) => { const d = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 1.4); if (d < bestD) { bestD = d; best = i } })
      to = best
      const r = rects[to]
      const after = to > from
      mark.style.left = `${(after ? r.right + 2 : r.left - 4) - rowRect.left}px`
      mark.style.top = `${r.top - rowRect.top}px`
      mark.style.height = `${r.height}px`
    }
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - e.clientY) < 5) return
      if (!moved) { moved = true; dragging = true; chip.classList.add('drag'); chip.setPointerCapture(e.pointerId); pinnedRow.append(mark) }
      chip.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - e.clientY}px)`
      place(ev.clientX, ev.clientY)
    }
    const up = () => {
      chip.removeEventListener('pointermove', move); chip.removeEventListener('pointerup', up); chip.removeEventListener('pointercancel', up)
      if (!moved) return
      dragging = false
      chip.classList.remove('drag'); chip.style.transform = ''; mark.remove()
      if (to !== from) o.tabs.set(movePinnedTo(o.tabs.get(), id, to)); else paintTabs(id)
    }
    chip.addEventListener('pointermove', move); chip.addEventListener('pointerup', up); chip.addEventListener('pointercancel', up)
  })
  pinnedRow.addEventListener('keydown', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.st-chip')
    if (!chip || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Delete')) return
    e.preventDefault(); e.stopPropagation()
    const id = chip.dataset.id!
    if (e.key === 'Delete') { o.tabs.set(togglePin(o.tabs.get(), id)); return }
    const next = moveTab(o.tabs.get(), id, e.key === 'ArrowLeft' ? -1 : 1)
    o.tabs.set(next)
    paintTabs(id)
  })

  // ---- Alerts: where banners come from, and the clipboard
  const alerts = h('section', { class: 'st-sec two', 'data-sec': 'alerts', 'aria-label': 'Alerts' },
    col('Notification sources', SOURCE_KEYS.map((k) => reg(switchRow(SOURCE_LABELS[k], () => ui.get().sources[k], (v) => ui.set({ sources: { ...ui.get().sources, [k]: v } }))))),
    col('Clipboard', [
      reg(switchRow('Keep clipboard history', () => ui.get().clipboard, (v) => ui.set({ clipboard: v }))),
      h('p', { class: 'st-note' }, 'The last 25 things you copied, kept in memory only. Anything from a password manager is never kept. Switch off to stop and clear it.')]))

  // ---- Laptop (the desktop app only)
  const laptop = h('section', { class: 'st-sec', 'data-sec': 'laptop', 'aria-label': 'Laptop' })
  let st: DesktopState | null = null
  const dBtn = (label: string, action: () => void) => h('button', { type: 'button', class: 'st-btn', onclick: action }, label)
  const styleSeg = segRow<'notch' | 'island'>('Style', [{ v: 'notch', label: 'Notch' }, { v: 'island', label: 'Island' }], () => st?.style ?? 'notch', (v) => { bridge.setStyle(v); if (st) st = { ...st, style: v } })
  const screenBtn = dBtn('Main screen', () => {
    if (!st) return
    const all: (string | null)[] = [null, ...st.monitors]
    const next = all[(all.indexOf(st.monitor) + 1) % all.length]
    bridge.setMonitor(next); st = { ...st, monitor: next }; paintLaptop()
  })
  const keyBtn = dBtn('Ctrl+Alt+Space', () => {
    if (!st?.hotkeys?.length) return
    const next = st.hotkeys[(Math.max(0, st.hotkeys.indexOf(st.hotkey ?? '')) + 1) % st.hotkeys.length]
    bridge.setHotkey(next); st = { ...st, hotkey: next }; paintLaptop()
  })
  const startRow = switchRow('Launch at startup', () => st?.autostart ?? false, (v) => { bridge.setAutostart(v); if (st) st = { ...st, autostart: v } })
  function paintLaptop() {
    styleSeg.sync(); startRow.sync()
    screenBtn.textContent = st?.monitor ?? 'Main screen'
    keyBtn.textContent = st?.hotkey ?? 'Ctrl+Alt+Space'
  }
  // Updates (card 28): the app looks when it starts and the tray can look too. One button checks, then installs and restarts.
  let version = ''
  let upd: UpdateState = { kind: 'idle' }
  const updBtn = dBtn('Check for updates', () => void updAct())
  const updSub = h('small', {}, '')
  const updK = h('span', { class: 'st-k' }, 'Halo', updSub)
  const setUpd = (s: UpdateState) => {
    upd = s
    const r = updateRow(version, s)
    updK.firstChild!.textContent = r.label
    updSub.textContent = r.sub
    updBtn.textContent = r.button ?? 'Working…'
    updBtn.disabled = r.busy
    updBtn.hidden = false
  }
  async function updAct() {
    if (upd.kind === 'available') {
      setUpd({ kind: 'installing', version: upd.version })
      if (!(await bridge.installUpdate())) setUpd({ kind: 'error', message: "The update didn't install. Halo is untouched. Try again." })
      return
    }
    setUpd({ kind: 'checking' })
    const r = await bridge.checkUpdate()
    setUpd(r === 'error' ? { kind: 'error', message: "Halo couldn't check for updates. Try again in a minute." } : r ? { kind: 'available', version: r.version } : { kind: 'latest' })
  }
  if (desk) {
    void bridge.version().then((v) => { version = v ?? ''; setUpd(upd) })
    offs.push(onDesktopEvent<{ version: string }>('halo-update', (u) => setUpd({ kind: 'available', version: u.version })))
    offs.push(onDesktopEvent('halo-update-none', () => setUpd({ kind: 'latest' })))
    offs.push(onDesktopEvent<string>('halo-update-error', (m) => setUpd({ kind: 'error', message: m })))
  }
  setUpd(upd)
  laptop.append(styleSeg.el,
    h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, 'Screen'), screenBtn),
    h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, 'Open and close with'), keyBtn),
    startRow.el,
    h('div', { class: 'st-row' }, updK, updBtn),
    h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, 'Halo app'), dBtn('Quit', () => bridge.quit())))
  syncs.push(paintLaptop)
  if (desk) void (o.desktop?.state() ?? bridge.state()).then((v) => { if (v) { st = v; paintLaptop() } })

  // ---- Account
  const account = h('section', { class: 'st-sec', 'data-sec': 'account', 'aria-label': 'Account' },
    o.account?.email ? h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, 'Signed in as'), h('span', { class: 'st-v' }, o.account.email)) : null,
    o.account?.email && o.account.onSetPassword ? signInCodeRow(o.account.onSetPassword) : null,
    !standalone && !o.embed && !desk ? h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, 'Halo on your iPhone'), h('a', { class: 'st-btn', href: `${import.meta.env.BASE_URL}install/` }, 'Add to Home Screen')) : null,
    o.embed ? h('div', { class: 'st-row' }, EmbedSettings()) : null,
    h('div', { class: 'st-row' }, h('span', { class: 'st-k' }, 'Account'), h('button', { type: 'button', class: 'st-btn', onclick: () => (o.account?.onSignOut ?? o.onSignOut)() }, 'Sign out')))

  // ---- Frame: the section list and the visible section
  const secs: Record<SectionId, HTMLElement> = { look, island, cycle, tabs: tabsSec, alerts, laptop, account }
  const list = SECTIONS.filter((s) => s.id !== 'laptop' || desk)
  let cur: SectionId = 'look'
  const navBtns = new Map<SectionId, HTMLButtonElement>()
  const nav = h('nav', { class: 'st-nav', role: 'tablist', 'aria-label': 'Settings sections', 'aria-orientation': 'vertical' }, ...list.map((s) => {
    const b = h('button', { type: 'button', class: 'st-nb', role: 'tab', 'data-sec': s.id, onclick: () => show(s.id) }, s.label) as HTMLButtonElement
    navBtns.set(s.id, b)
    return b
  }))
  const main = h('div', { class: 'st-main' }, ...list.map((s) => secs[s.id]))
  function show(id: SectionId) {
    if (!navBtns.has(id)) id = 'look'
    cur = id
    for (const [k, b] of navBtns) { const on = k === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1 }
    for (const [k, s] of Object.entries(secs)) s.hidden = k !== id
    if (id === 'tabs') paintTabs()
  }
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault(); e.stopPropagation()
    const ids = [...navBtns.keys()]
    const to = ids[(ids.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : ids.length - 1)) % ids.length]
    show(to); navBtns.get(to)!.focus()
  })

  const root = h('div', { class: `st${desk ? ' desk' : ''}`, 'data-tab': 'more' }, nav, main) as unknown as SettingsHandle
  const unsubs = [o.ui.subscribe(() => syncs.forEach((f) => f())), o.tabs.subscribe(() => { if (cur === 'tabs') paintTabs() })]
  root.section = show
  root.destroy = () => { unsubs.forEach((f) => f()); offs.forEach((f) => f()) }
  show('look')
  return root
}
