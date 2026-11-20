import { h } from './dom'
import { EmbedSettings } from './EmbedShell'

// Settings (card 15b): what used to sit under the page as a "Signed in as" footer and an "Add to Home Screen" link,
// and the embedded page's top padding. It lives on the More tab until card 23 gives that tab its real layout.

export interface Account { email: string; onSignOut?: () => void }

export function SettingsPanel(o: { account?: Account; embed: boolean; onSignOut: () => void }): HTMLElement {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const rows: (Node | null)[] = [
    o.account?.email ? h('div', { class: 'set-row' }, h('span', { class: 'set-k' }, 'Signed in as'), h('span', { class: 'set-v' }, o.account.email)) : null,
    !standalone && !o.embed ? h('div', { class: 'set-row' }, h('span', { class: 'set-k' }, 'Halo on your iPhone'), h('a', { class: 'set-link', href: `${import.meta.env.BASE_URL}install/` }, 'Add to Home Screen')) : null,
    o.embed ? h('div', { class: 'set-row' }, EmbedSettings()) : null,
    h('div', { class: 'set-row' }, h('span', { class: 'set-k' }, 'Account'), h('button', { type: 'button', class: 'set-btn', onclick: () => (o.account?.onSignOut ?? o.onSignOut)() }, 'Sign out')),
  ]
  return h('div', { class: 'set-panel', 'data-tab': 'more' }, ...(rows.filter(Boolean) as Node[]))
}
