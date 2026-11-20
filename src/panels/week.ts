import '../styles/tokens.css'
import '../styles/proto.css'
import './week.css'
import type { Backend } from '../types'
import { DAY_END, DAY_START, EARLY_MAX, buildWeek, fmtAxis, fmtRange, shiftEvent, testEvent, perthMidnight, type DayCol, type WeekEvent, type WeekModel } from '../lib/week'
import { pvRoot, tip, type PvRoot } from '../ui/charts'

// Week tab (card 19). The compact grid family: a standard week calendar for the next 7 days. Header row of days (today in a
// red circle, the selected day in a white one), the EARLY row for anything before 6am or without a time, then 6am to 10pm
// down the side. Shifts are amber and tests take their subject colour. Events that clash sit side by side.
// Built once. Tapping a day only moves the highlight, tapping an event shows its full title and time. New data rebuilds
// only the events, never the whole tab, and the entrance plays only when the tab is switched to.

const DAY = 864e5
const SPAN = DAY_END - DAY_START
const pct = (h: number) => `${(((h - DAY_START) / SPAN) * 100).toFixed(3)}%`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const AXIS = Array.from({ length: SPAN / 2 + 1 }, (_, k) => DAY_START + k * 2)

const TEMPLATE = `<div class="cal pop" style="--i:0">
  <div class="calHd" data-k="hd"></div>
  <div class="calAll" data-k="all"></div>
  <div class="calBody" data-k="body">
    <div class="calTimes">${AXIS.map((h) => `<span style="top:${pct(h)}">${fmtAxis(h)}</span>`).join('')}</div>
  </div>
  <div class="calNote"><b>Nothing on this week</b><span>Shifts and tests show here once they are in TickTick.</span></div>
  <div class="calErr" role="alert"><p data-k="errMsg">Can't reach Halo. Check your connection.</p><button type="button" data-k="retry">Try again</button></div>
</div>`

export interface WeekPanelHandle extends PvRoot { destroy(): void; refresh(): void; select(i: number): void }

