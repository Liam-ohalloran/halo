import type { Backend, Shift, Test } from '../types'
import { countdownParts, fmtTime, fmtWhen } from '../time'
import { emptyState, errorState, h, icon, onTick, setText, skeleton } from '../ui'

// Distinct hues that still sit well on the purple glass.
const PALETTE = [268, 322, 205, 160, 32, 292, 350, 185]
const KNOWN: Record<string, number> = {
  chemistry: 322, 'human biology': 160, methods: 268, specialist: 205, english: 32, 'religion & life': 350,
}
export function subjectHue(subject: string): number {
  const k = subject.toLowerCase().trim()
  if (KNOWN[k] != null) return KNOWN[k]
  let x = 0
  for (const c of k) x = (x * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[x % PALETTE.length]
}

function countdown(): { el: HTMLElement; set: (ms: number) => void } {
  const el = h('div', { class: 'count' })
  const set = (ms: number) => {
    const parts = countdownParts(ms)
    if (el.childElementCount !== parts.length * 2) {
      el.replaceChildren(...parts.flatMap(([n, u]) => [h('b', {}, n), h('i', {}, u)]))
      return
    }
    parts.forEach(([n, u], i) => {
      setText(el.children[i * 2], n, true)
      setText(el.children[i * 2 + 1], u)
    })
  }
  return { el, set }
}

function shiftCard(s: Shift, cleanups: (() => void)[], onEnded: () => void): HTMLElement {
  const start = new Date(s.starts_at).getTime()
  const end = new Date(s.ends_at).getTime()
  const label = h('span', { class: 'eyebrow' })
  const cd = countdown()
  const sub = h('div', { class: 'meta' })
  const bar = h('div', { class: 'bar' }, h('span'))
  const card = h(
    'section',
    { class: 'card pop', 'aria-label': 'Next shift' },
    h('header', { class: 'card-head' }, h('span', { class: 'chip' }, icon('shift', 13), 'Shift'), label),
    h('div', { class: 'card-row' },
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, s.title),
        h('div', { class: 'meta' }, [s.station, `${fmtTime(new Date(start))}–${fmtTime(new Date(end))}`].filter(Boolean).join(' · ')),
      ),
      cd.el,
    ),
    sub,
    bar,
  )
  if (s.is_public_holiday) card.querySelector('.card-head')!.append(h('span', { class: 'chip hot' }, 'Public holiday'))

  cleanups.push(
    onTick((now) => {
      if (now >= end) return onEnded()
      const live = now >= start
      card.classList.toggle('live', live)
      setText(label, live ? 'On shift now' : 'Next shift')
      cd.set(live ? end - now : start - now)
      setText(sub, live ? 'until you finish' : fmtWhen(new Date(start)))
      bar.hidden = !live
      if (live) (bar.firstChild as HTMLElement).style.transform = `scaleX(${(now - start) / (end - start)})`
    }),
  )
  return card
}

function testCard(t: Test, cleanups: (() => void)[], onPassed: () => void): HTMLElement {
  const due = new Date(t.due_at).getTime()
  const cd = countdown()
  const when = h('div', { class: 'meta' })
  const card = h(
    'section',
    { class: 'card pop', style: `--hue:${subjectHue(t.subject)}`, 'aria-label': 'Next test' },
    h('header', { class: 'card-head' },
      h('span', { class: 'chip subj' }, icon('test', 13), t.subject),
      h('span', { class: 'eyebrow' }, 'Next test'),
    ),
    h('div', { class: 'card-row' },
      h('div', { class: 'grow' }, h('div', { class: 'title' }, t.title), when),
      cd.el,
    ),
  )
  cleanups.push(
    onTick((now) => {
      if (now >= due) return onPassed()
      cd.set(due - now)
      setText(when, fmtWhen(new Date(due)))
      card.classList.toggle('urgent', due - now < 48 * 36e5)
    }),
  )
  return card
}

export function mountNow(root: HTMLElement, api: Backend, subscribe: (cb: () => void) => () => void): () => void {
  let cleanups: (() => void)[] = []
  let alive = true
  const shiftSlot = h('div', { class: 'slot' }, skeleton(2, true))
  const testSlot = h('div', { class: 'slot' }, skeleton(2, true))
  root.replaceChildren(h('div', { class: 'stack' }, shiftSlot, testSlot))

  const clear = () => {
    cleanups.forEach((f) => f())
    cleanups = []
  }

  async function load(showSkeleton = false) {
    if (!alive) return
    if (showSkeleton) {
      shiftSlot.replaceChildren(skeleton(2, true))
      testSlot.replaceChildren(skeleton(2, true))
    }
    const now = new Date()
    const [shift, test] = await Promise.allSettled([api.nextShift(now), api.nextTest(now)])
    if (!alive) return
    clear()
    const reload = () => load(true)
    if (shift.status === 'rejected' && test.status === 'rejected') {
      shiftSlot.replaceChildren(errorState(String(shift.reason?.message ?? shift.reason), reload))
      testSlot.replaceChildren()
      return
    }
    shiftSlot.replaceChildren(
      shift.status === 'rejected'
        ? errorState(String(shift.reason?.message ?? shift.reason), reload)
        : shift.value
          ? shiftCard(shift.value, cleanups, reload)
          : emptyState('shift', 'No shifts coming up', 'Your next shift will land here as soon as it syncs.'),
    )
    testSlot.replaceChildren(
      test.status === 'rejected'
        ? errorState(String(test.reason?.message ?? test.reason), reload)
        : test.value
          ? testCard(test.value, cleanups, reload)
          : emptyState('test', 'No tests on the radar', 'Nothing due. Enjoy it while it lasts.'),
    )
  }

  load()
  const unsub = subscribe(() => load())
  return () => {
    alive = false
    unsub()
    clear()
  }
}
