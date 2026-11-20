import '../styles/tokens.css'
import '../styles/proto.css'
import './pay.css'
import type { Backend, Settings } from '../types'
import { CHARGE_MAX_HOURS, CHARGE_OT_HOURS, calcWeek, chargeBar, cumulativeGross, overtimePay, perthWeekStart, sundayRate, type WeekPay } from '../lib/pay'
import { rangeLabel } from '../lib/shell-meta'
import { animateIn, countUp, pvRoot, reducedMotion, tip, type PvRoot } from '../ui/charts'

// Pay tab (card 16, HALO.md section 4). The black island family: a charging bar for the hours with overtime stripes past
// 10 h, the cumulative pay curve, and four pills. All the maths is in src/lib/pay.ts, this file only draws it.
// It is built once. Switching THIS and NEXT week, or new data, changes only the numbers and the curve in place.

const DAY = 864e5
const PERTH = 8 * 36e5
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const BOLT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>'
const IC = {
  tax: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M19 5 5 19M7 7h.01M17 17h.01"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7a3 3 0 0 1 3-3h12a2 2 0 0 1 2 2v1H6a1 1 0 0 0 0 2h14a1 1 0 0 1 1 1v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
}
const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
const whole = (n: number) => `$${Math.round(n)}`
const hrs = (n: number) => String(Number(n.toFixed(1)))
const amountHtml = (n: number) => { const [d, c] = n.toFixed(2).split('.'); return `$${Number(d).toLocaleString('en-AU')}<small>.${c}</small>` }
const otX = (CHARGE_OT_HOURS / CHARGE_MAX_HOURS) * 100

