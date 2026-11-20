import '../styles/tokens.css'
import '../components/components.css'
import './pay.css'
import type { Backend, Settings, Shift } from '../types'
import { calcShift, calcWeek, perthWeekStart } from '../lib/pay'
import { EmptyState, ErrorState, IconButton, NumberRoll, Skeleton, preloadIcons } from '../components'
import { h } from '../components/dom'

// Pay panel (HALO.md section 4). All the maths lives in src/lib/pay.ts, this file only draws it.
// Layout: week switcher on top, then totals and a bar per day, with the shift list beside (wide) or below (phone).

const DAY = 864e5
const TZ = 'Australia/Perth'
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** The bar scale never drops below a full 8 hour day, so a short shift does not look like a big one. */
const MIN_SCALE_HOURS = 8

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const fmtMoney = (n: number) => money.format(n)
const fmtHours = (n: number) => String(Number(n.toFixed(2)))
const dayMonth = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'short' })
const dayLong = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
const fmtDayLong = (d: Date) => dayLong.format(d).replace(',', '')
const clock = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
const perthDay = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short' })
const fmtClock = (d: Date) => clock.format(d).replace(/\s/g, ' ').toLowerCase()
/** "5:30 pm to 9 pm": the minutes are dropped on the hour. */
const fmtSpan = (a: Date, b: Date) => `${fmtClock(a).replace(':00', '')} to ${fmtClock(b).replace(':00', '')}`

function weekLabel(offset: number): string {
  return offset === 0 ? 'This week' : offset === -1 ? 'Last week' : offset === 1 ? 'Next week' : 'Pay week'
}
function rangeLabel(start: Date): string {
  const last = new Date(start.getTime() + 6 * DAY)
  const a = dayMonth.format(start).split(' ')
  const b = dayMonth.format(last).split(' ')
  return a[1] === b[1] ? `${a[0]} to ${b[0]} ${b[1]}` : `${a.join(' ')} to ${b.join(' ')}`
}

const slot = (label: string, value: HTMLElement, cls = '') =>
  h('div', { class: `pay-stat ${cls}` }, h('span', { class: 'label' }, label), value)

