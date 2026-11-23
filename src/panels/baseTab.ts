import '../styles/tokens.css'
import './baseTab.css'
import { reduced } from '../lib/motion'
import { MOON_SVG, SUN_SVG, clockParts, dateLine, fmtElapsed, fmtHours, fmtLeft, sunCurve, sunState, weatherWords, type SunState } from '../lib/base'
import { hrsTo } from '../lib/island-cycle'
import { fmtClockPm, fmtDayMonth, shiftView } from '../lib/now-model'
import { getTravelMinutes } from '../lib/now'
import { livePosition, fraction } from '../lib/music'
import { onPhotoChange, photoUrl } from '../lib/base-photo'
import type { BaseStore } from '../lib/base-data'
import type { UiStore } from '../lib/ui-settings'

// Base tab (card 29): a calm centrepiece. Liam's photo fills the island, a huge clock sits behind the mountains, and a few
// frosted glass cards sit on top. Copied from design/prototype/base-tab.html. Built once, then only the text, bars or
// images that changed are touched, so a tick or a press never redraws the tab (HALO.md: no flash on interaction).
//
// Layers, bottom to top: photo, clock, the same photo again clipped to the ridge (so the peaks cover the bottom of the digits),
// a shade, the date, then the cards. The shell's top bar (tab pills and the greeting) is drawn above all of it.

const SUNSET = '<path d="M12 3v3M5 9l2 2M19 9l-2 2M3 17h18M7 17a5 5 0 0 1 10 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
const PIN = '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>'
const SPOTIFY = '<circle cx="12" cy="12" r="11" fill="#1ED760"/><path d="M6.5 9.3c3.7-1.1 7.9-.8 11.2 1M7.2 12.4c3-.8 6.3-.5 9 .9M7.8 15.3c2.4-.6 4.9-.4 7 .7" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>'
const NOTE = '<path d="M9 18V5l11-2v13" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="#fff"/><circle cx="17.5" cy="16" r="2.5" fill="#fff"/>'
const PREV = '<path d="M11 6v12L3 12zM20 6v12l-8-6z"/>'
const NEXT = '<path d="M13 6v12l8-6zM4 6v12l8-6z"/>'
const PAUSE = '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'
const PLAY = '<path d="M7 4v16l13-8z"/>'
const RING_C = 94.2

const set = (el: Element, text: string) => { if (el.textContent !== text) el.textContent = text }
const svgSet = (el: Element, markup: string) => { if (el.innerHTML !== markup) el.innerHTML = markup }
const q = <T extends Element>(root: Element, sel: string): T => root.querySelector(sel) as T

export interface BaseTabOptions {
  store: BaseStore
  ui: UiStore
  clock?: () => Date
}
export interface BaseTabHandle extends HTMLElement {
  /** The entrance: the cards rise in. Played when the tab is switched to, never on a press. */
  enter(): void
  tick(now: Date): void
  destroy(): void
}

