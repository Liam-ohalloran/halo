import { h } from './dom'

// Slider: track 6, thumb 22 white, 26 while dragging. A native range input, so arrow keys,
// Home, End and Page keys all work for free.

export interface SliderOptions { value?: number; min?: number; max?: number; step?: number; label: string; disabled?: boolean; onInput?: (v: number) => void }
export interface SliderHandle extends HTMLInputElement { setValue(v: number): void }

export function Slider(o: SliderOptions): SliderHandle {
  const min = o.min ?? 0
  const max = o.max ?? 100
  const el = h('input', { type: 'range', class: 'h-sld', min, max, step: o.step ?? 1, value: o.value ?? 40, 'aria-label': o.label, disabled: !!o.disabled }) as SliderHandle
  const paint = () => el.style.setProperty('--v', `${((Number(el.value) - min) / (max - min)) * 100}%`)
  paint()
  el.addEventListener('input', () => { paint(); o.onInput?.(Number(el.value)) })
  el.addEventListener('pointerdown', () => el.classList.add('is-dragging'))
  const end = () => el.classList.remove('is-dragging')
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
  el.addEventListener('blur', end)
  el.setValue = (v) => { el.value = String(v); paint() }
  return el
}
