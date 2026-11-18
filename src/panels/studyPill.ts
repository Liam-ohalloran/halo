import { Icon } from '../components'
import { h } from '../components/dom'
import { shortSubject, subjectKey } from '../lib/study'
import { fmtClock } from '../time'
import { view, type StudyTimerHandle } from './studyTimer'

// Compact island content while a study session is on: subject on the left, time left on the right,
// both in the subject's colour (HALO.md 3.1: leading left, trailing right, balanced).
// Paused shows a pause glyph before the time. The island itself stays black, only the text is coloured.

export interface StudyPillHandle {
  nodes: Node[]
  /** The colour to tint the island key line and light spill with. */
  colour(): string
  destroy(): void
}

const HEX: Record<string, string> = {
  hb: '#FF6482', chem: '#BF5AF2', meth: '#0A84FF', spec: '#64D2FF', english: '#FFD60A', religion: '#AC8E68',
}
export const subjectHex = (name: string): string => HEX[subjectKey(name) ?? ''] ?? '#BF5AF2'

export function StudyPill(timer: StudyTimerHandle): StudyPillHandle {
  const name = h('span', { class: 's-pill-t' })
  const time = h('span', { class: 's-pill-n' })
  const pauseIc = Icon('pause', 'fill', 14)
  pauseIc.classList.add('s-pill-pause')
  const right = h('span', { class: 's-pill-r' }, pauseIc, time)
  let last = ''
  const paint = (now: number) => {
    const s = timer.state
    const v = `${s.subject}|${s.status}|${fmtClock(view(s, now).left)}`
    if (v === last) return
    last = v
    const c = `var(--${subjectKey(s.subject) ?? 'chem'})`
    name.textContent = shortSubject(s.subject)
    name.style.color = c
    time.textContent = fmtClock(view(s, now).left)
    time.style.color = c
    right.classList.toggle('paused', s.status === 'paused')
    right.setAttribute('aria-label', `${s.subject}, ${fmtClock(view(s, now).left)} left${s.status === 'paused' ? ', paused' : ''}`)
  }
  const unsub = timer.subscribe(paint)
  paint(Date.now())
  return { nodes: [name, right], colour: () => subjectHex(timer.state.subject), destroy: unsub }
}
