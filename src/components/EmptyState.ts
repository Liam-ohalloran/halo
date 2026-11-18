import { h } from './dom'
import { Icon } from './Icon'
import { Button } from './Button'

// EmptyState: never a blank box. A Phosphor icon, one plain sentence, an optional action.

export interface EmptyStateOptions {
  icon?: string
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState(o: EmptyStateOptions): HTMLDivElement {
  const el = h('div', { class: 'h-state' },
    h('div', { class: 'h-state-ic' }, Icon(o.icon ?? 'tray', 'regular', 28)),
    h('div', { class: 'h-state-title' }, o.title),
    o.body ? h('div', { class: 'h-state-body' }, o.body) : null,
  )
  if (o.action) el.append(Button({ label: o.action.label, kind: 'secondary', onClick: o.action.onClick }))
  return el
}
