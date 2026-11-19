import '../components/components.css'
import './now.css'
import { h } from '../components/dom'
import { EmptyState, ErrorState, Icon, NumberRoll, RingProgress, Skeleton, SUBJECTS, type NumberRollHandle, type RingHandle } from '../components'
import type { NowData } from '../lib/now'
import {
  buildTimeline, fmtClockPm, fmtDayLabel, fmtDayMonth, fmtStudy, shiftView, testView,
  type ShiftView, type TimelineItem, type TestView,
} from '../lib/now-model'

// The expanded Now view (HALO.md 3.1e tab 1): next shift, next test, today's timeline.
// Built from library parts only. Two columns when the island is wide (NotchPixel), one column on a phone.

export const SHIFT_COLOUR = '#FF9F0A'
const MAX_ROWS = 3

export interface NowPanelHandle {
  el: HTMLDivElement
  showLoading(): void
  showError(offline: boolean, retry: () => void): void
  /** Build the ready view from data. */
  render(data: NowData, now: Date, travelMinutes: number): void
  /** Cheap per second update. Rebuilds only when something changes shape. */
  tick(now: Date, travelMinutes: number): void
}

const label = (t: string) => h('span', { class: 'label' }, t)
const subjectVar = (k: string | null) => (k === 'hb' ? 'var(--hb)' : k === 'chem' ? 'var(--chem)' : k === 'meth' ? 'var(--meth)' : k === 'spec' ? 'var(--spec)' : k === 'english' ? 'var(--english)' : k === 'religion' ? 'var(--religion)' : 'var(--text-2)')