export function WeekPanel(api: Backend, subscribe: (cb: () => void) => () => void, clock: () => Date = () => new Date()): WeekPanelHandle {
  const root = pvRoot('week-pv is-loading') as WeekPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Week')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  const hd = $('hd')
  const all = $('all')
  const body = $('body')

  let model: WeekModel | null = null
  let sel = 0 // the selected day, 0 is today
  let alive = true
  let seq = 0
  let shown = false // the entrance has played, so later data goes straight in
  let entering = 0
  const byId = new Map<string, WeekEvent>()

  /** The header row and the EARLY row's frame. Written when the day changes (midnight) or on first data. */
  function paintHeader(m: WeekModel) {
    hd.innerHTML = `<div class="calMo"><b>${m.month}</b><span>${m.range}</span></div>${m.days.map((d, i) =>
      `<button type="button" class="calD" data-i="${i}" aria-pressed="false" aria-label="${d.dow.charAt(0) + d.dow.slice(1).toLowerCase()} ${d.num}${d.isToday ? ', today' : ''}"><small>${d.dow}</small><b class="${d.isToday ? 'tm' : ''}">${d.num}</b></button>`).join('')}`
    all.innerHTML = `<div class="calLbl">early</div>${m.days.map((d, i) => `<div class="calAc" data-i="${i}">${earlyHtml(d)}</div>`).join('')}`
    body.querySelectorAll('.calCol').forEach((c) => c.remove())
    for (let i = 0; i < 7; i++) {
      const col = document.createElement('div')
      col.className = 'calCol'
      col.dataset.i = String(i)
      col.innerHTML = AXIS.map((h) => `<i class="calLn" style="top:${pct(h)}"></i>`).join('') + blocksHtml(m.days[i], i)
      body.append(col)
    }
    markSelected()
  }

  const earlyHtml = (d: DayCol) => {
    const shownEv = d.early.length > EARLY_MAX ? d.early.slice(0, EARLY_MAX - 1) : d.early
    const hidden = d.early.length - shownEv.length
    return shownEv.map((ev) => chip(ev)).join('') + (hidden > 0 ? `<button type="button" class="calChip more" data-more="${hidden}" aria-label="${hidden} more early">+${hidden}</button>` : '')
  }
  const chip = (ev: WeekEvent) => { byId.set(ev.id, ev); return `<button type="button" class="calChip" data-ev="${esc(ev.id)}" style="--c:${ev.colour}" aria-label="${esc(ev.title)}, ${esc(fmtRange(ev))}"><span data-ellipsis>${esc(ev.label)}</span></button>` }
  const blocksHtml = (d: DayCol, i: number) => d.blocks.map((b, k) => {
    byId.set(b.ev.id, b.ev)
    const tall = (b.to - b.from) / SPAN * 100 // percent of the grid
    return `<button type="button" class="calEv" data-ev="${esc(b.ev.id)}" style="--c:${b.ev.colour};left:calc(${(b.lane / b.lanes) * 100}% + 2px);width:calc(${100 / b.lanes}% - 4px);top:${pct(b.from)};height:calc(${tall.toFixed(3)}% - 1px);animation-delay:${i * 40 + k * 60}ms" aria-label="${esc(b.ev.title)}, ${esc(fmtRange(b.ev))}"><b data-ellipsis>${esc(b.lanes > 1 ? b.ev.short : b.ev.label)}</b>${tall > 17 && b.lanes < 3 ? `<span data-ellipsis>${esc(fmtRange(b.ev).replace(/ (am|pm)/g, '$1'))}</span>` : ''}</button>`
  }).join('')

  /** Only the selected day's classes change on a tap. */
  function markSelected() {
    root.querySelectorAll<HTMLElement>('.calD').forEach((b) => { const on = Number(b.dataset.i) === sel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)) })
    root.querySelectorAll<HTMLElement>('.calAc, .calCol').forEach((c) => c.classList.toggle('on', Number(c.dataset.i) === sel))
  }
  function select(i: number) {
    if (i === sel || i < 0 || i > 6) return
    sel = i
    markSelected()
  }

  function paint(animate: boolean) {
    if (!model) return
    clearTimeout(entering)
    root.classList.remove('ev-in')
    byId.clear()
    paintHeader(model)
    root.classList.toggle('is-empty', model.total === 0)
    if (animate) {
      void root.offsetWidth
      root.classList.add('ev-in')
      entering = window.setTimeout(() => root.classList.remove('ev-in'), 1200)
    }
  }

  async function load(first = false) {
    const my = ++seq
    root.classList.remove('is-err')
    if (first) root.classList.add('is-loading')
    try {
      const now = clock()
      const from = new Date(perthMidnight(now.getTime()))
      const to = new Date(from.getTime() + 7 * DAY)
      const [shifts, tests] = await Promise.all([api.shiftsBetween(from, to), api.testsBetween(from, to)])
      if (!alive || my !== seq) return
      model = buildWeek(now, [...shifts.map(shiftEvent), ...tests.map(testEvent)])
      root.classList.remove('is-loading')
      paint(first || !shown)
      if (first && root.classList.contains('on')) shown = true
    } catch {
      if (!alive || my !== seq) return
      root.classList.remove('is-loading')
      root.classList.add('is-err')
      $('errMsg').textContent = navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Reconnect and try again."
    }
  }

  // One listener for the whole calendar: a day header or column picks the day, an event or chip shows its details.
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const evEl = t.closest<HTMLElement>('[data-ev]')
    if (evEl) {
      const ev = byId.get(evEl.dataset.ev!)
      if (!ev) return
      const i = Number(evEl.closest<HTMLElement>('[data-i]')?.dataset.i)
      if (Number.isFinite(i)) select(i)
      root.querySelectorAll('.calEv.sel').forEach((x) => x.classList.remove('sel'))
      evEl.classList.add('sel')
      tip(root, `${ev.title}. ${fmtRange(ev)}`)
      setTimeout(() => evEl.classList.remove('sel'), 2400)
      return
    }
    if (t.closest('[data-more]')) { const i = Number(t.closest<HTMLElement>('[data-i]')?.dataset.i); if (Number.isFinite(i)) select(i); return }
    const day = t.closest<HTMLElement>('.calD, .calCol, .calAc')
    if (day) select(Number(day.dataset.i))
  })
  $('retry').addEventListener('click', () => void load(true))

  // The entrance replays each time the tab is switched to. Selecting today again is the usual reset.
  const baseEnter = root.enter
  root.enter = () => {
    baseEnter()
    shown = true
    sel = 0
    if (model && model.days[0].start !== perthMidnight(clock().getTime())) { void load(true); return } // a new day since it was built
    if (model) { markSelected(); paint(true) }
  }
  const unsub = subscribe(() => void load())
  void load(true)
  root.refresh = () => void load()
  root.select = select
  root.destroy = () => { alive = false; clearTimeout(entering); unsub() }
  return root
}
