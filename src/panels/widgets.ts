import '../styles/tokens.css'
import '../styles/proto.css'
import './widgets.css'
import type { Backend } from '../types'
import type { Weather } from '../lib/weather'
import type { Battery } from '../lib/helper'
import { GAMES, daysUntil, dateLabel, gamesKey, parseTicks, shortWhen, weekOfYear, weekStrip, yearProgress, type Countdown } from '../lib/widgets'
import { perthDate } from '../lib/money'
import { animateIn, pvRoot, reducedMotion, ring, type PvRoot } from '../ui/charts'
import { openSheet } from '../ui/sheet'

// Widgets tab (card 22), the compact grid family: #1c1c1e tiles, a 1 px border, blue for today. A Perth clock, the week strip,
// three countdowns (Doomsday, birthday and Christmas, from the countdowns table), the year as 52 dots, the week of the year,
// daily games ticks (kept on this device), Perth weather, laptop battery and the next shift.
// Built once. The minute tick only changes the clock text, a tick only the game's own row.

export interface WidgetSources {
  weather(): Promise<Weather | null>
  battery(): Promise<Battery | null>
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clockFmt = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone: 'Australia/Perth' })
const dateFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Perth' })
const monthFmt = new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'Australia/Perth' })

const cell = (cls: string, i: number, k: string, attrs = '') => `<div class="mw ${cls} pop" style="--i:${i}" data-k="${k}" ${attrs}></div>`
const TEMPLATE = `<div class="mG">
  ${cell('c2', 0, 'clock')}${cell('c2', 1, 'week')}${cell('', 2, 'cd0')}${cell('', 3, 'cd1')}
  ${cell('c2', 4, 'year')}${cell('', 5, 'cd2')}${cell('', 6, 'wk')}${cell('c2 r2', 7, 'games')}
  ${cell('', 8, 'weather')}${cell('', 9, 'battery')}${cell('c2', 10, 'next')}
</div>
<div class="wdErr" role="alert"><span>Can't load your widgets.</span><button type="button" data-k="retry">Try again</button></div>`

