import '../styles/tokens.css'
import '../styles/proto.css'
import './money.css'
import type { Backend, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { CATEGORIES, GOAL_COLOURS, buildMoneyView, categoryColour, dayLabel, dollars, dollars2, goalFraction, perthDate, perthMonthStart, renewLabel, subColour, type Goal, type MoneyItem } from '../lib/money'
import type { PayShift } from '../lib/pay'
import { perthWeekStart } from '../lib/pay'
import { animateIn, countUp, curve, pvRoot, reducedMotion, ring, type PvRoot } from '../ui/charts'
import { openSheet } from '../ui/sheet'

// Money tab (card 21), colour tiles. This week's pay and the month, what Liam spent (typed in by hand), goals, subscriptions,
// recent rows and a safe to spend figure. No bank connection and nothing here moves money.
// Built once. A change rewrites only the tile that changed, and only when its markup is different.

const DAY = 864e5
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MAX_GOALS = 3
const MAX_SUBS = 4
const MAX_RECENT = 4

const TEMPLATE = `<div class="grid">
  <div class="t green s2 pop" style="--i:0"><span class="caps">This week's pay</span><div class="big num" data-k="earned">$0</div><div class="sub" data-k="earnedS">&nbsp;</div><div data-k="curve"></div></div>
  <div class="t amber s2 pop" style="--i:1"><div class="hd"><span class="caps">Spent this week</span><b class="num" data-k="spent">$0</b></div><div data-k="spend"></div></div>
  <div class="t dark s2 pop" style="--i:2"><div class="hd"><span class="caps">Goals</span><span class="more" data-k="goalsMore"></span><button type="button" class="chipb addb" data-act="goal" aria-label="Add a goal">+ GOAL</button></div><div data-k="goals"></div></div>
  <div class="t blue s2 pop" style="--i:3"><div class="hd"><span class="caps">Subscriptions</span><b class="num" data-k="subTotal">$0<small>/mo</small></b></div><div data-k="subs"></div></div>
  <div class="t ink s3 pop" style="--i:4"><div class="hd"><span class="caps">Recent</span><button type="button" class="chipb addb" data-act="add" aria-label="Add a spend or subscription">+ ADD</button></div><div data-k="recent"></div></div>
  <div class="t teal pop" style="--i:5" data-tip="After tax pay this month, minus spending and subscriptions, over the days left."><span class="caps">Safe to spend</span><div class="big num" data-k="safe">$0<small>/day</small></div><div class="sub">to month end</div></div>
</div>
<div class="mErr" role="alert"><span data-k="errMsg">Can't load your money.</span><button type="button" data-k="retry">Try again</button></div>`

export interface MoneyPanelHandle extends PvRoot { destroy(): void }

export function MoneyPanel(api: Backend, clock: () => Date = () => new Date()): MoneyPanelHandle {
  const root = pvRoot('money-pv is-loading') as MoneyPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Money')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  let alive = true
  let seq = 0
  let loaded = false
  let settings: Settings = { ...DEFAULT_SETTINGS }
  let shifts: PayShift[] = []
  let items: MoneyItem[] = []
  let goals: Goal[] = []
  let stopCount: (() => void)[] = []

  // ---- Painting. Each tile remembers the markup it last drew and is only touched when that changes.
  const shown: Record<string, string> = {}
  let instant = false // true once the entrance has played, so a data change never replays it
  const put = (k: string, html: string) => {
    if (shown[k] === html) return
    shown[k] = html
    const el = $(k)
    el.innerHTML = html
    animateIn(el, instant || reducedMotion())
  }
  const putText = (k: string, text: string) => { if (shown[k] !== text) { shown[k] = text; $(k).textContent = text } }
  /** A big number counts up from zero while the entrance plays, then just changes. */
  let counting = false
  function putNum(k: string, to: number, fmt: (n: number) => string, suffix = '') {
    const text = fmt(to) + suffix
    if (shown[k] === text) return
    shown[k] = text
    const el = $(k)
    if (counting) { stopCount.push(countUp(to, (v) => { el.innerHTML = fmt(v) + suffix })); stopCount.push(() => { el.innerHTML = text }) } else el.innerHTML = text
  }

  function paint() {
    if (!loaded) return
    const now = clock()
    const v = buildMoneyView(shifts, items, goals, settings, now)
    root.classList.remove('is-loading', 'is-err')

    putNum('earned', v.week.gross, dollars)
    putText('earnedS', v.month.gross > 0 ? `${dollars(v.month.gross)} this month` : 'Nothing rostered yet')
    const top = Math.max(100, (v.curve[6] ?? 0) * 1.1)
    const pts = v.curve.map((c, i): [number, number] => [i * (135 / 6), 32 - (c / top) * 28])
    put('curve', v.week.gross > 0 ? curve('#5CFF7A', pts) : '')

    putNum('spent', v.spentWeek, dollars2)
    put('spend', v.categories.length
      ? `<div class="mstack">${v.categories.map((c) => `<i data-bar="${(c.total / v.spentWeek) * 100}" style="background:${c.colour}"></i>`).join('')}</div>
         <div class="legend">${v.categories.slice(0, 4).map((c) => `<div><b style="background:${c.colour}"></b>${esc(c.name)} <em>$${Math.round(c.total)}</em></div>`).join('')}</div>`
      : '<div class="note">Nothing spent this week. Add a spend to see where it goes.</div>')

    const g = v.goals
    putText('goalsMore', g.length > MAX_GOALS ? `+${g.length - MAX_GOALS} more` : '')
    put('goals', g.length
      ? `<div class="goals3">${g.slice(0, MAX_GOALS).map((x) => `<button type="button" class="g" data-goal="${esc(x.id)}" aria-label="Edit goal ${esc(x.name)}, ${dollars(x.saved)} of ${dollars(x.target)}">${ring(x.colour, goalFraction(x), 30, 4)}<div class="gt"><b data-ellipsis>${esc(x.name)}</b><span>${dollars(x.saved)}</span><em style="color:${x.colour}">${Math.round(goalFraction(x) * 100)}%</em></div></button>`).join('')}</div>`
      : '<div class="note">Add a goal to watch it fill up.</div>')

    const subs = v.subs
    putNum('subTotal', subs.monthly, dollars2, '<small>/mo</small>')
    const subRows = subs.rows.slice(0, subs.rows.length > MAX_SUBS ? MAX_SUBS - 1 : MAX_SUBS)
    put('subs', subs.rows.length
      ? `<div class="subsL">${subRows.map((s) => `<button type="button" class="r" data-item="${esc(s.id)}" title="Renews ${esc(renewLabel(s.next, now))}" aria-label="${esc(s.name)}, ${dollars2(s.amount)} a month, renews ${esc(renewLabel(s.next, now))}"><i style="background:${subColour(s.name)}33;color:${subColour(s.name)}">●</i><span data-ellipsis>${esc(s.name)}</span><b>${dollars2(s.amount)}</b></button>`).join('')}${subs.rows.length > MAX_SUBS ? `<div class="r nomore"><span>+${subs.rows.length - (MAX_SUBS - 1)} more</span></div>` : ''}</div>`
      : '<div class="note">No subscriptions yet.</div>')

    put('recent', v.recent.length
      ? `<div class="txs">${v.recent.slice(0, MAX_RECENT).map((r) => `<button type="button" class="r" data-item="${esc(r.id)}" aria-label="${esc(r.name)}, ${dollars2(r.amount)}${r.kind === 'sub' ? ' a month' : ''}, ${esc(dayLabel(r.on_date, now))}"><i style="background:${categoryColour(r.category)}26;color:${categoryColour(r.category)}">${esc(r.name.slice(0, 1).toUpperCase())}</i><span data-ellipsis>${esc(r.name)}</span><b>−${dollars2(r.amount)}</b></button>`).join('')}</div>`
      : '<div class="note">Nothing yet. Tap + ADD for your first spend.</div>')

    putNum('safe', v.safe, (n) => dollars(Math.round(n)), '<small>/day</small>')
  }

  async function load(first = false) {
    const my = ++seq
    try {
      const now = clock()
      const from = perthWeekStart(perthMonthStart(now))
      const to = new Date(perthWeekStart(perthMonthStart(now, 1)).getTime() + 7 * DAY)
      const [s, sh, it, gl] = await Promise.all([api.settings(), api.shiftsBetween(from, to), api.moneyItems(), api.goals()])
      if (!alive || my !== seq) return
      settings = s; shifts = sh; items = it; goals = gl
      const firstPaint = !loaded
      loaded = true
      if (firstPaint && root.classList.contains('on')) { counting = !reducedMotion(); setTimeout(() => { counting = false; instant = true }, 1200) } else if (firstPaint) instant = false
      paint()
      if (firstPaint && root.classList.contains('on')) animateIn(root, reducedMotion())
    } catch {
      if (!alive || my !== seq) return
      if (first || !loaded) {
        root.classList.remove('is-loading')
        root.classList.add('is-err')
        $('errMsg').textContent = navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Reconnect and try again."
      }
    }
  }

  // ---- Sheets
  const todayIso = () => perthDate(clock())
  function itemSheet(existing?: MoneyItem) {
    const sub = existing?.kind === 'sub'
    const names = [...new Set(items.map((i) => i.name))].slice(0, 12)
    openSheet(root, {
      title: existing ? `Edit ${existing.name}` : 'Add to Money',
      submit: existing ? 'Save' : 'Add',
      removeLabel: 'Remove',
      onRemove: existing ? async () => { await api.deleteMoneyItem(existing.id); await load() } : undefined,
      fields: [
        { key: 'kind', label: 'Type', type: 'select', options: ['Spend', 'Subscription'], value: sub ? 'Subscription' : 'Spend' },
        { key: 'name', label: 'What', type: 'text', value: existing?.name ?? '', placeholder: 'Boost Juice', suggest: names, span: 2 },
        { key: 'amount', label: 'Amount in dollars', type: 'number', step: '0.01', min: '0', value: existing ? String(existing.amount) : '', placeholder: '9.50' },
        { key: 'category', label: 'Category', type: 'select', options: CATEGORIES.map((c) => c.name), value: existing && !sub ? existing.category : 'Food', span: 2, when: (v) => v.kind === 'Spend' },
        { key: 'on_date', label: 'Date', type: 'date', value: existing && !sub ? existing.on_date : todayIso(), span: 2, when: (v) => v.kind === 'Spend' },
        { key: 'renews', label: 'Renews on', type: 'date', value: existing && sub ? existing.on_date : todayIso(), span: 2, when: (v) => v.kind === 'Subscription' },
      ],
      onSubmit: async (v) => {
        const amount = Number(v.amount)
        if (!v.name) return 'Add what it was.'
        if (!Number.isFinite(amount) || amount <= 0) return 'Amount needs to be more than zero.'
        const isSub = v.kind === 'Subscription'
        const date = isSub ? v.renews : v.on_date
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick a date.'
        // Edit = add the new row, then remove the old one, so a failure part way never loses it.
        await api.addMoneyItem({ kind: isSub ? 'sub' : 'spend', name: v.name, amount, category: isSub ? 'Subscription' : v.category, on_date: date })
        if (existing) await api.deleteMoneyItem(existing.id)
        await load()
      },
    })
  }
  function goalSheet(existing?: Goal) {
    openSheet(root, {
      title: existing ? `Edit ${existing.name}` : 'New goal',
      submit: existing ? 'Save' : 'Add',
      onRemove: existing ? async () => { await api.deleteGoal(existing.id); await load() } : undefined,
      fields: [
        { key: 'name', label: 'Goal', type: 'text', value: existing?.name ?? '', placeholder: 'Car fund', span: 2 },
        { key: 'saved', label: 'Saved so far', type: 'number', step: '0.01', min: '0', value: existing ? String(existing.saved) : '0' },
        { key: 'target', label: 'Target', type: 'number', step: '1', min: '1', value: existing ? String(existing.target) : '', placeholder: '5000' },
      ],
      onSubmit: async (v) => {
        const saved = Number(v.saved || 0)
        const target = Number(v.target)
        if (!v.name) return 'Give the goal a name.'
        if (!Number.isFinite(target) || target <= 0) return 'Target needs to be more than zero.'
        if (!Number.isFinite(saved) || saved < 0) return 'Saved needs to be zero or more.'
        await api.saveGoal({ id: existing?.id, name: v.name, saved, target, colour: existing?.colour ?? GOAL_COLOURS[goals.length % GOAL_COLOURS.length] })
        await load()
      },
    })
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act
    if (act === 'add') return itemSheet()
    if (act === 'goal') return goalSheet()
    const g = t.closest<HTMLElement>('[data-goal]')
    if (g) return goalSheet(goals.find((x) => x.id === g.dataset.goal))
    const it = t.closest<HTMLElement>('[data-item]')
    if (it) return itemSheet(items.find((x) => x.id === it.dataset.item))
  })
  $('retry').addEventListener('click', () => { root.classList.remove('is-err'); root.classList.add('is-loading'); void load(true) })

  // The entrance replays each time the tab is switched to. The data is read again too, so a row added on the phone shows up.
  const baseEnter = root.enter
  root.enter = () => {
    stopCount.forEach((f) => f()); stopCount = []
    instant = false
    for (const k of Object.keys(shown)) delete shown[k]
    counting = loaded && !reducedMotion()
    baseEnter()
    if (loaded) { paint(); setTimeout(() => { counting = false; instant = true }, 1200); void load() } else void load(true)
  }
  root.destroy = () => { alive = false; stopCount.forEach((f) => f()) }
  return root
}
