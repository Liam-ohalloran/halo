import type { Backend, StudySession } from '../types'
import { fmtClock, fmtMinutes, startOfDay } from '../time'
import { emptyState, errorState, friendlyError, h, icon, onTick, setText, skeleton, svg, toast } from '../ui'
import { subjectHue } from './now'

const DEFAULT_SUBJECTS = ['Chemistry', 'Human Biology', 'Methods', 'Specialist', 'English', 'Religion & Life']
const TARGETS = [25, 45, 60]
const R = 52
const C = 2 * Math.PI * R

const pref = {
  get(k: string) {
    try { return localStorage.getItem('halo.' + k) } catch { return null }
  },
  set(k: string, v: string) {
    try { localStorage.setItem('halo.' + k, v) } catch { /* private mode */ }
  },
}

export function mountStudy(root: HTMLElement, api: Backend): () => void {
  let alive = true
  let stopTick: (() => void) | null = null
  let active: StudySession | null = null
  let subject = pref.get('subject') ?? DEFAULT_SUBJECTS[0]
  let target = Number(pref.get('target')) || 25
  let busy = false

  const top = h('div', { class: 'slot' }, skeleton(1, true))
  const today = h('div', { class: 'slot' }, skeleton(2))
  root.replaceChildren(h('div', { class: 'stack' }, top, today))

  async function load() {
    top.replaceChildren(skeleton(1, true))
    today.replaceChildren(skeleton(2))
    try {
      const [act, subs] = await Promise.all([api.activeSession(), api.subjects()])
      if (!alive) return
      active = act
      if (act) subject = act.subject
      renderTimer([...new Set([...subs, ...DEFAULT_SUBJECTS])])
    } catch (e) {
      if (!alive) return
      top.replaceChildren(errorState((e as Error).message, load))
      today.replaceChildren()
      return
    }
    loadToday()
  }

  async function loadToday() {
    try {
      const rows = await api.sessionsSince(startOfDay(new Date()))
      if (!alive) return
      renderToday(rows)
    } catch (e) {
      if (!alive) return
      today.replaceChildren(errorState((e as Error).message, loadToday))
    }
  }

  function renderTimer(subjects: string[]) {
    stopTick?.()
    const arc = svg('circle', { cx: 60, cy: 60, r: R, class: 'ring-arc', 'stroke-dasharray': C, 'stroke-dashoffset': C })
    const clock = h('div', { class: 'ring-clock' }, '00:00')
    const caption = h('div', { class: 'ring-cap' })
    const ring = h('div', { class: 'ring' },
      svg('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' }, svg('circle', { cx: 60, cy: 60, r: R, class: 'ring-track' }), arc),
      h('div', { class: 'ring-text' }, clock, caption),
    )

    const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Subject' },
      ...subjects.map((s) =>
        h('button', {
          class: 'chip pick', role: 'radio', 'aria-checked': String(s === subject), style: `--hue:${subjectHue(s)}`,
          onclick: (e: Event) => {
            if (active) return toast('Stop the timer to switch subject', 'err')
            subject = s
            pref.set('subject', s)
            chips.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)))
            card.style.setProperty('--hue', String(subjectHue(s)))
          },
        }, s),
      ),
    )

    const targets = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Focus length' },
      ...TARGETS.map((t) =>
        h('button', {
          role: 'radio', 'aria-checked': String(t === target),
          onclick: (e: Event) => {
            target = t
            pref.set('target', String(t))
            targets.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)))
          },
        }, `${t}m`),
      ),
    )

    const btn = h('button', { class: 'btn primary', onclick: toggle })
    const card = h('section', { class: 'card pop study', style: `--hue:${subjectHue(subject)}`, 'aria-label': 'Focus timer' },
      chips,
      h('div', { class: 'study-row' }, ring, h('div', { class: 'study-side' }, targets, btn)),
    )
    top.replaceChildren(card)

    const paint = () => {
      tick(Date.now())
      card.classList.toggle('running', !!active)
      btn.replaceChildren(icon(active ? 'stop' : 'play', 14), active ? 'Stop & log' : 'Start focus')
      targets.classList.toggle('locked', !!active)
      chips.classList.toggle('locked', !!active)
    }
    function tick(now: number) {
      const ms = active ? now - new Date(active.started_at).getTime() : 0
      const goal = target * 60_000
      setText(clock, fmtClock(ms))
      setText(caption, active ? (ms >= goal ? 'Goal hit · keep going' : `${active.subject}`) : `${target} min goal`)
      arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, ms / goal))))
      arc.style.opacity = ms > 0 ? '1' : '0'
      card.classList.toggle('done', ms >= goal)
    }
    paint()
    stopTick = onTick(tick)

    async function toggle() {
      if (busy) return
      busy = true
      btn.setAttribute('aria-busy', 'true')
      try {
        if (active) {
          const s = await api.stopSession(active.id)
          active = null
          toast(s.minutes ? `Logged ${fmtMinutes(s.minutes)} of ${s.subject}` : `Logged under a minute of ${s.subject}`)
          loadToday()
        } else {
          active = await api.startSession(subject)
        }
      } catch (e) {
        toast(friendlyError((e as Error).message), 'err')
      } finally {
        busy = false
        btn.removeAttribute('aria-busy')
        if (alive) paint()
      }
    }
  }

  function renderToday(rows: StudySession[]) {
    if (!rows.length) {
      today.replaceChildren(emptyState('study', 'No focus logged today', 'Pick a subject and hit start. Every session counts.'))
      return
    }
    const by = new Map<string, number>()
    for (const r of rows) by.set(r.subject, (by.get(r.subject) ?? 0) + (r.minutes ?? 0))
    const total = [...by.values()].reduce((a, b) => a + b, 0)
    const sorted = [...by].sort((a, b) => b[1] - a[1])
    today.replaceChildren(
      h('section', { class: 'card pop' },
        h('header', { class: 'card-head' },
          h('span', { class: 'chip' }, icon('study', 13), 'Today'),
          h('span', { class: 'eyebrow' }, `${rows.length} session${rows.length === 1 ? '' : 's'}`),
        ),
        h('div', { class: 'big-money' }, fmtMinutes(total)),
        h('div', { class: 'split' },
          ...sorted.map(([s, m]) =>
            h('span', { style: `--hue:${subjectHue(s)};flex:${Math.max(m, 1)}`, title: `${s} ${fmtMinutes(m)}` }),
          ),
        ),
        h('ul', { class: 'legend' },
          ...sorted.slice(0, 4).map(([s, m]) => h('li', { style: `--hue:${subjectHue(s)}` }, h('span', {}, s), h('b', {}, fmtMinutes(m)))),
        ),
      ),
    )
  }

  load()
  return () => {
    alive = false
    stopTick?.()
  }
}