/** maxShifts: show this many shifts, then "+N more" (the 600 x 290 window never scrolls). */
export function mountPay(root: HTMLElement, api: Backend, subscribe: (cb: () => void) => () => void, opts: { maxShifts?: number } = {}): () => void {
  let offset = 0
  let alive = true
  let seq = 0
  let built = false

  const grossRoll = NumberRoll({ value: '$0.00', label: 'Gross' })
  const hoursRoll = NumberRoll({ value: '0', label: 'Hours' })
  const netRoll = NumberRoll({ value: '$0.00', label: 'After tax estimate' })

  const prev = IconButton({ icon: 'caret-left', weight: 'regular', label: 'Previous week', onClick: () => go(-1) })
  const next = IconButton({ icon: 'caret-right', weight: 'regular', label: 'Next week', onClick: () => go(1) })
  const title = h('b', {}, 'This week')
  const range = h('span', {}, '')
  const label = h('button', { type: 'button', class: 'pay-week', 'aria-label': 'Jump to this week', onclick: () => offset !== 0 && go(-offset) }, title, range)
  const nav = h('div', { class: 'pay-nav' }, prev, label, next)

  const body = h('div', { class: 'pay-body', 'aria-live': 'polite' })
  const panel = h('section', { class: 'pay-panel', 'aria-label': 'Pay' }, nav, body)
  root.replaceChildren(panel)
  preloadIcons(['caret-left', 'caret-right', 'wallet'])

  function go(d: number) {
    offset += d
    load(true)
  }

  function setNav() {
    const start = perthWeekStart(new Date(), offset)
    title.textContent = weekLabel(offset)
    range.textContent = rangeLabel(start)
    label.toggleAttribute('data-here', offset === 0)
    label.setAttribute('aria-disabled', String(offset === 0))
    return start
  }

  function skeletonView(): HTMLElement {
    return h('div', { class: 'pay-grid', role: 'status', 'aria-label': 'Loading pay' },
      h('div', { class: 'pay-left' },
        h('div', { class: 'pay-totals' }, Skeleton({ height: 28, width: '55%' }), Skeleton({ height: 21, width: '70%' }), Skeleton({ height: 21, width: '60%' })),
        h('div', { class: 'pay-inset' }, Skeleton({ height: 72, radius: 12 }))),
      h('div', { class: 'pay-inset pay-list' }, Skeleton({ height: 44, radius: 12 }), Skeleton({ height: 44, radius: 12 }), Skeleton({ height: 44, radius: 12 })))
  }

  async function load(fresh = false) {
    const my = ++seq
    const start = setNav()
    const end = new Date(start.getTime() + 7 * DAY)
    if (fresh || !built) body.replaceChildren(skeletonView())
    try {
      const [shifts, settings] = await Promise.all([api.shiftsBetween(start, end), api.settings()])
      if (!alive || my !== seq) return
      render(start, shifts, settings, fresh || !built)
      built = true
    } catch {
      if (!alive || my !== seq) return
      built = false
      body.replaceChildren(ErrorState({ kind: navigator.onLine ? 'error' : 'offline', onRetry: () => load(true) }))
    }
  }

  function render(start: Date, shifts: Shift[], s: Settings, animateBars: boolean) {
    const now = new Date()
    const wk = calcWeek(shifts, start, s)
    if (wk.shifts.length === 0) {
      body.replaceChildren(EmptyState({
        icon: 'wallet',
        title: offset > 0 ? 'Nothing rostered yet' : 'No shifts this week',
        body: `Pay is ${fmtMoney(s.weekday_rate)} an hour on weekdays and Saturdays.`,
      }))
      grossRoll.set('$0.00')
      hoursRoll.set('0')
      netRoll.set('$0.00')
      return
    }

    // Worked days are solid, upcoming ones outlined. A shift counts as worked once it has finished.
    const done = shifts.filter((x) => new Date(x.ends_at) <= now)
    const todo = shifts.filter((x) => new Date(x.ends_at) > now)
    const worked = calcWeek(done, start, s)
    const upcoming = calcWeek(todo, start, s)
    const scale = Math.max(MIN_SCALE_HOURS, ...wk.days.map((d) => d.hours))
    const todayIdx = offset === 0 ? Math.floor((now.getTime() - start.getTime()) / DAY) : -1

    grossRoll.set(fmtMoney(wk.gross))
    hoursRoll.set(fmtHours(wk.hours))
    netRoll.set(fmtMoney(wk.net))

    const summary = `${fmtHours(wk.hours)} hours, ${fmtMoney(wk.gross)} gross, about ${fmtMoney(wk.net)} after tax. Tax estimate ${fmtMoney(wk.tax)}.`
    const bars = h('div', { class: `pay-bars${animateBars ? ' grow' : ''}`, role: 'img', 'aria-label': wk.days.map((d, i) => `${DAY_NAMES[i]} ${fmtHours(d.hours)} hours`).join(', ') },
      ...wk.days.map((d, i) => {
        const w = worked.days[i].hours
        const u = upcoming.days[i].hours
        return h('div', { class: `pay-day${i === todayIdx ? ' today' : ''}` },
          h('div', { class: 'pay-track' },
            w > 0 ? h('span', { class: 'seg solid', style: `height:${((w / scale) * 100).toFixed(2)}%;--i:${i}` }) : null,
            u > 0 ? h('span', { class: 'seg outline', style: `height:${((u / scale) * 100).toFixed(2)}%;bottom:${((w / scale) * 100).toFixed(2)}%;--i:${i}` }) : null),
          h('b', {}, LETTERS[i]),
          h('i', {}, d.hours ? fmtHours(d.hours) : ' '))
      }))

    const totals = h('div', { class: 'pay-totals', role: 'group', 'aria-label': summary },
      slot('Gross', h('div', { class: 'pay-gross num' }, grossRoll), 'wide'),
      slot('Hours', h('div', { class: 'pay-sub num' }, hoursRoll, h('small', {}, 'h'))),
      slot('After tax (est.)', h('div', { class: 'pay-sub pay-net num' }, netRoll)))

    const note = h('p', { class: 'pay-note' }, 'Rates from Settings. ',
      h('button', { type: 'button', class: 'pay-link', onclick: () => window.dispatchEvent(new CustomEvent('halo:open-settings', { detail: 'pay' })) }, 'Edit rates'))

    const shownShifts = wk.shifts.slice(0, opts.maxShifts ?? wk.shifts.length)
    const moreShifts = wk.shifts.length - shownShifts.length
    const list = h('div', { class: 'pay-inset pay-list', role: 'list', 'aria-label': 'Shifts' },
      ...shownShifts.map((ws) => {
        const sh = ws.shift as Shift // calcWeek hands back the objects we passed in
        const a = new Date(sh.starts_at)
        const b = new Date(sh.ends_at)
        const detail = calcShift(sh, s)
        const tag = sh.is_public_holiday ? `Public holiday ×${s.public_holiday_multiplier}` : perthDay.format(a) === 'Sun' ? `Sunday ×${s.sunday_multiplier}` : ''
        // The break note is its own span so the compact layouts can drop it and keep the paid hours.
        const meta = h('span', {}, `${fmtHours(ws.hours)}h paid`, detail.breakHours ? h('span', { class: 'pay-brk' }, ', 30 min break') : null)
        return h('div', { class: 'pay-shift', role: 'listitem' },
          h('div', { class: 'pay-shift-main' },
            h('b', {}, sh.title),
            h('span', { class: 'pay-when' }, `${fmtDayLong(a)}, ${fmtSpan(a, b)}`),
            meta,
            tag ? h('em', {}, tag) : null),
          h('strong', { class: 'num' }, fmtMoney(ws.pay)))
      }),
      moreShifts > 0 ? h('div', { class: 'pay-more' }, `+${moreShifts} more`) : null)

    body.replaceChildren(h('div', { class: 'pay-grid' },
      h('div', { class: 'pay-left' }, totals, h('div', { class: 'pay-inset' }, bars), note),
      list))
  }

  load()
  const unsub = subscribe(() => load())
  return () => {
    alive = false
    unsub()
  }
}
