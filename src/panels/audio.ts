import '../styles/tokens.css'
import '../styles/proto.css'
import './audio.css'
import { pvRoot, type PvRoot } from '../ui/charts'
import { getAppVolumes, getMic, getOutputs, getVolume, helperToken, setAppVolume, setMicMuted, setMuted, setVolume, type AppVolume, type MicState, type Output } from '../lib/helper'
import { OUTPUT_COLOURS, appColour, litBars, mixerApps, outputSub } from '../lib/audio'

// Audio tab (card 24), black island family. A big mute button and the master volume, where the sound is going, the microphone with
// a live level meter, and a mixer with one slider per app (Spotify, Chrome, Discord, Teams), all through the helper. Windows has no
// public way to switch the output, to turn on a headset's noise cancelling or to set an equaliser, so those are shown as "Not
// available yet" instead of being faked. Built once, a change only touches what changed.

const I = {
  vol: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3 3l18 18"/></svg>',
  head: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="2" fill="currentColor"/><rect x="17" y="14" width="4" height="7" rx="2" fill="currentColor"/></svg>',
  spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="14" r="3.2" fill="currentColor"/><circle cx="12" cy="7" r="1.4" fill="currentColor"/></svg>',
  mon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2.5"/><path d="M9 21h6M12 17v4"/></svg>',
}
const outIcon = (k: string) => (k === 'headphones' ? I.head : k === 'monitor' ? I.mon : I.spk)

const TEMPLATE = `<div class="auG">
  <div class="blk auM pop" style="--i:0"><span class="caps">Master</span>
    <button type="button" class="auMute" data-k="mute" aria-pressed="false" aria-label="Mute"><span class="ring2"></span><i data-k="muteI">${I.vol}</i></button>
    <div class="auV"><b class="num" data-k="vn">0%</b><span data-k="vs">Speakers</span></div>
    <div class="auSl" data-k="sl" role="slider" tabindex="0" aria-label="Master volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="tr"></div><div class="fl"></div><div class="kn"></div></div>
  </div>
  <div class="auCol">
    <div class="blk pop" style="--i:1"><div class="auEqH"><span class="caps">Output</span><span class="caps na">Switch in Windows</span></div><div data-k="outs"></div></div>
    <div class="blk auMic pop" style="--i:2"><button type="button" class="auB" data-k="micB" aria-label="Mute microphone" aria-pressed="false">${I.mic}</button><div class="auMicT"><span class="caps" data-k="micT">Mic</span><div class="auLv" data-k="lv">${Array.from({ length: 18 }, () => '<i></i>').join('')}</div></div><span class="auPill na" title="Windows has no public way to change noise cancelling">ANC not available yet</span></div>
  </div>
  <div class="auCol">
    <div class="blk auOff" data-k="off" role="status" hidden><b data-k="offT">Start Halo helper</b><span>Audio needs Halo to see your laptop.</span><button type="button" data-k="retry">Try again</button></div>
    <div class="blk auMixB pop" style="--i:3"><span class="caps">Mixer</span><div class="auMx" data-k="mx"></div></div>
    <div class="blk auEqB pop" style="--i:4"><div class="auEqH"><span class="caps">EQ</span><span class="caps na">Not available yet</span></div><div class="auEq">${['Flat', 'Bass', 'Vocal', 'Night'].map((n) => `<button type="button" disabled>${n}</button>`).join('')}</div></div>
  </div>
</div>`

export interface AudioPanelHandle extends PvRoot { destroy(): void }

