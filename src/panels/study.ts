import '../components/components.css'
import './study.css'
import type { Backend } from '../types'
import { Button, Chip, EmptyState, ErrorState, Icon, NumberRoll, RingProgress, Skeleton } from '../components'
import { h } from '../components/dom'
import {
  SUBJECT_LIST, shortSubject, subjectKey, summariseWeek, type SubjectKey, type SubjectWeek, type WeekSummary,
} from '../lib/study'
import { fmtClock, fmtMinutes } from '../time'
import { TARGET_MIN, plainError, view, type StudyTimerHandle } from './studyTimer'

// Study panel (card 08): subject chips, the 25 minute ring timer, and this week's minutes per subject.
// Colour comes only from the subject (HALO.md 3.2). Numbers roll. Every state has a design.

export const ICONS_NEEDED = ['play', 'pause', 'arrow-clockwise', 'warning-circle', 'check', 'book-open', 'wifi-slash']

const hue = (key: SubjectKey | null) => (key ? `var(--${key})` : 'var(--text-2)')
const daysText = (d: number) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`)
const MAX_BARS = 4

export interface StudyPanelHandle extends HTMLDivElement {
  /** Re-read this week from Supabase, for example after a session is logged. */
  refreshWeek(): void
  destroy(): void
}

export function StudyPanel(api: Backend, timer: StudyTimerHandle, onResize: () => void = () => {}): StudyPanelHandle {
  let alive = true

  // ---- Chips
  const chips = new Map<string, ReturnType<typeof Chip>>()
  const chipRow = h('div', { class: 's-chips', role: 'group', 'aria-label': 'Subject' })
  for (const s of SUBJECT_LIST) {
    const c = Chip({
      subject: s.key,
      label: s.name,
      pressed: s.name === timer.state.subject,
      onToggle: () => timer.setSubject(s.name),
    })
    chips.set(s.name, c)
    chipRow.append(c)
  }
  // A subject started elsewhere may not be one of the six. Add it so it is visible.
  const ensureChip = (name: string) => {
    if (chips.has(name)) return
    const k = subjectKey(name)
    const c = Chip({ subject: k ?? 'hb', label: name, pressed: true, onToggle: () => timer.setSubject(name) })
    if (!k) c.style.setProperty('--c', 'var(--text-2)')
    chips.set(name, c)
    chipRow.append(c)
  }

  // ---- Timer
  const ring = RingProgress({ size: 112, stroke: 10, value: 0, text: fmtClock(TARGET_MIN * 60_000), label: 'Focus timer' })
  ring.classList.add('s-ring')
  const kicker = h('span', { class: 'label' }, 'FOCUS SESSION')
  const subjectName = h('div', { class: 's-subject' })
  const statusLine = h('div', { class: 's-status' })
  const startBtn = Button({ label: 'Start', kind: 'primary', size: 44, icon: 'play', onClick: () => void timer.start() })
  const pauseBtn = Button({ label: 'Pause', kind: 'secondary', size: 44, icon: 'pause', onClick: () => timer.pause() })
  const resumeBtn = Button({ label: 'Resume', kind: 'primary', size: 44, icon: 'play', onClick: () => timer.resume() })
  const resetBtn = Button({ label: 'Reset', kind: 'secondary', size: 44, icon: 'arrow-clockwise', onClick: () => void timer.reset() })
  const buttons = h('div', { class: 's-btns' }, startBtn, pauseBtn, resumeBtn, resetBtn)
  const note = h('div', { class: 's-note', role: 'status', 'aria-live': 'polite' })
  const timerCard = h('section', { class: 's-timer', 'aria-label': 'Focus timer' }, ring, h('div', { class: 's-side' }, kicker, subjectName, statusLine), buttons, note)

  let noteTimer: number | undefined
  const say = (text: string, bad = false) => {
    note.textContent = text
    note.classList.toggle('bad', bad)
    clearTimeout(noteTimer)
    if (text) noteTimer = window.setTimeout(() => { note.textContent = '' }, 6000)
  }

  let lastText = ''
  function paint(now: number) {
    const s = timer.state
    ensureChip(s.subject)
    const { value, left } = view(s, now)
    const text = fmtClock(s.status === 'idle' ? s.targetMs : left)
    // Seconds precision is plenty. Only touch the DOM when the visible text changes.
    if (text !== lastText) { ring.setValue(value, text); lastText = text }
    const key = subjectKey(s.subject)
    timerCard.style.setProperty('--c', hue(key))
    ring.style.setProperty('--c', hue(key))
    subjectName.textContent = s.subject
    statusLine.textContent = timer.busy ? (s.status === 'idle' ? 'Starting' : 'Logging') : s.status === 'idle' ? `${TARGET_MIN} minute focus` : s.status === 'running' ? 'Focusing' : 'Paused'
    startBtn.hidden = s.status !== 'idle'
    pauseBtn.hidden = s.status !== 'running'
    resumeBtn.hidden = s.status !== 'paused'
    resetBtn.hidden = s.status === 'idle'
    for (const b of [startBtn, pauseBtn, resumeBtn, resetBtn]) b.disabled = timer.busy || !timer.ready
    for (const [name, c] of chips) {
      c.setPressed(name === s.subject)
      c.disabled = s.status !== 'idle' && name !== s.subject
    }
    ring.setAttribute('aria-label', `Focus timer, ${s.status === 'idle' ? 'ready' : s.status}`)
  }
  const unsub = timer.subscribe(paint)
  timer.onError((m) => say(m, true))
  timer.onLogged((row, kind) => {
    const mins = row.minutes ?? 0
    say(kind === 'done' ? `Goal hit. Logged ${fmtMinutes(mins)} of ${row.subject}.` : mins > 0 ? `Logged ${fmtMinutes(mins)} of ${row.subject}.` : `Under a minute of ${row.subject}, so nothing to log.`)
    loadWeek()
  })

  // ---- This week
  const weekHead = h('header', { class: 's-weekhead' }, h('span', { class: 'label' }, 'THIS WEEK'))
  const weekBody = h('div', { class: 's-weekbody' })
  const week = h('section', { class: 's-week', 'aria-label': 'This week' }, weekHead, weekBody)

  const barsSkeleton = () => h('div', { class: 's-skel' }, ...[70, 45, 30].map((w) => h('div', { class: 's-skelrow' }, Skeleton({ width: 84, height: 13 }), Skeleton({ height: 10, width: `${w}%`, radius: 5 }))))

  let gen = 0
  async function loadWeek() {
    const mine = ++gen
    weekBody.replaceChildren(barsSkeleton())
    onResize()
    try {
      const now = new Date()
      const [sessions, tests] = await Promise.all([api.sessionsSince(new Date(now.getTime() - 8 * 864e5)), api.upcomingTests(now)])
      if (!alive || mine !== gen) return
      renderWeek(summariseWeek(sessions, tests, now))
    } catch (e) {
      if (!alive || mine !== gen) return
      const offline = !navigator.onLine
      weekBody.replaceChildren(ErrorState({ kind: offline ? 'offline' : 'error', message: offline ? undefined : plainError(e), onRetry: loadWeek }))
    }
    onResize()
  }

  function bar(s: SubjectWeek, scale: number, flagged: boolean): HTMLElement {
    const fill = h('span', { class: 's-fill' })
    fill.style.width = `${Math.min(100, (s.minutes / scale) * 100)}%`
    const track = h('span', { class: 's-track', role: 'img', 'aria-label': `${s.subject}, ${s.minutes} minutes${s.goal ? ` of ${s.goal} wanted` : ''}` }, fill)
    if (s.goal != null) {
      const tick = h('span', { class: 's-goal' })
      tick.style.left = `${Math.min(100, (s.goal / scale) * 100)}%`
      track.append(tick)
    }
    const row = h('div', { class: `s-bar${flagged ? ' flag' : ''}`, style: `--c:${hue(s.key)}` },
      h('span', { class: 's-bname' }, h('i', { 'aria-hidden': 'true' }), s.key ? shortSubject(s.subject) : s.subject),
      track,
      h('span', { class: 's-mins' }, fmtMinutes(s.minutes)))
    return row
  }

  function renderWeek(w: WeekSummary) {
    const total = NumberRoll({ value: fmtMinutes(w.totalMinutes) })
    weekHead.replaceChildren(h('span', { class: 'label' }, 'THIS WEEK'), h('span', { class: 's-total' }, total))
    const shown = w.subjects.filter((s) => s.minutes > 0 || s.goal != null)
    if (!shown.length) {
      weekBody.replaceChildren(EmptyState({ icon: 'book-open', title: 'No study yet this week', body: 'Pick a subject and start a focus session.' }))
      return
    }
    // Top four by minutes, but the subject furthest behind is always shown.
    let list = shown.slice(0, MAX_BARS)
    if (w.behind && !list.includes(w.behind)) list = [...list.slice(0, MAX_BARS - 1), w.behind]
    const scale = Math.max(60, ...list.map((s) => Math.max(s.minutes, s.goal ?? 0)))
    const bars = h('div', { class: 's-bars' }, ...list.map((s) => bar(s, scale, s === w.behind)))

    const hasTests = w.subjects.some((s) => s.goal != null)
    let callout: HTMLElement | null = null
    if (w.behind) {
      const b = w.behind
      callout = h('div', { class: 's-callout', style: `--c:${hue(b.key)}` }, Icon('warning-circle', 'fill', 18),
        h('span', {}, h('b', {}, `${b.subject} is furthest behind. `), `${fmtMinutes(b.deficit)} to go before the test ${daysText(b.daysToTest ?? 0)}.`))
    } else if (hasTests) {
      callout = h('div', { class: 's-callout ok' }, Icon('check', 'fill', 18), h('span', {}, 'On track for every test coming up.'))
    }
    weekBody.replaceChildren(bars, ...(callout ? [callout] : []))
  }

  // ---- Assemble
  const root = h('div', { class: 's-panel' }, chipRow, h('div', { class: 's-grid' }, timerCard, week)) as StudyPanelHandle
  // The island toggles open and closed on any click or Enter inside it. Keep presses on this panel's controls to themselves.
  // Escape still bubbles up so it closes the island.
  root.addEventListener('click', (e) => e.stopPropagation())
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() })
  root.refreshWeek = () => void loadWeek()
  root.destroy = () => { alive = false; unsub(); clearTimeout(noteTimer) }
  paint(Date.now())
  void loadWeek()
  return root
}
