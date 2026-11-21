import '../styles/tokens.css'
import '../styles/proto.css'
import './night.css'
import type { Backend } from '../types'
import { SLEEP_H, clock12, clockPm, eveningName, planNight, tickCards, ticksKey, untilLabel, type NightMode, type NightPlan } from '../lib/night'
import { perthDayStart } from '../lib/money'
import { animateIn, pvRoot, reducedMotion, tip, type PvRoot } from '../ui/charts'

// Night tab (card 23), the black island family. Wind down time, a sleep arc to tomorrow's first event, four things to tick
// off before bed, and the Night mode switch that dims Halo and mutes banners (never leave reminders).
// Built once. The minute tick changes the "to go" text and the arc's knob, a tick only its own card.

const DAY = 864e5
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Stars are placed the same way every time, so the sky never reshuffles.
const star = (i: number) => { const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x) }; return `<i class="star" style="left:${(r(1) * 100).toFixed(1)}%;top:${(r(2) * 70).toFixed(1)}%;animation-delay:${(r(3) * 3).toFixed(1)}s;opacity:${(0.3 + r(4) * 0.7).toFixed(2)}"></i>` }
const STARS = Array.from({ length: 22 }, (_, i) => star(i)).join('')
const ARC = 'M10 100 C 80 10, 220 10, 290 100'

const TEMPLATE = `<div class="nightSky pop" style="--i:0">${STARS}
  <span class="caps" data-k="cap">● Wind down</span>
  <button type="button" class="nm" data-k="nm" role="switch" aria-checked="false" aria-label="Night mode"><span>NIGHT MODE</span><i></i></button>
  <div class="lo"><span class="num lt" data-k="lt">9:30<em> pm</em></span><small>lights out · <b data-k="left">0m</b> to go</small></div>
  <div class="crescent" aria-hidden="true"></div>
  <svg class="sleepArc" viewBox="0 0 300 124" role="img" aria-label="Sleep plan" data-k="arc"></svg>
</div>
<div class="nRow" data-k="cards"></div>
<div class="ngErr" role="alert"><span data-k="errMsg">Can't load tomorrow.</span><button type="button" data-k="retry">Try again</button></div>`

export interface NightPanelHandle extends PvRoot { destroy(): void }