const TEMPLATE = `<div class="payHero pop" style="--i:0">
    <div class="payTop"><span class="caps" data-k="cap">This week</span><div class="toggle" role="group" aria-label="Pay week"><button type="button" data-w="0" class="on" aria-pressed="true">THIS</button><button type="button" data-w="1" aria-pressed="false">NEXT</button></div></div>
    <div class="payAmt"><b class="num" data-k="amt" aria-live="polite">$0<small>.00</small></b><span class="chipb" data-k="ot" hidden></span></div>
    <div class="charge" role="img" data-k="chargeA11y"><div class="trk"></div><div class="fl" data-k="fl"></div><div class="ot" data-k="otbar" style="left:${otX}%"></div><div class="mk" style="left:${otX}%"></div><div class="kn" data-k="kn" style="left:12%">${BOLT}<span data-k="knt">0h</span></div></div>
    <div class="chargeL" aria-hidden="true"><span>0H</span><span>10H OVERTIME</span><span>24H</span></div>
    <button type="button" class="payRates" data-k="rates">Rates from Settings</button>
    <div class="area"><svg viewBox="0 0 290 84" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="payAf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5CFF7A" stop-opacity=".35"/><stop offset="1" stop-color="#5CFF7A" stop-opacity="0"/></linearGradient></defs>${[20, 40, 60].map((y) => `<line x1="0" x2="290" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.06)" stroke-dasharray="3 4"/>`).join('')}<g data-k="curve"></g></svg><div class="dl" data-k="dl"></div></div>
    <div class="areaEmpty"><b>No shifts this week</b><span data-k="emptyNote"></span></div>
    <div class="payErr" role="alert"><p data-k="errMsg">Can't reach Halo. Check your connection.</p><button type="button" data-k="retry">Try again</button></div>
  </div>
  <div class="pills4">
    <button type="button" class="sp pop" style="--i:1" data-tip="tax"><span class="ic" style="background:rgba(255,138,30,.18);color:var(--amber)">${IC.tax}</span><div><small>Tax est</small><b class="num" data-k="tax">$0</b></div></button>
    <button type="button" class="sp pop" style="--i:2" data-tip="net"><span class="ic" style="background:rgba(92,255,122,.18);color:var(--green)">${IC.wallet}</span><div><small>Take home</small><b class="num" data-k="net">$0</b></div></button>
    <button type="button" class="sp pop" style="--i:3" data-tip="sun"><span class="ic" style="background:rgba(255,194,61,.18);color:var(--gold)">${IC.sun}</span><div><small>Sunday</small><b class="num" data-k="sun">$0.00</b></div></button>
    <button type="button" class="sp pop" style="--i:4" data-k="swap" aria-label="Switch week"><span class="ic" style="background:rgba(61,90,254,.25);color:#9fb0ff">${IC.arrow}</span><div><small data-k="otherL">Next week</small><b class="num" data-k="other">$0</b></div></button>
  </div>`

export interface PayPanelHandle extends PvRoot { destroy(): void; refresh(): void }

export function PayPanel(api: Backend, subscribe: (cb: () => void) => () => void, clock: () => Date = () => new Date()): PayPanelHandle {
  const root = pvRoot('pay-pv is-loading') as PayPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Pay')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  const hero = root.querySelector<HTMLElement>('.payHero')!

  let sel = 0 // 0 this week, 1 next week
  let weeks: [WeekPay | null, WeekPay | null] = [null, null]
  let settings: Settings | null = null
  let alive = true
  let seq = 0
  let stopCount: () => void = () => {}
  let shown = false // the entrance has played, so later changes go straight to their final state

  const weekStart = (i: number) => perthWeekStart(clock(), i)

  /** Everything that depends on the chosen week, written in place. */
  function paint(animate: boolean) {
    const w = weeks[sel]
    const other = weeks[1 - sel]
    if (!w || !settings) return
    const start = weekStart(sel)
    $('cap').textContent = `● ${sel ? 'Next week' : 'This week'} · ${rangeLabel(start.getTime() + PERTH, 7)}`
    root.querySelectorAll<HTMLButtonElement>('.toggle button').forEach((b) => { const on = Number(b.dataset.w) === sel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)) })
    const empty = w.shifts.length === 0
    hero.classList.toggle('is-empty', empty)
    $('emptyNote').textContent = `Pay is ${aud.format(settings.weekday_rate)} an hour on weekdays and Saturdays.`

    // amount
    stopCount()
    const amt = $('amt')
    if (animate && !reducedMotion()) stopCount = countUp(w.gross, (v) => { amt.innerHTML = amountHtml(v) })
    else amt.innerHTML = amountHtml(w.gross)
    const ot = overtimePay(w)
    const chip = $('ot')
    chip.hidden = ot <= 0
    if (ot > 0) chip.textContent = `+${whole(ot)} OT`

    // charging bar: solid up to 10 h, stripes past it. The knob never leaves the bar's left edge.
    const bar = chargeBar(w.hours)
    $('fl').style.width = `${bar.base * 100}%`
    $('otbar').style.width = `${bar.over * 100}%`
    $('kn').style.left = `${Math.min(92, Math.max(12, (bar.base + bar.over) * 100))}%`
    $('knt').textContent = `${hrs(w.hours)}h`
    $('chargeA11y').setAttribute('aria-label', `${hrs(w.hours)} hours of ${CHARGE_MAX_HOURS}, overtime starts at ${CHARGE_OT_HOURS}`)

    // curve: cumulative pay by day
    const cum = cumulativeGross(w)
    const top = Math.max(100, cum[6] * 1.1)
    const pts = cum.map((v, i): [number, number] => [i * (290 / 6), 80 - (v / top) * 74])
    const d = 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L')
    const worked = w.days.map((x) => x.gross > 0)
    $('curve').innerHTML = `<path d="${d} L290 84 L0 84z" fill="url(#payAf)"/><path class="anim-line" d="${d}" fill="none" stroke="#5CFF7A" stroke-width="2.5" stroke-linejoin="round" style="filter:drop-shadow(0 0 5px #5CFF7A)"/>${pts.map((p, i) => (worked[i] ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="#fff" style="filter:drop-shadow(0 0 4px #5CFF7A)"/>` : '')).join('')}`
    $('dl').innerHTML = LETTERS.map((x, i) => `<span>${worked[i] ? `<b>${x}</b>` : x}</span>`).join('')
    animateIn($('curve'), !animate)

    // pills
    $('tax').textContent = whole(w.tax)
    $('net').textContent = whole(w.net)
    $('sun').textContent = aud.format(sundayRate(settings))
    $('otherL').textContent = sel ? 'This week' : 'Next week'
    $('other').textContent = other ? whole(other.gross) : '$0'
  }

  async function load(first = false) {
    const my = ++seq
    root.classList.remove('is-err')
    if (first) root.classList.add('is-loading')
    try {
      const [s, a, b] = await Promise.all([
        api.settings(),
        api.shiftsBetween(weekStart(0), new Date(weekStart(0).getTime() + 7 * DAY)),
        api.shiftsBetween(weekStart(1), new Date(weekStart(1).getTime() + 7 * DAY)),
      ])
      if (!alive || my !== seq) return
      settings = s
      weeks = [calcWeek(a, weekStart(0), s), calcWeek(b, weekStart(1), s)]
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

  const choose = (i: number) => { if (i === sel) return; sel = i; paint(true) }
  root.querySelectorAll<HTMLButtonElement>('.toggle button').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.w))))
  $('swap').addEventListener('click', () => choose(1 - sel))
  $('retry').addEventListener('click', () => void load(true))
  $('rates').addEventListener('click', () => window.dispatchEvent(new CustomEvent('halo:open-settings', { detail: 'pay' })))
  root.querySelectorAll<HTMLElement>('[data-tip]').forEach((p) => p.addEventListener('click', () => {
    if (!settings) return
    const k = p.dataset.tip
    tip(root, k === 'tax' ? '15 cents per dollar over $350 a week' : k === 'net' ? 'Gross pay minus the tax estimate' : `Sundays pay ${Math.round(settings.sunday_multiplier * 100)}% of ${aud.format(settings.weekday_rate)}`)
  }))

  // The entrance replays the count up and the curve each time the tab is switched to.
  const baseEnter = root.enter
  root.enter = () => {
    baseEnter()
    shown = true
    if (weeks[sel]) paint(true)
  }
  const unsub = subscribe(() => void load())
  void load(true)
  root.refresh = () => void load()
  root.destroy = () => { alive = false; stopCount(); unsub() }
  return root
}

/** The Pay panel on its own page (the legacy tabs and /pay). Returns the unmount function. */
export function mountPay(host: HTMLElement, api: Backend, subscribe: (cb: () => void) => () => void): () => void {
  const panel = PayPanel(api, subscribe)
  panel.style.height = '226px'
  host.replaceChildren(panel)
  return () => panel.destroy()
}
