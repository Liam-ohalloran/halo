import { h } from './dom'
import { EmbedSettings } from './EmbedShell'
import { bridge, isDesktop, type DesktopState } from '../lib/desktop'

// Settings (card 15b): what used to sit under the page as a "Signed in as" footer and an "Add to Home Screen" link,
// and the embedded page's top padding. It lives on the More tab until card 23 gives that tab its real layout.

export interface Account { email: string; onSignOut?: () => void }

/** Card 25: the desktop app's own switches. Style, monitor and launch at startup also live in the tray menu. */
function DesktopSettings(): Node[] {
  const style = h('button', { type: 'button', class: 'set-btn' })
  const start = h('button', { type: 'button', class: 'set-btn' })
  const mon = h('button', { type: 'button', class: 'set-btn' })
  let st: DesktopState | null = { style: 'notch', monitor: null, monitors: [], paused: false, autostart: false }
  const paint = () => {
    if (!st) return
    style.textContent = st.style === 'notch' ? 'Notch' : 'Island'
    start.textContent = st.autostart ? 'On' : 'Off'
    mon.textContent = st.monitor ?? 'Main screen'
  }
  const refresh = () => void bridge.state().then((v) => { if (v) { st = v; paint() } })
  style.addEventListener('click', () => { if (st) { bridge.setStyle(st.style === 'notch' ? 'island' : 'notch'); st = { ...st, style: st.style === 'notch' ? 'island' : 'notch' }; paint() } })
  start.addEventListener('click', () => { if (st) { bridge.setAutostart(!st.autostart); st = { ...st, autostart: !st.autostart }; paint() } })
  mon.addEventListener('click', () => {
    if (!st) return
    const all: (string | null)[] = [null, ...st.monitors]
    const next = all[(all.indexOf(st.monitor) + 1) % all.length]
    bridge.setMonitor(next)
    st = { ...st, monitor: next }
    paint()
  })
  paint()
  refresh()
  const row = (k: string, v: Node) => h('div', { class: 'set-row' }, h('span', { class: 'set-k' }, k), v)
  return [row('Style', style), row('Screen', mon), row('Launch at startup', start), row('Halo app', h('button', { type: 'button', class: 'set-btn', onclick: () => bridge.quit() }, 'Quit'))]
}

export function SettingsPanel(o: { account?: Account; embed: boolean; onSignOut: () => void }): HTMLElement {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const rows: (Node | null)[] = [
    o.account?.email ? h('div', { class: 'set-row wide' }, h('span', { class: 'set-k' }, 'Signed in as'), h('span', { class: 'set-v' }, o.account.email)) : null,
    !standalone && !o.embed && !isDesktop() ? h('div', { class: 'set-row' }, h('span', { class: 'set-k' }, 'Halo on your iPhone'), h('a', { class: 'set-link', href: `${import.meta.env.BASE_URL}install/` }, 'Add to Home Screen')) : null,
    o.embed ? h('div', { class: 'set-row' }, EmbedSettings()) : null,
    ...(isDesktop() ? DesktopSettings() : []),
    h('div', { class: 'set-row wide' }, h('span', { class: 'set-k' }, 'Account'), h('button', { type: 'button', class: 'set-btn', onclick: () => (o.account?.onSignOut ?? o.onSignOut)() }, 'Sign out')),
  ]
  return h('div', { class: `set-panel${isDesktop() ? ' desk' : ''}`, 'data-tab': 'more' }, ...(rows.filter(Boolean) as Node[]))
}