export function NightPanel(api: Backend, night: NightMode, clock: () => Date = () => new Date()): NightPanelHandle {
  const root = pvRoot('night-pv is-loading') as NightPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Night')
  const $ = <T extends HTMLElement | SVGElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  let alive = true
  let seq = 0
  let plan: NightPlan | null = null
  let loaded = false
  let instant = false
  const shown: Record<string, string> = {}
  const put = (k: string, html: string) => { if (shown[k] === html) return; shown[k] = html; const el = $(k); el.innerHTML = html; animateIn(el, instant || reducedMotion()) }
  const putText = (k: string, t: string) => { if (shown[k] !== t) { shown[k] = t; $(k).textContent = t } }

  function loadTicks(p: NightPlan): boolean[] {
    try { const a = JSON.parse(localStorage.getItem(ticksKey(p)) ?? '[]') as unknown; return tickCards(p).map((_, i) => Array.isArray(a) && a[i] === true) } catch { return tickCards(p).map(() => false) }
  }

  function paint() {
    if (!plan) return
    const p = plan
    const now = clock()
    root.classList.remove('is-loading', 'is-err')
    putText('cap', `● Wind down · ${eveningName(p)}`)
    const lo = clockPm(p.lightsOut)
    const [t, ap] = lo.split(' ')
    const lt = $('lt')
    if (shown.lt !== lo) { shown.lt = lo; lt.innerHTML = `${esc(t)}<em> ${esc(ap)}</em>` }
    putText('left', untilLabel(p.lightsOut, now))
    const ev = p.event
    const evText = ev ? (ev.kind === 'shift' ? `SHIFT ${clockPm(ev.at).toUpperCase()} TOMORROW` : `${ev.label.toUpperCase()}`) : 'NOTHING ON TOMORROW'
    put('arc', `<defs><linearGradient id="nsa" x1="0" x2="1"><stop offset="0" stop-color="#FFC23D"/><stop offset=".35" stop-color="#8b7bff"/><stop offset=".8" stop-color="#8b7bff"/><stop offset="1" stop-color="#FFB066"/></linearGradient></defs>
      <path d="${ARC}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8" stroke-linecap="round"/>
      <path class="anim-arc" data-f="${p.f}" d="${ARC}" fill="none" stroke="url(#nsa)" stroke-width="8" stroke-linecap="round" style="filter:drop-shadow(0 0 6px #8b7bff)"/><circle class="anim-knob" r="7" fill="#fff" style="filter:drop-shadow(0 0 8px #fff)"/>
      ${[['5 PM', 10, 100], [clock12(p.lightsOut), 112, 40], [clock12(p.alarm), 214, 40], [clock12(ev?.at ?? p.alarm), 290, 100]].map(([l, x, y]) => `<text x="${x}" y="${(y as number) + 18}" text-anchor="middle" font-family="Geist Mono" font-size="8" fill="rgba(200,195,255,.78)">${l}</text>`).join('')}
      <text x="150" y="70" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="13" fill="#fff">${SLEEP_H}h sleep</text><text x="150" y="84" text-anchor="middle" font-family="Geist Mono" font-size="7.5" fill="rgba(200,195,255,.78)" letter-spacing="1.5">${esc(evText.length > 34 ? evText.slice(0, 33) + '.' : evText)}</text>`)
    const ticks = loadTicks(p)
    put('cards', tickCards(p).map((c, i) => `<button type="button" class="nck pop${ticks[i] ? ' done' : ''}" style="--i:${i + 1}" data-tick="${i}" role="switch" aria-checked="${ticks[i]}"><span class="tick"></span><b data-ellipsis>${esc(c.title)}</b><small>${esc(c.sub)}</small></button>`).join(''))
  }

  async function load(first = false) {
    const my = ++seq
    try {
      const now = clock()
      const from = new Date(perthDayStart(planNight(now, [], []).evening).getTime() + DAY)
      const to = new Date(from.getTime() + DAY)
      const [sh, ts] = await Promise.all([api.shiftsBetween(from, to), api.testsBetween(from, to)])
      if (!alive || my !== seq) return
      plan = planNight(now, sh, ts)
      loaded = true
      paint()
      if (first && root.classList.contains('on')) animateIn(root, reducedMotion())
    } catch {
      if (!alive || my !== seq) return
      if (!loaded) { root.classList.remove('is-loading'); root.classList.add('is-err'); $('errMsg').textContent = navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Reconnect and try again." }
    }
  }

  // Night mode switch. Its state is the same one the island reads.
  const syncSwitch = (on: boolean) => { const b = $('nm'); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)) }
  syncSwitch(night.get())
  const offNight = night.subscribe(syncSwitch)
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-k="nm"]')) { night.set(!night.get()); tip(root, night.get() ? 'Night mode on. Banners are muted, leave reminders still show.' : 'Night mode off.'); return }
    const c = t.closest<HTMLElement>('[data-tick]')
    if (c && plan) {
      const ticks = loadTicks(plan)
      const i = Number(c.dataset.tick)
      ticks[i] = !ticks[i]
      try { localStorage.setItem(ticksKey(plan), JSON.stringify(ticks)) } catch { /* private mode: lasts until the tab changes */ }
      c.classList.toggle('done', ticks[i]); c.setAttribute('aria-checked', String(ticks[i]))
      shown.cards = $('cards').innerHTML // the card is already right, so a repaint finds nothing to do
    }
  })
  $('retry').addEventListener('click', () => { root.classList.remove('is-err'); root.classList.add('is-loading'); void load(true) })

  // Every 30 s the "to go" text and the knob move on, and a new evening rolls the plan over. Nothing else is touched.
  const tick = window.setInterval(() => {
    if (!alive || document.hidden || !plan) return
    const now = clock()
    putText('left', untilLabel(plan.lightsOut, now))
    const next = planNight(now, [], []).evening
    if (next !== plan.evening) return void load()
    const arc = root.querySelector<SVGPathElement>('.anim-arc')
    if (arc) { const f = Math.min(1, Math.max(0, (now.getTime() - (perthDayStart(plan.evening).getTime() + 17 * 36e5)) / ((plan.event?.at ?? plan.alarm).getTime() - (perthDayStart(plan.evening).getTime() + 17 * 36e5)))); if (Math.abs(f - Number(arc.dataset.f)) > 0.004) { arc.dataset.f = String(f); animateIn(arc.parentElement as unknown as Element, true) } }
  }, 30_000)

  const baseEnter = root.enter
  root.enter = () => {
    instant = false
    for (const k of Object.keys(shown)) delete shown[k]
    baseEnter()
    if (loaded) paint()
    setTimeout(() => { instant = true }, 1200)
    void load(!loaded)
  }
  root.destroy = () => { alive = false; clearInterval(tick); offNight() }
  return root
}
