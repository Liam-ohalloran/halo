import '../styles/tokens.css'
import '../styles/proto.css'
import './study.css'
import type { Backend } from '../types'
import { DAILY_GOAL_MIN, dotsFor, elapsedMs, studyStreak, summariseWeek, todayMinutes, type SessionLike, type WeekSummary } from '../lib/study'
import { fmtClock, fmtMinutes } from '../time'
import { ring, setRing, pvRoot, tip, type PvRoot } from '../ui/charts'
import { LENGTHS, plainError, view, type StudyTimerHandle } from './studyTimer'

// Study tab (card 16). Colour tiles: a dotted ring timer with 25 and 50 minute lengths, today, streak, this week,
// top subject and a row per subject. The timer logic is the existing one in studyTimer.ts and is not touched here.
// Built once. A tick, a new session or a tap changes only the numbers and dots that moved.

/** Kept for pages that preload icons. This tab draws its own icons. */
export const ICONS_NEEDED: string[] = []

const DAY = 864e5
// Subject colours and short names from the prototype.
const SUBJ: Record<string, { short: string; c: string }> = {
  'Chemistry': { short: 'Chem', c: '#3D9BFF' }, 'Methods': { short: 'Methods', c: '#5CFF7A' }, 'Specialist': { short: 'Spec', c: '#BF5AF2' },
  'Human Biology': { short: 'Bio', c: '#FF2FA3' }, 'English': { short: 'English', c: '#FFC23D' }, 'Religion': { short: 'Religion', c: '#AEB6C2' },
}
const ORDER = ['Chemistry', 'Methods', 'Specialist', 'Human Biology', 'English', 'Religion']
const short = (name: string) => SUBJ[name]?.short ?? (name.length > 9 ? `${name.slice(0, 8).trimEnd()}.` : name)
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>'
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'
const STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>'

const dotRing = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2 - Math.PI / 2
  return `<circle cx="${(75 + 64 * Math.cos(a)).toFixed(2)}" cy="${(75 + 64 * Math.sin(a)).toFixed(2)}" r="${i % 5 ? 1.8 : 2.8}" fill="rgba(255,255,255,.2)"/>`
}).join('')

const tile = (cls: string, i: number, cap: string, k: string, extra = '') =>
  `<div class="t ${cls} pop" style="--i:${i}"><span class="caps">${cap}</span><div class="big num" data-k="${k}">0m</div><div class="sub" data-k="${k}S">&nbsp;</div>${extra}</div>`

const TEMPLATE = `<div class="grid">
  <div class="t cobalt s2 r2 pop stTimer" style="--i:0" role="group" aria-label="Focus timer">
    <span class="caps" data-k="cap">Focus · Chem</span>
    <div class="stRing"><svg class="dots" viewBox="0 0 150 150" aria-hidden="true">${dotRing}</svg>
      <div class="face"><b class="num" data-k="time" role="timer">25:00</b><span class="caps" data-k="state">Ready</span></div>
      <div class="stSide"><button type="button" class="play" data-k="play" aria-label="Start">${PLAY}</button>
        <button type="button" class="stStop" data-k="stop" aria-label="Stop and log" title="Stop and log" hidden>${STOP}</button>
        <div class="toggle" data-k="len" role="group" aria-label="Focus length">${LENGTHS.map((m) => `<button type="button" data-m="${m}" aria-pressed="false">${m} MIN</button>`).join('')}</div></div></div>
  </div>
  ${tile('blue', 1, 'Today', 'today', `<div class="vis" data-k="todayRing">${ring('#3D9BFF', 0, 28, 4)}</div>`)}
  <div class="t green pop" style="--i:2"><span class="caps">Streak</span><div class="big num" data-k="streak">0 days</div><div class="stWk" data-k="streakWk" role="img" aria-label="Days studied this week">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<i>${d}</i>`).join('')}</div></div>
  ${tile('purple', 3, 'This week', 'week')}
  ${tile('dark', 4, 'Top subject', 'top')}
  <div class="t dark s4 pop stSubs" style="--i:5"><span class="caps">By subject · tap to focus</span><div class="subrows" data-k="subs" role="group" aria-label="Subject">${ORDER.map((n) => `<button type="button" class="sr" data-n="${n}" aria-pressed="false" style="--c:${SUBJ[n].c}"><span>${SUBJ[n].short}</span><div class="dts">${Array.from({ length: 10 }, () => '<i></i>').join('')}</div><i class="bh" hidden title="Behind for its next test"></i></button>`).join('')}</div>
    <div class="stErr" role="alert"><span data-k="errMsg">Can't load your study.</span><button type="button" data-k="retry">Try again</button></div></div>
