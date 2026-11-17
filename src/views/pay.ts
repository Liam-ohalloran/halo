import type { Backend } from '../types'
import { computeWeek, fmtDay, fmtHours, fmtMoney, rateFor, weekStart, addDays } from '../time'
import { emptyState, errorState, h, icon, skeleton } from '../ui'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function mountPay(root: HTMLElement, api: Backend, subscribe: (cb: () => void) => () => void): () => void {
  let offset = 0
  let alive = true
  let seq = 0

  const range = h('div', { class: 'week-range' })
  const prev = h('button', { class: 'icon-btn', 'aria-label': 'Previous week', onclick: () => go(-1) }, icon('left'))
  const next = h('button', { class: 'icon-btn', 'aria-label': 'Next week', onclick: () => go(1) }, icon('right'))
  const body = h('div', { class: 'slot' }, skeleton(3, true))
  root.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'week-nav' }, prev, range, next), body))

  function go(d: number) {
    offset += d
    load(true)
  }

  async function load(showSkeleton = false) {
    const my = ++seq
    const start = weekStart(new Date(), offset)
    const end = addDays(start, 7)
    range.replaceChildren(
      h('b', {}, offset === 0 ? 'This week' : offset === -1 ? 'Last week' : offset === 1 ? 'Next week' : 'Pay week'),
      h('span', {}, `${fmtDay(start)} – ${fmtDay(addDays(end, -1))}`),
    )
    if (showSkeleton) body.replaceChildren(skeleton(3, true))
    try {
      const [shifts, settings] = await Promise.all([api.shiftsBetween(start, end), api.settings()])
      if (!alive || my !== seq) return
      const wk = computeWeek(shifts, start, settings)
      if (wk.shifts === 0) {
        body.replaceChildren(
          emptyState('pay', offset > 0 ? 'Nothing rostered yet' : 'No shifts this week', `Rates: ${fmtMoney(settings.weekday_rate)}/h weekdays, ${fmtMoney(settings.saturday_rate)}/h Sat, ×${settings.sunday_multiplier} Sun.`),
        )
        return
      }
      const max = Math.max(...wk.days.map((d) => d.hours), 1)
      const today = new Date().toDateString()
      body.replaceChildren(
        h('section', { class: 'card pop' },
          h('header', { class: 'card-head' },
            h('span', { class: 'chip' }, icon('pay', 13), 'Gross'),
            h('span', { class: 'eyebrow' }, `${wk.shifts} shift${wk.shifts === 1 ? '' : 's'}`),
          ),
          h('div', { class: 'pay-row' },
            h('div', { class: 'big-money' }, fmtMoney(wk.gross)),
            h('div', { class: 'pay-hours' }, h('b', {}, fmtHours(wk.hours)), h('i', {}, 'worked')),
          ),
          h('div', { class: 'bars', role: 'img', 'aria-label': wk.days.map((d) => `${fmtDay(d.date)} ${fmtHours(d.hours)}`).join(', ') },
            ...wk.days.map((d, i) =>
              h('div', { class: `bar-col${d.date.toDateString() === today ? ' today' : ''}`, title: `${fmtDay(d.date)}: ${fmtHours(d.hours)} · ${fmtMoney(d.gross)}` },
                h('div', { class: 'bar-track' },
                  h('span', { style: `--h:${(d.hours / max).toFixed(3)};--d:${i * 40}ms`, class: d.hours ? '' : 'zero' }),
                ),
                h('i', {}, DOW[i]),
              ),
            ),
          ),
          h('div', { class: 'rates' },
            ...rateChips(wk.days, settings),
          ),
        ),
      )
    } catch (e) {
      if (!alive || my !== seq) return
      body.replaceChildren(errorState((e as Error).message, () => load(true)))
    }
  }

  function rateChips(days: { date: Date; gross: number; hours: number }[], s: Parameters<typeof rateFor>[2]) {
    const seen = new Map<string, number>()
    for (const d of days) {
      if (!d.hours) continue
      const eff = d.gross / d.hours
      const base = rateFor(d.date, false, s)
      const key = Math.abs(eff - base) < 0.01 ? (d.date.getDay() === 0 ? 'Sun' : d.date.getDay() === 6 ? 'Sat' : 'Weekday') : 'Holiday'
      seen.set(key, (seen.get(key) ?? 0) + d.hours)
    }
    return [...seen].map(([k, hrs]) => h('span', { class: 'chip soft' }, `${k} ${fmtHours(hrs)}`))
  }

  load()
  const unsub = subscribe(() => load())
  return () => {
    alive = false
    unsub()
  }
}