export function BaseTab(o: BaseTabOptions): BaseTabHandle {
  const clock = o.clock ?? (() => new Date())
  const el = document.createElement('div') as unknown as BaseTabHandle
  el.className = 'bt'
  el.setAttribute('aria-label', 'Base')
  el.innerHTML = `
    <div class="bt-photo" aria-hidden="true"></div>
    <div class="bt-clock num" aria-hidden="true" data-audit-skip><span class="bt-ci"><span class="bt-h"></span><span class="bt-c">:</span><span class="bt-m"></span></span></div>
    <div class="bt-front" aria-hidden="true"></div>
    <div class="bt-shade" aria-hidden="true"></div>
    <div class="bt-date"><span></span></div>
    <span class="bt-sr" role="timer" data-audit-skip></span>

    <div class="bt-left">
      <div class="bt-ringw">
        <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="4.5"/><circle class="bt-arc" cx="20" cy="20" r="15" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" transform="rotate(-90 20 20)"/></svg>
        <div><div class="bt-t1 num bt-bp"></div><div class="bt-lbl bt-bs"></div></div>
      </div>
      <div class="bt-sunc">
        <div class="bt-t1"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" style="width:12px;height:12px;display:inline">${SUNSET}</svg><span class="bt-sk"></span></div>
        <div class="bt-t1 bt-sbig"><span class="bt-st num"></span><small class="bt-sa"></small></div>
        <svg class="bt-curve" viewBox="0 0 110 34" aria-hidden="true"></svg>
        <div class="bt-lbl bt-sl"></div>
      </div>
    </div>

    <div class="bt-g bt-wx" data-loading="1">
      <svg class="bt-wi" viewBox="0 0 32 32" aria-hidden="true"></svg>
      <div class="bt-deg num"></div>
      <div class="bt-cond"></div>
      <div class="bt-loc"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${PIN}</svg>Perth, WA</div>
    </div>

    <div class="bt-g bt-sh" data-loading="1">
      <div class="bt-lbl bt-shl">Next shift</div>
      <div class="bt-big num"><span class="bt-shb"></span><small class="bt-shs"></small></div>
      <div class="bt-acc"></div>
      <div class="bt-sub bt-shsub"></div>
    </div>

    <div class="bt-g bt-np" data-loading="1">
      <div class="bt-top">
        <span class="bt-art"></span>
        <div class="bt-tx"><b class="bt-ti" data-ellipsis></b><span class="bt-ar" data-ellipsis></span></div>
        <svg class="bt-sp" viewBox="0 0 24 24" aria-hidden="true"></svg>
      </div>
      <div class="bt-pr"><span class="bt-el num"></span><div><i></i></div><span class="bt-le num"></span></div>
      <div class="bt-ctl">
        <button type="button" class="bt-cb" data-a="previous" aria-label="Previous track"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">${PREV}</svg></button>
        <button type="button" class="bt-cb" data-a="toggle" aria-label="Pause"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">${PAUSE}</svg></button>
        <button type="button" class="bt-cb" data-a="next" aria-label="Next track"><svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">${NEXT}</svg></button>
      </div>
    </div>

    <div class="bt-g bt-pay" data-loading="1">
      <div class="bt-row"><span class="bt-lbl">Last 7 days</span><span class="bt-lbl bt-ph num"></span></div>
      <div class="bt-big num bt-pb"></div>
      <div class="bt-bars" role="img" aria-label="Pay for each of the last 7 days">${'<i></i>'.repeat(7)}</div>
      <div class="bt-days">${'<span></span>'.repeat(7)}</div>
    </div>`

  const $ = <T extends Element>(sel: string) => q<T>(el, sel)
  const hEl = $('.bt-h'), mEl = $('.bt-m'), dateEl = $<HTMLElement>('.bt-date span'), srEl = $('.bt-sr')
  const arc = $<SVGElement>('.bt-arc'), bp = $('.bt-bp'), bs = $('.bt-bs')
  const sk = $('.bt-sk'), st = $('.bt-st'), sa = $('.bt-sa'), curve = $('.bt-curve'), sl = $('.bt-sl')
  const wx = $<HTMLElement>('.bt-wx'), wi = $('.bt-wi'), deg = $('.bt-deg'), cond = $('.bt-cond')
  const sh = $<HTMLElement>('.bt-sh'), shl = $('.bt-shl'), shb = $('.bt-shb'), shs = $('.bt-shs'), shsub = $('.bt-shsub')
  const np = $<HTMLElement>('.bt-np'), art = $<HTMLElement>('.bt-art'), ti = $('.bt-ti'), ar = $('.bt-ar'), sp = $('.bt-sp')
  const bar = $<HTMLElement>('.bt-pr i'), elapsed = $('.bt-el'), left = $('.bt-le')
  const ctl = [...el.querySelectorAll<HTMLButtonElement>('.bt-cb')]
  const play = ctl[1]
  const pay = $<HTMLElement>('.bt-pay'), ph = $('.bt-ph'), pb = $('.bt-pb')
  const bars = [...el.querySelectorAll<HTMLElement>('.bt-bars i')]
  const days = [...el.querySelectorAll<HTMLElement>('.bt-days span')]

  const loading = (card: HTMLElement, on: boolean) => { const v = on ? '1' : '0'; if (card.dataset.loading !== v) card.dataset.loading = v }
  let sun: SunState = sunState(clock())

  // ---- The photo and the clip. The photo can be Liam's own, and the clock can come out from behind the mountains.
  const paintPhoto = () => el.style.setProperty('--bt-photo', `url("${photoUrl()}")`)
  const paintUi = () => { const v = o.ui.get().clockBehind ? 'on' : 'off'; if (el.dataset.front !== v) el.dataset.front = v }
  paintPhoto(); paintUi()
  const offs = [onPhotoChange(paintPhoto), o.ui.subscribe(paintUi)]

  // The date sits where the prototype draws it unless the top bar has grown into it (Liam can pin up to 8 tabs). Then it drops
  // below the bar, so the two never overlap. The prototype's own bar is short, so there it stays exactly where it is drawn.
  let low = false
  function fitDate() {
    const rail = el.closest('.sh')?.querySelector<HTMLElement>('.sh-rail')
    if (!rail || !rail.offsetWidth) return
    const hit = 14 + rail.offsetWidth + 8 > 300 - dateEl.offsetWidth / 2
    if (hit === low) return
    low = hit
    el.toggleAttribute('data-low', hit)
  }

  // ---- Time. The clock, date and sun move on the minute.
  let timeKey = ''
  // The clock is 146 px for three digits. Four digits (10:00 to 12:59) are wider, so the size is measured and scaled down until the
  // text fits between the left column and the weather card. The top stays put, so the peaks still cover the bottom of the digits.
  const clockBox = $<HTMLElement>('.bt-clock')
  const clockInner = $<HTMLElement>('.bt-ci')
  const CLOCK_PX = 146, CLOCK_ROOM = 320
  let sizedFor = ''
  function fitClock(digits: string) {
    if (sizedFor === digits) return
    clockBox.style.fontSize = `${CLOCK_PX}px`
    const w = clockInner.getBoundingClientRect().width
    if (!w) return // not laid out yet, tried again on the next tick
    sizedFor = digits
    const px = w > CLOCK_ROOM ? Math.floor((CLOCK_PX * CLOCK_ROOM) / w) : CLOCK_PX
    if (px !== CLOCK_PX) clockBox.style.fontSize = `${px}px`
  }
  function paintTime(now: Date) {
    const c = clockParts(now)
    set(hEl, c.h); set(mEl, c.m)
    fitClock(`${c.h}${c.m}`.length === 4 && c.h.length === 2 ? '4' : '3')
    set(dateEl, dateLine(now))
    set(srEl, `${c.h}:${c.m}`)
    const key = `${c.h}:${c.m}`
    if (key === timeKey) return
    timeKey = key
    sun = sunState(now)
    set(sk, sun.next)
    set(st, sun.nextTime); set(sa, sun.nextAp)
    svgSet(curve, sunCurve(sun))
    set(sl, sun.other)
    paintWeather()
    paintShift(now)
  }

  // ---- Cards
  function paintBattery() {
    const b = o.store.get().battery
    if (b === undefined) { set(bp, '–'); set(bs, ''); return }
    if (b === null) { set(bp, '–'); set(bs, 'Helper off'); arc.style.strokeDashoffset = String(RING_C); return }
    if (!b.present || b.percent == null) { set(bp, 'Plugged in'); set(bs, 'No battery'); arc.style.strokeDashoffset = '0'; return }
    set(bp, `${b.percent}%`)
    set(bs, b.charging ? 'Charging' : b.minutes_left != null ? `${hrsTo(b.minutes_left * 60_000)} left` : 'On battery')
    const off = String(+(RING_C * (1 - Math.min(1, Math.max(0, b.percent / 100)))).toFixed(1))
    if (arc.style.strokeDashoffset !== off) arc.style.strokeDashoffset = off
  }

  function paintWeather() {
    const w = o.store.get().weather
    loading(wx, w === undefined)
    svgSet(wi, sun.up ? SUN_SVG : MOON_SVG)
    set(deg, w ? `${w.temp}°` : '–')
    set(cond, w ? weatherWords(w.desc, sun.up) : w === null ? 'No forecast' : '')
  }

  function paintShift(now: Date) {
    const s = o.store.get().shift
    loading(sh, s === undefined)
    if (s === undefined) { set(shl, 'Next shift'); set(shb, '–'); set(shs, ''); set(shsub, ''); return }
    if (!s) { set(shl, 'Next shift'); set(shb, 'None'); set(shs, ''); set(shsub, 'Nothing rostered'); return }
    const sv = shiftView(s, now, getTravelMinutes())
    const station = s.station?.trim()
    const at = (t: number) => { const [tm, ap] = fmtClockPm(t).split(' '); return { tm, ap: ap.toUpperCase() } }
    if (sv.phase === 'live') {
      const e = at(sv.end)
      set(shl, `On shift${station ? ` · ${station}` : ''}`)
      set(shb, e.tm); set(shs, `${e.ap} finish`)
      set(shsub, `ends in ${hrsTo(sv.msToEnd)}`)
      return
    }
    const a = at(sv.start)
    set(shl, `Next shift${station ? ` · ${station}` : ''}`)
    set(shb, a.tm); set(shs, `${a.ap} ${fmtDayMonth(sv.start).slice(0, 3)}`)
    set(shsub, `in ${hrsTo(sv.msToStart)} · leave ${fmtClockPm(sv.leaveBy).replace(/\s?[ap]m$/i, '')}`)
  }

  function paintPay() {
    const p = o.store.get().pay
    loading(pay, p === undefined)
    if (!p) {
      set(ph, ''); set(pb, p === null ? '–' : '')
      bars.forEach((b) => { b.style.height = '0%'; b.classList.remove('on') })
      return
    }
    set(ph, fmtHours(p.hours)); set(pb, `$${p.gross}`)
    bars.forEach((b, i) => { const h = `${p.bars[i] ?? 0}%`; if (b.style.height !== h) b.style.height = h; b.classList.toggle('on', i === 6) })
    days.forEach((d, i) => set(d, p.letters[i] ?? ''))
  }

  function paintMedia() {
    const s = o.store.get()
    const m = s.media
    loading(np, m === undefined)
    const on = !!m && m.available && !!m.title
    const bg = s.art && on ? `url("${s.art}")` : ''
    if (art.style.backgroundImage !== bg) art.style.backgroundImage = bg
    art.classList.toggle('none', !bg)
    if (!on) {
      set(ti, 'Nothing playing')
      set(ar, m === null ? 'Start Halo helper' : 'Open Spotify')
      svgSet(sp, NOTE)
      ctl.forEach((b) => { b.disabled = true })
      setPlayIcon(false)
      bar.style.width = '0%'; set(elapsed, '0:00'); set(left, fmtLeft(0, 0))
      return
    }
    set(ti, m!.title); set(ar, m!.artist)
    svgSet(sp, /spotify/i.test(m!.source) ? SPOTIFY : NOTE)
    ctl.forEach((b) => { b.disabled = false })
    setPlayIcon(m!.playing)
    paintProgress()
  }
  let iconKey: boolean | null = null
  function setPlayIcon(playing: boolean) {
    if (iconKey === playing) return
    iconKey = playing
    svgSet(play.querySelector('svg')!, playing ? PAUSE : PLAY)
    play.setAttribute('aria-label', playing ? 'Pause' : 'Play')
  }
  function paintProgress() {
    const s = o.store.get()
    const m = s.media
    if (!m || !m.available || !m.title) return
    const pos = livePosition(m.position, m.duration, m.playing, Date.now() - s.mediaAt)
    const w = `${(fraction(pos, m.duration) * 100).toFixed(1)}%`
    if (bar.style.width !== w) bar.style.width = w
    set(elapsed, fmtElapsed(pos)); set(left, fmtLeft(pos, m.duration))
  }

  ctl.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); void o.store.control(b.dataset.a as 'toggle' | 'next' | 'previous') }))

  function paintAll() { const now = clock(); paintBattery(); paintWeather(); paintShift(now); paintPay(); paintMedia() }
  const unsub = o.store.subscribe(paintAll)
  paintTime(clock()); paintAll()

  el.enter = () => {
    if (reduced()) return
    fitDate()
    el.classList.remove('bt-in')
    void el.offsetWidth // restart the animation
    el.classList.add('bt-in')
  }
  el.tick = (now) => { paintTime(now); paintProgress(); fitDate() }
  el.destroy = () => { unsub(); offs.forEach((f) => f()) }
  return el
}

