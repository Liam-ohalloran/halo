import { h } from './dom'
import { Icon } from './Icon'
import { Button } from './Button'

// ErrorState: one plain sentence and a Retry button. Raw error text is never shown (HALO.md 3.6).
// The offline kind is the same shape with its own icon and sentence.

export interface ErrorStateOptions {
  kind?: 'error' | 'offline'
  /** Override the sentence. Keep it short, plain, no dashes or semicolons. */
  message?: string
  onRetry: () => void
}

const COPY = {
  error: { icon: 'warning-circle', text: 'Something went wrong. Try again.' },
  offline: { icon: 'wifi-slash', text: 'You are offline. Halo will catch up when you are back.' },
} as const

export function ErrorState(o: ErrorStateOptions): HTMLDivElement {
  const c = COPY[o.kind ?? 'error']
  return h('div', { class: 'h-state', role: 'alert' },
    h('div', { class: 'h-state-ic err' }, Icon(c.icon, 'fill', 28)),
    h('div', { class: 'h-state-title' }, o.message ?? c.text),
    Button({ label: 'Retry', kind: 'primary', icon: 'arrow-clockwise', onClick: o.onRetry }),
  )
}
