import '../styles/tokens.css'
import '../styles/proto.css'
import './homeTab.css'
import type { Backend, Settings, Shift, Test } from '../types'
import { calcWeek, cumulativeGross, perthWeekStart } from '../lib/pay'
import { studyStreak, type SessionLike } from '../lib/study'
import { fmtClockPm, fmtDayMonth, shiftView } from '../lib/now-model'
import { getTravelMinutes } from '../lib/now'
import { contrastOnBlack, perthDay, perthTime, teamColour, type NbaResponse } from '../lib/sixers'
import { fetchPerthWeather, type Weather } from '../lib/weather'
import { getArtUrl, getBattery, getMedia, mediaControl, type Battery, type Media } from '../lib/helper'
import { animateIn, ring, pvRoot, type PvRoot } from '../ui/charts'

// Home tab (card 16): the prototype's dense widget grid, 5 x 3. Next shift, pay this week, Perth weather, laptop battery,
// study streak, Spotify, Sixers, ATAR, alerts, daily games, coming up and Claude. Each widget opens its tab.
// Widgets whose data is not built yet (ATAR, alerts, games) show a quiet empty state, never made up numbers.
// It is built once. Each widget redraws only when its own data changes, and a redraw after the entrance never replays it.

const DAY = 864e5
const HOUR = 36e5

/** Where the live data comes from. The dev preview swaps these for fixtures. */
export interface HomeSources {
  weather(): Promise<Weather | null>
  battery(): Promise<Battery | null>
  media(): Promise<Media | null>
  art(): Promise<string | null>
  control(a: 'toggle' | 'next' | 'previous'): Promise<void>
}
export const liveSources: HomeSources = {
  weather: fetchPerthWeather, battery: getBattery, media: getMedia, art: getArtUrl, control: (a) => mediaControl(a),
}

export interface HomeTabOptions {
  api: Backend
  sources?: HomeSources
  clock?: () => Date
  /** A widget was pressed. `tab` is a shell tab id such as 'pay' or 'controls'. */
  go?: (tab: string) => void
}
export interface HomeTabHandle extends PvRoot {
  refresh(): void
  setGame(r: NbaResponse | null): void
  tick(now: Date): void
  /** On while the tab is on screen: only then does it poll the helper and the weather. */
  setActive(on: boolean): void
  destroy(): void
}

const I: Record<string, string> = {
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/>',
  cash: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  rain: '<path d="M7 15a5 5 0 1 1 1.6-9.7A6 6 0 0 1 20 9a4 4 0 0 1-1 7.9H7z" fill="currentColor"/>',
  bat: '<rect x="2" y="7" width="17" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="4.5" y="9.5" width="9" height="5" rx="1.2" fill="currentColor"/><path d="M21 10v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" fill="currentColor"/>',
  cap: '<path d="M12 3l9 5-9 5-9-5z" fill="currentColor"/><path d="M7 10.5V16c0 1 2.2 3 5 3s5-2 5-3v-5.5" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  bell: '<path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4" fill="currentColor"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5.5" fill="currentColor"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="2.4"/>',
}
const dh = (ic: string, label: string, right = '') => `<div class="dpH"><span class="dpI"><svg viewBox="0 0 24 24" aria-hidden="true">${I[ic]}</svg></span><span class="dpL">${label}</span>${right}</div>`
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>'
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const skel = (c = '') => `<span class="skel ${c}"></span>`