export function AudioPanel(): AudioPanelHandle {
  const root = pvRoot('audio-pv') as AudioPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Audio')
  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!
  const shown: Record<string, string> = {}
  const text = (k: string, v: string) => { if (shown[k] !== v) { shown[k] = v; $(k).textContent = v } }
  const html = (k: string, v: string) => { if (shown[k] !== v) { shown[k] = v; $(k).innerHTML = v } }
  let alive = true
  let up = false
  let muted = false
  let level = 0
  let outName = 'Speakers'
  let mic: MicState = { muted: false, level: 0 }
  const busy: Record<string, number> = {}
  let slow = 0
  let fast = 0

  const onScreen = () => alive && !document.hidden && root.isConnected && root.offsetParent !== null && !root.classList.contains('h-off')

  function paintMaster() {
    const sl = $('sl')
    sl.querySelector<HTMLElement>('.fl')!.style.width = `${level}%`
    sl.querySelector<HTMLElement>('.kn')!.style.left = `${level}%`
    sl.setAttribute('aria-valuenow', String(level))
    root.querySelector('.auG')!.classList.toggle('muted', muted)
    $('mute').setAttribute('aria-pressed', String(muted))
    $('mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute')
    html('muteI', muted ? I.mute : I.vol)
    text('vn', muted ? 'Muted' : `${level}%`)
    text('vs', muted ? 'tap to unmute' : outName)
  }
  function paintMic() {
    $('micB').classList.toggle('off', mic.muted)
    $('micB').setAttribute('aria-pressed', String(mic.muted))
    if (shown.micI !== String(mic.muted)) { shown.micI = String(mic.muted); $('micB').innerHTML = mic.muted ? I.micOff : I.mic }
    text('micT', `Mic · ${mic.muted ? 'muted' : 'live'}`)
    const lit = mic.muted ? 0 : litBars(mic.level)
    $('lv').querySelectorAll('i').forEach((b, i) => b.classList.toggle('on', i < lit))
  }
  function paintOutputs(outs: Output[]) {
    html('outs', outs.slice(0, 3).map((o) => `<div class="auO${o.current ? ' on' : ''}" style="--c:${OUTPUT_COLOURS[o.kind] ?? '#BF5AF2'}"><span class="ib">${outIcon(o.kind)}</span><div><b>${o.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</b><small>${outputSub(o)}</small></div><i class="ck"></i></div>`).join(''))
  }
  function paintMixer(apps: AppVolume[]) {
    const { shown: list, more } = mixerApps(apps)
    if (!list.length) { html('mx', '<p class="auNone">Nothing is playing sound.</p>'); return }
    // Rebuild only when the set of apps changes. Otherwise move the sliders, so a drag is never interrupted.
    const key = list.map((a) => a.id).join()
    if (shown.mxKey !== key) {
      shown.mxKey = key
      $('mx').innerHTML = list.map((a) => `<div class="auA" data-a="${a.id}" style="--c:${appColour(a.id)}" role="slider" tabindex="0" aria-label="${a.name} volume" aria-valuemin="0" aria-valuemax="100"><div class="vt"><i></i><em class="num"></em></div><span>${a.name.length > 8 ? a.name.slice(0, 7) + '…' : a.name}</span></div>`).join('') + (more ? `<span class="auMore">+${more}</span>` : '')
    }
    for (const a of list) {
      if (busy[a.id]) continue
      const el = $('mx').querySelector<HTMLElement>(`[data-a="${CSS.escape(a.id)}"]`)
      if (!el) continue
      const v = muted ? 0 : a.level
      el.querySelector<HTMLElement>('.vt i')!.style.height = `${v}%`
      el.querySelector<HTMLElement>('em')!.textContent = String(v)
      el.setAttribute('aria-valuenow', String(v))
    }
  }

  async function slowRefresh() {
    const [vol, outs, apps] = await Promise.all([getVolume(), getOutputs(), getAppVolumes()])
    if (!alive) return
    up = !!(vol || outs || apps)
    root.classList.toggle('is-off', !up)
    $('off').hidden = up
    text('offT', helperToken() ? 'Start Halo helper' : 'Open Halo on your laptop')
    if (vol && !busy.vol) { level = vol.level; muted = vol.muted }
    if (outs) { outName = outs.current; paintOutputs(outs.outputs) }
    paintMaster()
    if (apps) paintMixer(apps.apps)
  }
  async function fastRefresh() { const m = await getMic(); if (!alive || !m || busy.mic) return; mic = m; paintMic() }

  // Master volume: drag the bar, or the arrow keys. The mute button toggles Windows' mute.
  const sl = $('sl')
  let lastSend = 0
  const sendVol = (v: number) => { busy.vol = Date.now(); if (Date.now() - lastSend > 80) { lastSend = Date.now(); void setVolume(v) } window.setTimeout(() => { if (Date.now() - busy.vol >= 1200) delete busy.vol }, 1300) }
  const setLevel = (v: number) => { level = v; if (muted && v > 0) muted = false; paintMaster(); sendVol(v) }
  sl.addEventListener('pointerdown', (e) => {
    if (!up) return
    sl.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => { const r = sl.getBoundingClientRect(); setLevel(Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100)) }
    move(e)
    const done = () => { sl.removeEventListener('pointermove', move); sl.removeEventListener('pointerup', done); sl.removeEventListener('pointercancel', done); void setVolume(level) }
    sl.addEventListener('pointermove', move); sl.addEventListener('pointerup', done); sl.addEventListener('pointercancel', done)
  })
  sl.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0
    if (!d || !up) return
    e.preventDefault(); e.stopPropagation()
    setLevel(Math.max(0, Math.min(100, level + d)))
  })
  $('mute').addEventListener('click', () => { if (!up) return; muted = !muted; paintMaster(); void setMuted(muted).then(slowRefresh) })
  $('micB').addEventListener('click', () => { if (!up) return; mic = { ...mic, muted: !mic.muted }; busy.mic = Date.now(); paintMic(); void setMicMuted(mic.muted).then((m) => { delete busy.mic; if (m) { mic = m; paintMic() } }) })

  // Mixer sliders, one per app: drag up and down. Changes go to the app's audio session through the helper.
  $('mx').addEventListener('pointerdown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('.auA')
    if (!a || !up) return
    const id = a.dataset.a!
    const track = a.querySelector<HTMLElement>('.vt')!
    track.setPointerCapture(e.pointerId)
    let last = 0
    const move = (ev: PointerEvent) => {
      const r = track.getBoundingClientRect()
      const v = Math.round(Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height)) * 100)
      busy[id] = Date.now()
      track.querySelector<HTMLElement>('i')!.style.height = `${v}%`
      track.querySelector<HTMLElement>('em')!.textContent = String(v)
      a.setAttribute('aria-valuenow', String(v))
      if (Date.now() - last > 80) { last = Date.now(); void setAppVolume(id, v) }
      return v
    }
    let v = move(e)
    const m2 = (ev: PointerEvent) => { v = move(ev) }
    const done = () => { track.removeEventListener('pointermove', m2); track.removeEventListener('pointerup', done); track.removeEventListener('pointercancel', done); void setAppVolume(id, v); window.setTimeout(() => delete busy[id], 900) }
    track.addEventListener('pointermove', m2); track.addEventListener('pointerup', done); track.addEventListener('pointercancel', done)
  })
  $('mx').addEventListener('keydown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('.auA')
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0
    if (!a || !d || !up) return
    e.preventDefault(); e.stopPropagation()
    const v = Math.max(0, Math.min(100, Number(a.getAttribute('aria-valuenow') ?? 0) + d))
    a.querySelector<HTMLElement>('.vt i')!.style.height = `${v}%`
    a.querySelector<HTMLElement>('em')!.textContent = String(v)
    a.setAttribute('aria-valuenow', String(v))
    void setAppVolume(a.dataset.a!, v)
  })
  root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-k="retry"]')) void slowRefresh() })

  root.onEnter = () => { void slowRefresh(); void fastRefresh() }
  slow = window.setInterval(() => { if (onScreen()) void slowRefresh() }, 2500)
  fast = window.setInterval(() => { if (onScreen() && up) void fastRefresh() }, 250)
  paintMaster(); paintMic()
  void slowRefresh()
  root.destroy = () => { alive = false; window.clearInterval(slow); window.clearInterval(fast) }
  return root
}