</div>`

export interface StudyPanelHandle extends PvRoot {
  /** Re-read the week from the database, for example after a session is logged. */
  refreshWeek(): void
  destroy(): void
}

export function StudyPanel(api: Backend, timer: StudyTimerHandle, onResize: () => void = () => {}, clock: () => Date = () => new Date()): StudyPanelHandle {
  const root = pvRoot('study-pv is-loading') as StudyPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Study')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  const dots = [...root.querySelectorAll<SVGCircleElement>('svg.dots circle')]
  const subRows = [...root.querySelectorAll<HTMLButtonElement>('.sr')]
  const lenBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-k="len"] button')]
  let alive = true
  let sessions: SessionLike[] = []
  let summary: WeekSummary | null = null
  let loaded = false
  let gen = 0

  // ---- Timer. Only touches the DOM when what you can see changes.
  const last = { time: '', lit: -1, status: '', subject: '', len: 0, busy: false }
  function paintTimer(now: number) {
    const s = timer.state
    const { value, left } = view(s, now)
    const text = fmtClock(s.status === 'idle' ? s.targetMs : left)
    if (text !== last.time) { last.time = text; $('time').textContent = text }
    const lit = Math.round(value * 60)
    if (lit !== last.lit) {
      last.lit = lit
      dots.forEach((c, i) => c.setAttribute('fill', i < lit ? (i === lit - 1 ? '#fff' : '#9fb0ff') : 'rgba(255,255,255,.2)'))
    }
    const busy = timer.busy || !timer.ready
    if (s.status !== last.status || busy !== last.busy) {
      last.status = s.status; last.busy = busy
      const running = s.status === 'running'
      $('state').textContent = timer.busy ? (s.status === 'idle' ? 'Starting' : 'Logging') : s.status === 'idle' ? 'Ready' : running ? 'Focusing' : 'Paused'
      const play = $<HTMLButtonElement>('play')
      play.innerHTML = running ? PAUSE : PLAY
      play.setAttribute('aria-label', s.status === 'idle' ? 'Start' : running ? 'Pause' : 'Resume')
      play.disabled = busy
      $<HTMLButtonElement>('stop').hidden = s.status === 'idle'
      $<HTMLButtonElement>('stop').disabled = busy
      lenBtns.forEach((b) => { b.disabled = s.status !== 'idle' || busy })
    }
    const mins = Math.round(s.targetMs / 60_000)
    if (mins !== last.len) { last.len = mins; lenBtns.forEach((b) => { const on = Number(b.dataset.m) === mins; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)) }) }
    if (s.subject !== last.subject) {
      last.subject = s.subject
      $('cap').textContent = `Focus · ${short(s.subject)}`
      subRows.forEach((r) => { const on = r.dataset.n === s.subject; r.classList.toggle('on', on); r.setAttribute('aria-pressed', String(on)) })
    }
    subRows.forEach((r) => r.setAttribute('aria-disabled', String(s.status !== 'idle' && r.dataset.n !== s.subject)))
    paintData(now)
  }

  // ---- Data tiles. Minutes banked by the running session count straight away, so the numbers move as you study.
  const shown: Record<string, string> = {}
  const put = (k: string, text: string) => { if (shown[k] !== text) { shown[k] = text; $(k).textContent = text } }
  let ringF = -1
  function paintData(now: number) {
    if (!loaded) return
    const s = timer.state
    const live = s.status === 'idle' ? 0 : Math.floor(elapsedMs(s, now) / 60_000)
    const today = todayMinutes(sessions, clock()) + live
    put('today', fmtMinutes(today)); put('todayS', `goal ${fmtMinutes(DAILY_GOAL_MIN)}`)
    const f = Math.min(1, today / DAILY_GOAL_MIN)
    if (f !== ringF) { ringF = f; setRing($('todayRing'), f) }
    const st = studyStreak(sessions, clock())
    const days = Math.max(st.days, live > 0 && st.days === 0 ? 1 : st.days)
    put('streak', `${days} ${days === 1 ? 'day' : 'days'}`)
    // M T W T F S S, studied days lit. Today lights as soon as a session is running.
    const week = st.week.slice()
    if (live > 0) week[(new Date(clock().getTime() + 8 * 36e5).getUTCDay() + 6) % 7] = true
    const wk = week.map(Number).join('')
    if (shown.streakWk !== wk) {
      shown.streakWk = wk
      $('streakWk').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', week[i]))
      $('streakWk').setAttribute('aria-label', `Studied ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].filter((_, i) => week[i]).join(', ') || 'no days'} this week`)
    }
    const subjects = summary?.subjects ?? []
    const mine = (name: string) => (subjects.find((x) => x.subject === name)?.minutes ?? 0) + (live && s.subject === name ? live : 0)
    const total = (summary?.totalMinutes ?? 0) + live
    put('week', fmtMinutes(total))
    const n = sessions.filter((x) => Date.parse(x.started_at) >= (summary?.from.getTime() ?? 0) && (x.minutes ?? 0) > 0).length
    put('weekS', total ? `${n || 1} ${n === 1 ? 'session' : 'sessions'}` : 'No sessions yet')
    const ranked = ORDER.map((name) => ({ name, m: mine(name) })).sort((a, b) => b.m - a.m)
    const best = ranked[0]
    put('top', best.m > 0 ? short(best.name) : 'None yet')
    put('topS', best.m > 0 ? fmtMinutes(best.m) : 'Nothing logged')
    for (const r of subRows) {
      const name = r.dataset.n!
      const lit = dotsFor(mine(name))
      const key = `${name}:${lit}`
      if (shown[key] === undefined || r.dataset.lit !== String(lit)) {
        r.dataset.lit = String(lit); shown[key] = '1'
        const c = SUBJ[name].c
        r.querySelectorAll<HTMLElement>('.dts i').forEach((d, k) => { d.style.background = k < lit ? c : ''; d.style.boxShadow = k < lit ? `0 0 4px ${c}` : '' })
      }
      r.querySelector<HTMLElement>('.bh')!.hidden = summary?.behind?.subject !== name
      r.setAttribute('aria-label', `${short(name)}, ${fmtMinutes(mine(name))} this week${summary?.behind?.subject === name ? ', behind for its next test' : ''}`)
    }
  }

  async function load() {
    const mine = ++gen
    root.classList.remove('is-err')
    if (!loaded) root.classList.add('is-loading')
    try {
      const now = clock()
      const [rows, tests] = await Promise.all([api.sessionsSince(new Date(now.getTime() - 60 * DAY)), api.upcomingTests(now)])
      if (!alive || mine !== gen) return
      sessions = rows
      summary = summariseWeek(rows, tests, now)
      loaded = true
      root.classList.remove('is-loading')
      Object.keys(shown).forEach((k) => delete shown[k])
      ringF = -1
      paintData(Date.now())
    } catch (e) {
      if (!alive || mine !== gen) return
      root.classList.remove('is-loading')
      root.classList.add('is-err')
      $('errMsg').textContent = navigator.onLine ? plainError(e) : "You're offline."
    }
    onResize()
  }

  // ---- Wiring
  $('play').addEventListener('click', () => { const st = timer.state.status; if (st === 'idle') void timer.start(); else if (st === 'running') timer.pause(); else timer.resume() })
  $('stop').addEventListener('click', () => void timer.reset())
  lenBtns.forEach((b) => b.addEventListener('click', () => timer.setLength(Number(b.dataset.m))))
  subRows.forEach((r) => r.addEventListener('click', () => { if (timer.state.status === 'idle') timer.setSubject(r.dataset.n!) }))
  $('retry').addEventListener('click', () => void load())
  const unsub = timer.subscribe(paintTimer)
  timer.onError((m) => tip(root, m))
  timer.onLogged((row, kind) => {
    const mins = row.minutes ?? 0
    tip(root, kind === 'done' ? `Goal hit. Logged ${fmtMinutes(mins)} of ${row.subject}.` : mins > 0 ? `Logged ${fmtMinutes(mins)} of ${row.subject}.` : `Under a minute of ${row.subject}, so nothing to log.`)
    void load()
  })
  const baseEnter = root.enter
  root.enter = () => { baseEnter(); ringF = -1; last.lit = -1; paintTimer(Date.now()) }
  paintTimer(Date.now())
  void load()
  root.refreshWeek = () => void load()
  root.destroy = () => { alive = false; unsub() }
  return root
}