/** "5h 12m", "2d 4h", "now". */
export function hrsTo(ms: number): string {
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / HOUR)
  const m = Math.floor((ms % HOUR) / 60_000)
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`
}
/** "6:30" on a clock, no am or pm, minutes dropped on the hour. */
const clockShort = (t: number) => fmtClockPm(t).replace(/ (am|pm)$/, '').replace(':00', '')
const dow3 = (t: number) => fmtDayMonth(t).slice(0, 3)
/** "Sat 9:25 pm": the weekday and the time, in Perth. */
const dayTime = (iso: string) => `${perthDay(iso).split(' ')[0]} ${perthTime(iso)}`
const subjectShort = (name: string) => { const w = name.trim().split(/\s+/)[0]; return w.length > 9 ? `${w.slice(0, 8)}.` : w }

interface Widget { el: HTMLElement; key: string }

export function HomeTab(o: HomeTabOptions): HomeTabHandle {
  const root = pvRoot('home-pv') as HomeTabHandle
  const src = o.sources ?? liveSources
  const clock = o.clock ?? (() => new Date())
  root.setAttribute('aria-label', 'Home')
  let alive = true
  let entered = false
  let active = false
  const W: Record<string, Widget> = {}

  // ---- The grid. Order matters: the dense flow tucks the one column widgets into the gaps beside the two column ones.
  const DEFS: [string, string, string, string | null][] = [
    ['shift', '', '#FF8A1E', 'week'], ['pay', '', '#5CFF7A', 'pay'], ['weather', '', '#64B5FF', null], ['laptop', '', '#30D158', 'controls'],
    ['music', 'c2 dpMu', '#ff2fa3', 'music'], ['sixers', 'c2 dpNb', '#2f86ff', 'sixers'], ['streak', '', '#9fb0ff', 'study'], ['atar', '', '#FFC23D', null],
    ['alerts', '', '#FF453A', null], ['games', '', '#FF2FA3', null], ['coming', 'c2', '#BF5AF2', 'week'], ['claude', 'dpCl', '#ff7ac8', null],
  ]
  const grid = document.createElement('div')
  grid.className = 'dG'
  DEFS.forEach(([id, cls, c, go], i) => {
    const el = document.createElement('div')
    el.className = `dp ${cls} pop${go ? ' go' : ''}`
    el.style.setProperty('--i', String(i)); el.style.setProperty('--c', c)
    if (go) { el.setAttribute('role', 'button'); el.tabIndex = 0; el.dataset.go = go }
    el.dataset.widget = id
    grid.append(el)
    W[id] = { el, key: '' }
  })
  root.append(grid)
  grid.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.dpPl')) return
    const go = (e.target as HTMLElement).closest<HTMLElement>('.dp.go')?.dataset.go
    if (go) o.go?.(go)
  })
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const t = e.target as HTMLElement
    if (t.classList.contains('dp') && t.dataset.go) { e.preventDefault(); o.go?.(t.dataset.go) }
  })

  /** Redraw a widget only when its key changed. After the entrance a redraw settles at once instead of replaying. */
  function paint(id: string, key: string, html: string, after?: (el: HTMLElement) => void) {
    const w = W[id]
    if (w.key === key) return
    w.key = key
    w.el.innerHTML = html
    after?.(w.el)
    animateIn(w.el, entered)
  }
  const empty = (id: string, ic: string, label: string, big: string, sub: string, tag = '') =>
    paint(id, `e:${big}:${sub}`, `${dh(ic, label, tag)}<div class="dpV dpE">${esc(big)}</div><div class="dpS">${esc(sub)}</div>`)

  // ---- State
  let shift: Shift | null | undefined // undefined: loading
  let payWeek: { gross: number; hours: number; cum: number[] } | null | undefined
  let streak: { days: number; week: boolean[] } | null | undefined
  let coming: { dow: string; name: string; when: string; c: string }[] | null | undefined
  let weather: Weather | null | undefined
  let battery: Battery | null | undefined
  let media: Media | null | undefined
  let art: string | null = null
  let artKey = ''
  let game: NbaResponse | null | undefined

  // ---- Widgets
  function drawShift(now: Date) {
    if (shift === undefined) return paint('shift', 'load', `${dh('bolt', 'Next shift')}${skel()}${skel('s')}`)
    if (!shift) return empty('shift', 'bolt', 'Next shift', 'None', 'Nothing rostered')
    const sv = shiftView(shift, now, getTravelMinutes())
    const big = sv.phase === 'live' ? 'Now' : `${fmtClockPm(sv.start).replace(/ (am|pm)$/, "")}<small> ${dow3(sv.start)}</small>`
    paint('shift', `s:${shift.id}:${sv.phase}`, `${dh('bolt', sv.phase === 'live' ? 'On shift' : 'Next shift')}<div class="dpV num">${big}</div><div class="dpBar"><i data-bar="0"></i></div><div class="dpS num"></div>`)
    tickShift(now)
  }
  function tickShift(now: Date) {
    const el = W.shift.el
    if (!shift || !el.querySelector('.dpBar')) return
    const sv = shiftView(shift, now, getTravelMinutes())
    const text = sv.phase === 'live' ? `ends in ${hrsTo(sv.msToEnd)}` : `in ${hrsTo(sv.msToStart)}`
    const sub = el.querySelector<HTMLElement>('.dpS')!
    if (sub.textContent !== text) sub.textContent = text
    const f = sv.phase === 'live' ? (sv.end > sv.start ? (now.getTime() - sv.start) / (sv.end - sv.start) : 1) : 1 - Math.min(sv.msToStart, DAY) / DAY
    const bar = el.querySelector<HTMLElement>('.dpBar i')!
    const w = String(Math.round(Math.min(1, Math.max(0, f)) * 100))
    if (bar.dataset.bar !== w) { bar.dataset.bar = w; bar.style.width = `${w}%` }
  }

  function drawPay() {
    if (payWeek === undefined) return paint('pay', 'load', `${dh('cash', 'Pay', '<em class="dpT">WEEK</em>')}${skel()}${skel('s')}`)
    if (!payWeek) return empty('pay', 'cash', 'Pay', 'Can’t load', 'Try again soon', '<em class="dpT">WEEK</em>')
    const p = payWeek
    const top = Math.max(1, p.cum[6])
    const pts = p.cum.map((v, i) => `${i * 10},${(17 - (v / top) * 16).toFixed(1)}`).join(' ')
    paint('pay', `p:${Math.round(p.gross)}:${p.hours.toFixed(1)}`, `${dh('cash', 'Pay', '<em class="dpT">WEEK</em>')}<div class="dpV num">$${Math.round(p.gross)}</div>${p.gross > 0 ? `<svg class="dpSp" viewBox="0 0 60 18" preserveAspectRatio="none" aria-hidden="true"><polyline class="anim-line" points="${pts}" fill="none" stroke="#5CFF7A" stroke-width="2" style="filter:drop-shadow(0 0 3px #5CFF7A)"/></svg>` : ''}<div class="dpS num">${p.hours > 0 ? `${Number(p.hours.toFixed(1))} h` : 'No shifts yet'}</div>`)
  }

  function drawWeather() {
    if (weather === undefined) return paint('weather', 'load', `${dh('rain', 'Perth')}${skel()}${skel('s')}`)
    if (!weather) return empty('weather', 'rain', 'Perth', 'Offline', 'No forecast')
    const w = weather
    paint('weather', `w:${w.temp}:${w.desc}:${w.chance}`, `${dh('rain', 'Perth')}<div class="dpV num">${w.temp}°</div><div class="dpDrops" aria-hidden="true">${w.hours.map((h) => `<i style="height:${Math.round(Math.max(0.12, h) * 100)}%"></i>`).join('')}</div><div class="dpS">${esc(w.desc)}${w.chance >= 20 ? ` ${w.chance}%` : ''}</div>`)
  }

  function drawLaptop() {
    if (battery === undefined) return paint('laptop', 'load', `${dh('bat', 'Laptop')}${skel()}${skel('s')}`)
    if (!battery || !battery.present || battery.percent == null) return empty('laptop', 'bat', 'Laptop', battery === null ? 'Helper off' : 'Plugged in', battery === null ? 'Start Halo helper' : 'No battery')
    const b = battery
    const pct: number = battery.percent
    const sub = b.charging ? 'Charging' : b.minutes_left != null ? hrsTo(b.minutes_left * 60_000) : 'On battery'
    const c = pct <= 20 && !b.charging ? '#FF453A' : '#30D158'
    paint('laptop', `b:${pct}:${b.charging}:${b.minutes_left}`, `${dh('bat', 'Laptop')}<div class="dpRing">${ring(c, pct / 100, 34, 4)}<div><div class="dpV num">${pct}%</div><div class="dpS num">${esc(sub)}</div></div></div>`)
  }

  function drawMusic() {
    const base = `<div class="dpArt" style="${art ? `background-image:url(&quot;${art}&quot;)` : ''}"></div>`
    if (media === undefined) return paint('music', 'load', `${base}<div class="dpMuT"><div class="dpL">Spotify</div>${skel('s')}</div>`)
    if (!media || !media.available || !media.title) {
      return paint('music', `m:none:${media === null}`, `${base}<div class="dpMuT"><div class="dpL">Music</div><b class="dpTt">Nothing playing</b><div class="dpS">${media === null ? 'Start Halo helper' : 'Open Spotify'}</div></div><div class="dpEq" aria-hidden="true"></div><button type="button" class="dpPl" disabled aria-label="Play">${PLAY}</button>`)
    }
    const m = media
    const key = `m:${m.title}:${m.artist}:${m.playing}:${art ? 1 : 0}`
    paint('music', key, `${base}<div class="dpMuT"><div class="dpL" style="color:#1ED760">${esc(m.source || 'Music')}</div><b class="dpTt" data-ellipsis title="${esc(m.title)}">${esc(m.title)}</b><div class="dpS dpAr" data-ellipsis>${esc(m.artist)}</div></div><div class="dpEq ${m.playing ? 'on' : ''}" aria-hidden="true">${[.5, .9, .6, 1, .4, .8, .55].map((h, i) => `<i style="--h:${h};animation-delay:${i * .11}s"></i>`).join('')}</div><button type="button" class="dpPl" aria-label="${m.playing ? 'Pause' : 'Play'}">${m.playing ? PAUSE : PLAY}</button>`, (el) => {
      el.querySelector('.dpPl')?.addEventListener('click', (e) => { e.stopPropagation(); void src.control('toggle').then(pollMedia) })
    })
  }
  function drawSixers() {
    if (game === undefined) return paint('sixers', 'load', `<div class="dpNbE">${skel()}${skel('s')}</div>`)
    const g = game?.game
    if (!g) {
      const n = game?.next
      if (!n) return paint('sixers', 'none', `<div class="dpNbE">${dh('game', 'Sixers')}<div class="dpV dpE">No game</div><div class="dpS">${game ? 'Nothing coming up' : 'Can’t load the score'}</div></div>`)
      return paint('sixers', `n:${n.startsAt}`, `${team('PHI', '', '')}<div class="dpMid"><em>NEXT</em><span>${n.home ? 'v' : 'at'} ${esc(n.opponent.tri)}</span><span>${esc(dayTime(n.startsAt))}</span></div>${team(n.opponent.tri, '', 'r')}`)
    }
    const live = g.status === 'live'
    const fin = g.status === 'final'
    const won = fin && g.sixers.score > g.opponent.score
    const em = live ? g.statusText.toUpperCase() : fin ? `FINAL · ${won ? 'W' : 'L'}` : 'TIP OFF'
    const sub = fin && game?.next ? `v ${game.next.opponent.tri}` : `${g.home ? 'v' : 'at'} ${g.opponent.tri}`
    const sub2 = fin && game?.next ? dayTime(game.next.startsAt) : g.status === 'scheduled' ? dayTime(g.startsAt) : ''
    const a = g.status === 'scheduled' ? '' : String(g.sixers.score)
    const b = g.status === 'scheduled' ? '' : String(g.opponent.score)
    paint('sixers', `g:${g.status}:${g.sixers.score}:${g.opponent.score}:${g.statusText}:${sub2}`, `${team('PHI', a, '', fin && !won)}<div class="dpMid"><em class="${live ? 'live' : ''}">${esc(em)}</em><span>${esc(sub)}</span>${sub2 ? `<span>${esc(sub2)}</span>` : ''}</div>${team(g.opponent.tri, b, 'r', fin && won)}`)
  }
  function team(tri: string, score: string, side: string, lose = false) {
    const c = teamColour(tri)
    const ink = contrastOnBlack(c) > 8 ? '#000' : '#fff'
    const badge = `<span class="dpLogo" style="background:${c};color:${ink}">${esc(tri)}</span>`
    const num = score ? `<b class="num ${lose ? 'lose' : ''}">${esc(score)}</b>` : ''
    return `<div class="dpTm ${side}">${side ? num + badge : badge + num}</div>`
  }

  function drawStreak() {
    if (streak === undefined) return paint('streak', 'load', `${dh('book', 'Streak')}${skel()}${skel('s')}`)
    if (!streak) return empty('streak', 'book', 'Streak', 'Can’t load', 'Try again soon')
    const s = streak
    paint('streak', `st:${s.days}:${s.week.join('')}`, `${dh('book', 'Streak')}<div class="dpV num">${s.days}<small> ${s.days === 1 ? 'day' : 'days'}</small></div><div class="dpWk" role="img" aria-label="Days studied this week">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => `<i class="${s.week[i] ? 'on' : ''}">${d}</i>`).join('')}</div>`)
  }

  function drawComing() {
    if (coming === undefined) return paint('coming', 'load', `${dh('cal', 'Coming up')}${skel()}`)
    if (!coming) return empty('coming', 'cal', 'Coming up', 'Can’t load', 'Try again soon')
    if (!coming.length) return empty('coming', 'cal', 'Coming up', 'Clear', 'Nothing else this fortnight')
    paint('coming', `c:${coming.map((x) => x.dow + x.name + x.when).join('|')}`, `${dh('cal', 'Coming up')}<div class="dpUp">${coming.map((x) => `<div style="--k:${x.c}"><small>${esc(x.dow)}</small><b>${esc(x.name)}</b><span>${esc(x.when)}</span></div>`).join('')}</div>`, fitAll)
  }
  /** Shrink a label that would not fit its column, down to a floor, instead of cutting it off. */
  function fitAll(el: HTMLElement) {
    el.querySelectorAll<HTMLElement>('.dpUp b').forEach((b) => {
      let px = 10
      b.style.fontSize = `${px}px`
      while (b.scrollWidth > b.clientWidth + 0.5 && px > 7) b.style.fontSize = `${(px -= 0.5)}px`
    })
  }

  function drawStatic() {
    empty('atar', 'cap', 'ATAR', 'Soon', 'Needs Marks', '<em class="dpT">SOON</em>')
    empty('alerts', 'bell', 'Alerts', 'Soon', 'Not set up yet')
    empty('games', 'game', 'Daily games', 'Soon', 'Not set up yet')
    paint('claude', 'c', '<div class="lumMini"><i class="b b1"></i><i class="b b2"></i><i class="b b3"></i><i class="spec"></i><i class="rim"></i></div><div><div class="dpL">Claude</div><b>Ask…</b></div>')
  }

  function drawAll() { const now = clock(); drawShift(now); drawPay(); drawWeather(); drawLaptop(); drawMusic(); drawSixers(); drawStreak(); drawComing(); drawStatic() }

  // ---- Data
  let seq = 0
  async function load() {
    const my = ++seq
    const now = clock()
    const ws = perthWeekStart(now)
    const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null)
    const [sh, wk, st, up, tests, sess] = await Promise.allSettled([
      o.api.nextShift(now), o.api.shiftsBetween(ws, new Date(ws.getTime() + 7 * DAY)), o.api.settings(),
      o.api.shiftsBetween(now, new Date(now.getTime() + 14 * DAY)), o.api.upcomingTests(now), o.api.sessionsSince(new Date(now.getTime() - 60 * DAY)),
    ])
    if (!alive || my !== seq) return
    shift = sh.status === 'fulfilled' ? sh.value : shift ?? null
    const settings = ok<Settings>(st)
    const shifts = ok<Shift[]>(wk)
    if (shifts && settings) { const w = calcWeek(shifts, ws, settings); payWeek = { gross: w.gross, hours: w.hours, cum: cumulativeGross(w) } } else payWeek = payWeek ?? null
    const rows = ok<SessionLike[]>(sess)
    streak = rows ? studyStreak(rows, now) : streak ?? null
    const ups = ok<Shift[]>(up)
    const ts = ok<Test[]>(tests)
    if (ups || ts) {
      const items: { t: number; dow: string; name: string; when: string; c: string }[] = []
      for (const s of ups ?? []) {
        if (shift && s.id === shift.id) continue
        const a = Date.parse(s.starts_at)
        if (a < now.getTime()) continue
        const st2 = s.station?.trim()
        items.push({ t: a, dow: dow3(a).toUpperCase(), name: st2 ? (st2.length <= 3 ? `${st2} shift` : st2) : 'Shift', when: `${clockShort(a)} to ${clockShort(Date.parse(s.ends_at))}`, c: '#FF8A1E' })
      }
      for (const t of ts ?? []) { const a = Date.parse(t.due_at); items.push({ t: a, dow: dow3(a).toUpperCase(), name: `${subjectShort(t.subject)} test`, when: clockShort(a), c: '#3D9BFF' }) }
      coming = items.sort((x, y) => x.t - y.t).slice(0, 3)
    } else coming = coming ?? null
    drawAll()
  }

  async function pollMedia() {
    const m = await src.media()
    if (!alive) return
    media = m
    const k = m ? `${m.title}|${m.artist}` : ''
    if (k !== artKey) {
      artKey = k
      if (art) URL.revokeObjectURL(art)
      art = m?.has_art ? await src.art() : null
    }
    drawMusic()
  }
  async function pollBattery() { const b = await src.battery(); if (alive) { battery = b; drawLaptop() } }
  async function pollWeather() { const w = await src.weather(); if (alive) { weather = w; drawWeather() } }

  // Only poll while the tab is on screen (HALO.md 3.8): media every 3 s, battery every 30 s, weather every 15 minutes.
  const timers: number[] = []
  function setActive(on: boolean) {
    if (on === active) return
    active = on
    timers.splice(0).forEach(clearInterval)
    if (!on || !alive) return
    void pollMedia(); void pollBattery(); void pollWeather()
    timers.push(window.setInterval(() => void pollMedia(), 3000), window.setInterval(() => void pollBattery(), 30_000), window.setInterval(() => void pollWeather(), 15 * 60_000))
  }

  const baseEnter = root.enter
  root.enter = () => {
    entered = false
    for (const w of Object.values(W)) w.key = '' // redraw every widget so the rings, bars and lines fill again
    baseEnter()
    drawAll() // painted after the pop classes are on, so animateIn sees the final layout
    entered = true
  }
  root.setGame = (r) => { game = r; drawSixers() }
  root.tick = (now) => tickShift(now)
  root.setActive = setActive
  root.refresh = () => void load()
  root.destroy = () => { alive = false; setActive(false); if (art) URL.revokeObjectURL(art) }
  drawAll()
  void load()
  return root
}