export function WidgetsPanel(api: Backend, src: WidgetSources, clock: () => Date = () => new Date()): PvRoot & { destroy(): void } {
  const root = pvRoot('widgets-pv') as PvRoot & { destroy(): void }
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Widgets')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  let alive = true
  let seq = 0
  let cds: Countdown[] = []
  let cdsLoaded = false
  let weather: Weather | null | undefined
  let battery: Battery | null | undefined
  let next: { starts_at: string } | null | undefined
  let instant = false
  const shown: Record<string, string> = {}
  const put = (k: string, html: string) => { if (shown[k] === html) return; shown[k] = html; const el = $(k); el.innerHTML = html; animateIn(el, instant || reducedMotion()) }

  // ---- Each tile paints on its own.
  function paintClock() {
    const now = clock()
    put('clock', `<div class="l">Perth</div><div class="bigClock num">${clockFmt.format(now)}</div><div class="l" style="margin-top:2px">${dateFmt.format(now)}</div>`)
    put('week', `<div class="l">${monthFmt.format(now)}</div><div class="calw">${weekStrip(now).map((d) => `<div class="${d.today ? 'on' : ''}"><small>${d.letter}</small><b>${d.day}</b></div>`).join('')}</div>`)
    const y = yearProgress(now)
    put('year', `<div class="l" style="display:flex;justify-content:space-between"><span>${perthDate(now).slice(0, 4)}</span><span style="color:#30D158">${Math.round(y.f * 100)}%</span></div><div class="dm" role="img" aria-label="${Math.round(y.f * 100)} percent of the year gone">${Array.from({ length: y.dots }, (_, i) => `<i class="${i < y.filled ? 'on' : i === y.filled ? 'now' : ''}"></i>`).join('')}</div>`)
    const wk = weekOfYear(now)
    put('wk', `<div class="rw">${ring('#BF5AF2', Math.min(1, wk / 52), 34, 4)}<div><div class="l">Week</div><div class="v num" style="font-size:16px">${wk}</div></div></div>`)
    paintCountdowns()
    paintNext()
  }
  function paintCountdowns() {
    const now = clock()
    for (let i = 0; i < 3; i++) {
      const c = cds[i]
      if (!c) { put(`cd${i}`, cdsLoaded ? '<div class="l">Countdown</div><div class="v nil">None</div>' : '<div class="skel" style="width:60px;height:10px"></div><div class="skel" style="width:40px;height:20px;margin-top:6px"></div>'); continue }
      put(`cd${i}`, `<button type="button" class="cdb" data-cd="${esc(c.id)}" aria-label="${esc(c.name)}, ${daysUntil(c, now)} days. Edit"><div class="l" data-ellipsis>${esc(c.name)}</div><div class="v num" style="color:${c.colour}">${daysUntil(c, now)}<span class="u"> d</span></div><div class="l">${esc(dateLabel(c, now))}</div></button>`)
    }
  }
  function paintGames() {
    const now = clock()
    let ticks: boolean[] = []
    try { ticks = parseTicks(localStorage.getItem(gamesKey(now))) } catch { ticks = parseTicks(null) }
    const n = ticks.filter(Boolean).length
    const html = `<div class="l gl">Daily games · <span class="gn" style="color:#30D158">${n}/${GAMES.length}</span></div><div class="gml">${GAMES.map((g, i) => `<button type="button" class="${ticks[i] ? 'done' : ''}" data-game="${i}" aria-pressed="${ticks[i]}"><i></i>${esc(g)}</button>`).join('')}</div>`
    put('games', html)
  }
  function paintWeather() {
    if (weather === undefined) return put('weather', '<div class="skel" style="width:40px;height:10px"></div><div class="skel" style="width:36px;height:20px;margin-top:6px"></div>')
    if (!weather) return put('weather', '<div class="l">Perth</div><div class="v nil" style="font-size:14px">Offline</div><div class="l">No forecast</div>')
    put('weather', `<div class="l">Perth</div><div class="v num">${weather.temp}°</div><div class="l" data-ellipsis>${esc(weather.desc)}${weather.chance >= 20 ? ` ${weather.chance}%` : ''}</div>`)
  }
  function paintBattery() {
    if (battery === undefined) return put('battery', '<div class="skel" style="width:40px;height:10px"></div><div class="skel" style="width:36px;height:20px;margin-top:6px"></div>')
    if (!battery || !battery.present || battery.percent == null) return put('battery', `<div class="l">Laptop</div><div class="v nil" style="font-size:14px">${battery === null ? 'Helper off' : 'Plugged in'}</div><div class="l">${battery === null ? 'Start Halo helper' : 'No battery'}</div>`)
    const p = battery.percent
    put('battery', `<div class="rw">${ring(p <= 20 && !battery.charging ? '#FF453A' : '#30D158', p / 100, 34, 4)}<div><div class="l">Battery</div><div class="v num" style="font-size:16px">${p}</div></div></div>`)
  }
  function paintNext() {
    const now = clock()
    if (next === undefined) return put('next', '<div class="skel" style="width:50px;height:10px"></div><div class="skel" style="width:110px;height:16px;margin-top:6px"></div>')
    if (!next) return put('next', '<div class="l">Next up</div><div class="v nil" style="font-size:15px">Nothing booked</div><div class="l">No shifts coming up</div>')
    const at = new Date(next.starts_at)
    const mins = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60_000))
    const left = mins >= 1440 ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h` : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
    put('next', `<div class="l">Next up</div><div class="v" style="font-size:15px">Shift · ${esc(shortWhen(at))}</div><div class="l" style="color:#FF9F0A">${at.getTime() <= now.getTime() ? 'on now' : `in ${left}`}</div>`)
  }

  async function load() {
    const my = ++seq
    try {
      let list = await api.countdowns()
      if (!list.length) { await api.seedCountdowns(); list = await api.countdowns() }
      if (!alive || my !== seq) return
      cds = list; cdsLoaded = true
      root.classList.remove('is-err')
      paintCountdowns()
    } catch { if (alive && my === seq && !cdsLoaded) root.classList.add('is-err') }
    try { const s = await api.nextShift(clock()); if (alive && my === seq) { next = s; paintNext() } } catch { if (alive && next === undefined) { next = null; paintNext() } }
  }
  const loadWeather = () => src.weather().then((w) => { weather = w; paintWeather() }, () => { weather = null; paintWeather() })
  const loadBattery = () => src.battery().then((b) => { battery = b; paintBattery() }, () => { battery = null; paintBattery() })

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const g = t.closest<HTMLElement>('[data-game]')
    if (g) {
      const now = clock()
      const ticks = (() => { try { return parseTicks(localStorage.getItem(gamesKey(now))) } catch { return parseTicks(null) } })()
      ticks[Number(g.dataset.game)] = !ticks[Number(g.dataset.game)]
      try { localStorage.setItem(gamesKey(now), JSON.stringify(ticks)) } catch { /* private mode: the tick lasts until the tab changes */ }
      // Only this row and the count change.
      g.classList.toggle('done', ticks[Number(g.dataset.game)]); g.setAttribute('aria-pressed', String(ticks[Number(g.dataset.game)]))
      const n = $('games').querySelector('.gn'); if (n) n.textContent = `${ticks.filter(Boolean).length}/${GAMES.length}`
      shown.games = $('games').innerHTML
      return
    }
    const cd = t.closest<HTMLElement>('[data-cd]')
    if (cd) {
      const c = cds.find((x) => x.id === cd.dataset.cd)
      if (!c) return
      openSheet(root, {
        title: `Edit ${c.name}`, submit: 'Save',
        fields: [{ key: 'name', label: 'Name', type: 'text', value: c.name, span: 2 }, { key: 'date', label: c.yearly ? 'Date (every year)' : 'Date', type: 'date', value: c.target_date, span: 2 }],
        onSubmit: async (v) => {
          if (!v.name) return 'Give it a name.'
          if (v.name.length > 24) return 'Keep the name under 24 letters.'
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return 'Pick a date.'
          await api.saveCountdown({ id: c.id, name: v.name, target_date: v.date })
          await load()
        },
      })
    }
  })
  $('retry').addEventListener('click', () => { root.classList.remove('is-err'); void load() })

  // The minute hand: the clock text moves, nothing else is touched unless it changed.
  const tick = window.setInterval(() => { if (alive && !document.hidden) paintClock() }, 15_000)
  const baseEnter = root.enter
  root.enter = () => {
    instant = false
    for (const k of Object.keys(shown)) delete shown[k]
    baseEnter()
    paintClock(); paintGames(); paintWeather(); paintBattery()
    void load(); void loadWeather(); void loadBattery()
    setTimeout(() => { instant = true }, 1200)
  }
  root.destroy = () => { alive = false; clearInterval(tick) }
  return root
}
