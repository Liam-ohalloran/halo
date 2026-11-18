import { h } from './dom'

// Chip for subjects, coloured by subject (HALO.md 3.2). aria-pressed marks the selected state.

export type Subject = 'hb' | 'chem' | 'meth' | 'spec' | 'english' | 'religion'
export const SUBJECTS: Record<Subject, string> = { hb: 'Human Bio', chem: 'Chemistry', meth: 'Methods', spec: 'Specialist', english: 'English', religion: 'Religion' }

export interface ChipOptions { label?: string; subject: Subject; pressed?: boolean; disabled?: boolean; onToggle?: (pressed: boolean) => void }
export interface ChipHandle extends HTMLButtonElement { setPressed(p: boolean): void }

export function Chip(o: ChipOptions): ChipHandle {
  const el = h('button', { type: 'button', class: `h-chip ${o.subject}`, 'aria-pressed': String(!!o.pressed), disabled: !!o.disabled }, o.label ?? SUBJECTS[o.subject]) as ChipHandle
  el.addEventListener('click', () => {
    const p = el.getAttribute('aria-pressed') !== 'true'
    el.setAttribute('aria-pressed', String(p))
    o.onToggle?.(p)
  })
  el.setPressed = (p) => el.setAttribute('aria-pressed', String(p))
  return el
}