export function NowPanel(): NowPanelHandle {
  const el = h('div', { class: 'n-panel', 'data-view': 'loading' })
  let data: NowData | null = null

  // Live bits, replaced on every full render.
  let ring: RingHandle | null = null
  let roll: NumberRollHandle | null = null
  let headline: HTMLElement | null = null
  let leave: HTMLElement | null = null
  let shiftPhase = ''
  let todayKey = ''
  let todayDay = ''

  // ---- Pieces --------------------------------------------------------------

  function skeletonView(): HTMLElement[] {
    const card = (kids: Node[]) => h('section', { class: 'n-card', role: 'status', 'aria-label': 'Loading' }, ...kids)
    return [
      h('div', { class: 'n-left' },
        card([Skeleton({ height: 11, width: 72 }), h('div', { class: 'n-row' }, Skeleton({ circle: true, height: 72 }), h('div', { class: 'n-skel-col' }, Skeleton({ height: 17, width: '80%' }), Skeleton({ height: 13, width: '60%' }), Skeleton({ height: 13, width: '45%' })))]),
        card([Skeleton({ height: 11, width: 72 }), Skeleton({ height: 24, width: '50%', radius: 12 }), Skeleton({ height: 17, width: '85%' }), Skeleton({ height: 13, width: '55%' })])),
      card([Skeleton({ height: 11, width: 56 }), ...[0, 1, 2].map(() => h('div', { class: 'n-skel-row' }, Skeleton({ height: 13, width: 44 }), Skeleton({ height: 13, width: '60%' })))]),
    ]
  }

  function shiftCard(sv: ShiftView | null): HTMLElement {
    ring = null; roll = null; headline = null; leave = null
    if (!sv) {
      return h('section', { class: 'n-card n-empty', 'aria-label': 'Next shift' }, label('NEXT SHIFT'),
        h('div', { class: 'n-none' }, Icon('briefcase', 'regular', 22), h('div', { class: 'n-none-t' }, 'No shifts coming up'), h('div', { class: 'n-none-b' }, 'New shifts show here after the next sync.')))
    }
    const live = sv.phase === 'live'
    shiftPhase = sv.phase
    ring = RingProgress({ size: 64, stroke: 6, colour: SHIFT_COLOUR, value: sv.ring, label: live ? 'Time left on your shift' : 'Time until your shift' })
    roll = NumberRoll({ value: sv.countdown, label: live ? 'Time left' : 'Time until' })
    ring.querySelector('.h-ring-txt')!.append(roll)
    headline = h('div', { class: 'n-when' }, whenText(sv, new Date(nowMs)))
    leave = h('div', { class: 'n-leave', 'data-phase': sv.phase }, leaveText(sv))
    return h('section', { class: 'n-card', 'aria-label': live ? 'Current shift' : 'Next shift' },
      label(live ? 'ON SHIFT' : 'NEXT SHIFT'),
      h('div', { class: 'n-row' }, ring,
        h('div', { class: 'n-col' }, h('div', { class: 'n-title' }, sv.shift.title), headline, leave)))
  }
  const whenText = (sv: ShiftView, now: Date): string =>
    sv.phase === 'live' ? `Finishes at ${fmtClockPm(sv.end)}` : `${fmtDayLabel(now, sv.start)}, ${fmtClockPm(sv.start)}`
  const leaveText = (sv: ShiftView): string => {
    if (sv.phase === 'live') return `Started at ${fmtClockPm(sv.start)}`
    return nowMs >= sv.leaveBy ? 'Leave now' : `Leave by ${fmtClockPm(sv.leaveBy)}`
  }
  let nowMs = Date.now()
  function testCard(tv: TestView | null): HTMLElement {
    if (!tv) {
      return h('section', { class: 'n-card n-empty', 'aria-label': 'Next test' }, label('NEXT TEST'),
        h('div', { class: 'n-none' }, Icon('exam', 'regular', 22), h('div', { class: 'n-none-t' }, 'No tests coming up')))
    }
    const name = tv.subject ? SUBJECTS[tv.subject] : tv.test.subject
    const chip = h('span', { class: `h-chip n-chip ${tv.subject ?? ''}`, style: tv.subject ? null : '--c: var(--text-2)' }, name)
    const days = tv.daysLeft === 0
      ? h('span', { class: 'n-days' }, h('b', {}, 'Today'))
      : h('span', { class: 'n-days' }, h('b', {}, NumberRoll({ value: String(tv.daysLeft), label: 'Days left' })), ` ${tv.daysLeft === 1 ? 'day' : 'days'} left`)
    return h('section', { class: 'n-card', 'aria-label': 'Next test' },
      h('div', { class: 'n-row between' }, label('NEXT TEST'), days),
      h('div', { class: 'n-tline' }, chip, h('div', { class: 'n-title' }, tv.test.title)),
      h('div', { class: 'n-when' }, `${tv.when}, ${fmtClockPm(new Date(tv.test.due_at))}`),
      h('div', { class: 'n-study' }, Icon('book-open', 'regular', 15), tv.studyMinutes > 0 ? `${fmtStudy(tv.studyMinutes)} studied this week` : 'No study logged this week'))
  }

  function row(it: TimelineItem): HTMLElement {
    const colour = it.kind === 'shift' ? 'var(--shift)' : it.kind === 'study' ? 'var(--study)' : subjectVar(it.subject)
    return h('li', { class: 'n-trow', 'data-status': it.status, 'data-kind': it.kind, style: `--c:${colour}`, 'aria-current': it.status === 'now' ? 'true' : null },
      h('span', { class: 'n-time' }, fmtClockPm(it.at)),
      h('span', { class: 'n-dot', 'aria-hidden': 'true' }),
      h('div', { class: 'n-tcol' }, h('div', { class: 'n-ttl' }, it.title), h('div', { class: 'n-sub' }, it.sub)))
  }

  function todayCard(items: TimelineItem[], now: Date): HTMLElement {
    const shown = items.slice(0, MAX_ROWS)
    const more = items.length - shown.length
    const body = items.length
      ? h('ul', { class: 'n-list' }, ...shown.map(row))
      : h('div', { class: 'n-none' }, Icon('check', 'regular', 22), h('div', { class: 'n-none-t' }, 'Nothing on today'))
    return h('section', { class: `n-card n-today${items.length ? '' : ' n-empty'}`, 'aria-label': 'Today' },
      h('div', { class: 'n-row between' }, label('TODAY'), h('span', { class: 'n-date' }, fmtDayMonth(now))),
      body,
      more > 0 ? h('div', { class: 'n-more' }, `+${more} more`) : null)
  }

  const keyOf = (items: TimelineItem[]) => items.map((i) => `${i.id}:${i.status}`).join('|')

  // ---- Public --------------------------------------------------------------

  function set(view: string, kids: Node[]) {
    el.dataset.view = view
    el.replaceChildren(...kids)
  }

  function showLoading() {
    data = null
    set('loading', skeletonView())
  }

  function showError(offline: boolean, retry: () => void) {
    data = null
    set('error', [h('div', { class: 'n-wide' }, ErrorState({ kind: offline ? 'offline' : 'error', onRetry: retry }))])
  }

  function render(d: NowData, now: Date, travelMinutes: number) {
    data = d
    nowMs = now.getTime()
    const sv = d.shift ? shiftView(d.shift, now, travelMinutes) : null
    const tv = d.test ? testView(d.test, d.weekSessions, now) : null
    const items = buildTimeline(d.today, now)
    if (!sv && !tv && !items.length) {
      ring = roll = headline = leave = null
      set('empty', [h('div', { class: 'n-wide' }, EmptyState({ icon: 'check', title: 'All clear', body: 'No shifts, tests or study today, and nothing booked soon.' }))])
      return
    }
    const today = todayCard(items, now)
    todayKey = keyOf(items)
    todayDay = fmtDayMonth(now)
    set('ready', [h('div', { class: 'n-left' }, shiftCard(sv), testCard(tv)), today])
  }

  function tick(now: Date, travelMinutes: number) {
    if (!data || el.dataset.view !== 'ready') return
    nowMs = now.getTime()
    const items = buildTimeline(data.today, now)
    const sv = data.shift ? shiftView(data.shift, now, travelMinutes) : null
    // A shift that goes from upcoming to live changes the whole card. Today's rows change status over time.
    if ((sv && sv.phase !== shiftPhase) || keyOf(items) !== todayKey || fmtDayMonth(now) !== todayDay) {
      render(data, now, travelMinutes)
      return
    }
    if (sv && ring && roll && headline && leave) {
      ring.setValue(sv.ring)
      roll.set(sv.countdown)
      const w = whenText(sv, now)
      if (headline.textContent !== w) headline.textContent = w
      const l = leaveText(sv)
      if (leave.textContent !== l) leave.textContent = l
    }
  }

  showLoading()
  return { el, showLoading, showError, render, tick }
}
