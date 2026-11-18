import { h } from './dom'

// Toggle 51 x 31, on = --accent. A real button with role=switch, so Space and Enter work.

export interface ToggleOptions { checked?: boolean; label: string; disabled?: boolean; onChange?: (on: boolean) => void }
export interface ToggleHandle extends HTMLButtonElement { setChecked(on: boolean): void; readonly checked: boolean }

export function Toggle(o: ToggleOptions): ToggleHandle {
  const el = h('button', { type: 'button', class: 'h-tgl', role: 'switch', 'aria-checked': String(!!o.checked), 'aria-label': o.label, disabled: !!o.disabled }) as ToggleHandle
  const set = (on: boolean, emit: boolean) => {
    el.setAttribute('aria-checked', String(on))
    if (emit) o.onChange?.(on)
  }
  el.addEventListener('click', () => set(el.getAttribute('aria-checked') !== 'true', true))
  el.setChecked = (on) => set(on, false)
  Object.defineProperty(el, 'checked', { get: () => el.getAttribute('aria-checked') === 'true' })
  return el
}
