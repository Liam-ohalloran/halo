import '../styles/tokens.css'
import '../styles/proto.css'
import './audio.css'
import { pvRoot, tip, type PvRoot } from '../ui/charts'
import { getAppVolumes, getMic, getOutputs, getVolume, helperToken, onHelperEvent, onStreamState, setAppVolume, setDefaultOutput, setMicMuted, setMuted, setVolume, streamUp, type AppVolume, type MicState, type Output, type Volume } from '../lib/helper'
import { OUTPUT_COLOURS, appColour, audioPatch, litBars, mixerApps, outputSub } from '../lib/audio'
import { SETTLE_MS, createActions, createCatchUp, createDragSender, createFallbackPoll, stepLevel, type DragSender } from '../lib/optimistic'
import { shake } from '../lib/shake'

// Audio tab (card 24, card 29), black island family. A big mute button and the master volume, where the sound is going, the microphone with
// a live level meter, and a mixer with one slider per app (Spotify, Chrome, Discord, Teams), all through the helper. Taps and drags are drawn first and sent in the background, the helper pushes every change (the mic meter too) over /events, and a "no" puts the control back with a small shake. Windows has no
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
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const outIcon = (k: string) => (k === 'headphones' ? I.head : k === 'monitor' ? I.mon : I.spk)

const TEMPLATE = `<div class="auG">
  <div class="blk auM pop" style="--i:0"><span class="caps">Master</span>
    <button type="button" class="auMute" data-k="mute" aria-pressed="false" aria-label="Mute"><span class="ring2"></span><i data-k="muteI">${I.vol}</i></button>
    <div class="auV"><b class="num" data-k="vn">0%</b><span data-k="vs">Speakers</span></div>
    <div class="auSl" data-k="sl" role="slider" tabindex="0" aria-label="Master volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="tr"></div><div class="fl"></div><div class="kn"></div></div>
  </div>
  <div class="auCol">
    <div class="blk pop" style="--i:1"><div class="auEqH"><span class="caps">Output</span><span class="caps na" data-k="outHint">Tap to switch</span></div><div data-k="outs"></div></div>
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
  let seeded = false
  let muted = false
  let level = 0
  let outName = 'Speakers'
  let mic: MicState = { muted: false, level: 0 }
  const actions = createActions()
  const catchUp = createCatchUp()
  // What the helper last said. A tap or drag is drawn first, and a "no" goes back to this.
  const sure = { level: 0 }
  const sureApp = new Map<string, number>()
  const touched: Record<string, number> = {}

  const onScreen = () => alive && !document.hidden && root.isConnected && root.offsetParent !== null && !root.classList.contains('h-off')
  const recent = (k: string) => Date.now() - (touched[k] ?? 0) < SETTLE_MS

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
  let canSwitch = false
  function paintOutputs(outs: Output[], can: boolean) {
    canSwitch = can
    text('outHint', can ? 'Tap to switch' : 'Only one output')
    html('outs', outs.slice(0, 3).map((o) => `<div class="auO${o.current ? ' on' : ''}${can && !o.current ? ' go' : ''}" data-o="${esc(o.id)}"${can ? ' role="button" tabindex="0"' : ''} aria-label="${can && !o.current ? 'Switch to ' : ''}${esc(o.name)}" style="--c:${OUTPUT_COLOURS[o.kind] ?? '#BF5AF2'}"><span class="ib">${outIcon(o.kind)}</span><div><b>${esc(o.name)}</b><small>${outputSub(o)}</small></div><i class="ck"></i></div>`).join(''))
  }
  const appEl = (id: string) => $('mx').querySelector<HTMLElement>(`[data-a="${CSS.escape(id)}"]`)
  function paintApp(id: string, v: number) {
    const a = appEl(id)
    if (!a) return
    a.querySelector<HTMLElement>('.vt i')!.style.height = `${v}%`
    a.querySelector<HTMLElement>('em')!.textContent = String(v)
    a.setAttribute('aria-valuenow', String(v))
  }
  function paintMixer(apps: AppVolume[]) {
    const { shown: list, more } = mixerApps(apps)
    if (!list.length) { shown.mxKey = ''; html('mx', '<p class="auNone">Nothing is playing sound.</p>'); return }
    // Rebuild only when the set of apps changes. Otherwise move the sliders, so a drag is never interrupted.
    const key = list.map((a) => a.id).join()
    if (shown.mxKey !== key) {
      shown.mxKey = key
      $('mx').innerHTML = list.map((a) => `<div class="auA" data-a="${a.id}" style="--c:${appColour(a.id)}" role="slider" tabindex="0" aria-label="${a.name} volume" aria-valuemin="0" aria-valuemax="100"><div class="vt"><i></i><em class="num"></em></div><span>${a.name.length > 8 ? a.name.slice(0, 7) + '…' : a.name}</span></div>`).join('') + (more ? `<span class="auMore">+${more}</span>` : '')
    }
    for (const a of list) {
      if (appSender(a.id).busy || recent(`app:${a.id}`)) continue
      sureApp.set(a.id, a.level)
      paintApp(a.id, muted ? 0 : a.level)
    }
  }

  // ---- What the helper tells us: pushed as it changes, or read (first paint, the stream coming back, the slow fallback). ----
  const volLeft = () => (vol.busy ? SETTLE_MS : Math.max(0, SETTLE_MS - (Date.now() - (touched.vol ?? 0))))
  // A pushed value that lands while Liam's own change is settling is held back, then confirmed with one read when it is over.
  const hold = (key: string, left: () => number, read: () => Promise<unknown>) => catchUp.later(key, left, () => { if (alive) void read() })
  function takeVolume(v: Volume) {
    if (!(vol.busy || recent('vol'))) { level = sure.level = v.level } else hold('vol', volLeft, async () => { const r = await getVolume(); if (r) takeVolume(r) })
    if (!actions.settling('mute')) muted = v.muted; else hold('mute', () => actions.settleLeft('mute'), async () => { const r = await getVolume(); if (r) takeVolume(r) })
    paintMaster()
  }
  function takeMic(m: { muted: boolean }) {
    if (!actions.settling('mic')) { mic = { ...mic, muted: m.muted }; paintMic() } else hold('mic', () => actions.settleLeft('mic'), async () => { const r = await getMic(); if (r) takeMic(r) })
  }
  async function refreshOutputs() {
    const outs = await getOutputs()
    if (!alive || !outs || busyOut) return
    outName = outs.current
    paintOutputs(outs.outputs, !!outs.can_switch)
    paintMaster()
  }
  async function refresh() {
    const [v, outs, apps, m] = await Promise.all([getVolume(), getOutputs(), getAppVolumes(), getMic()])
    if (!alive) return
    up = !!(v || outs || apps || m)
    root.classList.toggle('is-off', !up)
    $('off').hidden = up
    text('offT', helperToken() ? 'Start Halo helper' : 'Open Halo on your laptop')
    seeded = true
    if (v) takeVolume(v)
    if (outs && !busyOut) { outName = outs.current; paintOutputs(outs.outputs, !!outs.can_switch) }
    paintMaster()
    if (apps) paintMixer(apps.apps)
    if (m) { takeMic(m); mic = { ...mic, level: m.level }; paintMic() }
  }
  function onPush(name: string, d: unknown) {
    if (!alive) return
    const p = audioPatch(name, d)
    if (!p) return
    if (!up) { up = true; root.classList.remove('is-off'); $('off').hidden = true }
    switch (p.kind) {
      case 'volume': takeVolume(p.value); break
      case 'mic': takeMic(p); break
      case 'mic_level': mic = { ...mic, level: p.level }; paintMic(); break
      case 'output': void refreshOutputs(); break
      case 'apps': paintMixer(p.apps); break
    }
  }

  // ---- Master volume: drag the bar, or the arrow keys. The bar follows the finger, the helper hears one change per 50 ms.
  const sl = $('sl')
  const vol = createDragSender<number, Volume>({
    send: (v) => setVolume(v),
    onReply: (r) => { sure.level = r.level; if (!sl.classList.contains('drag')) { level = r.level; paintMaster() } },
    onFail: () => { level = sure.level; paintMaster(); shake(sl) },
  })
  const setLevel = (v: number) => {
    touched.vol = Date.now()
    level = v
    if (muted && v > 0) toggleMute(false) // turning it up while muted unmutes, as the volume keys do
    paintMaster()
    vol.push(v)
  }
  sl.addEventListener('pointerdown', (e) => {
    if (!up) return
    sl.setPointerCapture(e.pointerId); sl.classList.add('drag')
    const move = (ev: PointerEvent) => { const r = sl.getBoundingClientRect(); setLevel(Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100)) }
    move(e)
    const done = () => { sl.classList.remove('drag'); touched.vol = Date.now(); vol.flush(); sl.removeEventListener('pointermove', move); sl.removeEventListener('pointerup', done); sl.removeEventListener('pointercancel', done) }
    sl.addEventListener('pointermove', move); sl.addEventListener('pointerup', done); sl.addEventListener('pointercancel', done)
  })
  sl.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0
    if (!d || !up) return
    e.preventDefault(); e.stopPropagation()
    setLevel(stepLevel(level, d))
  })

  // ---- Taps: drawn at once, sent in the background, answered by the helper, put back with a shake if it said no.
  function toggleMute(next: boolean) {
    void actions.run('mute', {
      prev: muted, next,
      apply: (m) => { muted = m; paintMaster() },
      send: () => setMuted(next),
      reconcile: (r) => { muted = r.muted; if (!(vol.busy || recent('vol'))) level = sure.level = r.level; paintMaster() },
      fail: () => shake($('mute')),
    })
  }
  $('mute').addEventListener('click', () => { if (up) toggleMute(!muted) })
  $('micB').addEventListener('click', () => {
    if (!up) return
    const next = !mic.muted
    void actions.run('mic', {
      prev: mic.muted, next,
      apply: (m) => { mic = { ...mic, muted: m }; paintMic() },
      send: () => setMicMuted(next),
      reconcile: (r) => { mic = { ...mic, muted: r.muted }; paintMic() },
      fail: () => shake($('micB')),
    })
  })

  // ---- Mixer sliders, one per app: drag up and down. Changes go to the app's audio session through the helper.
  const senders = new Map<string, DragSender<number>>()
  function appSender(id: string): DragSender<number> {
    let s = senders.get(id)
    if (!s) {
      s = createDragSender<number, { apps: AppVolume[] }>({
        send: (v) => setAppVolume(id, v),
        onReply: (r) => {
          const row = mixerApps(r.apps, 99).shown.find((a) => a.id === id)
          if (!row) return
          sureApp.set(id, row.level)
          if (!appEl(id)?.classList.contains('drag')) paintApp(id, muted ? 0 : row.level)
        },
        onFail: () => { paintApp(id, sureApp.get(id) ?? 0); shake(appEl(id)) },
      })
      senders.set(id, s)
    }
    return s
  }
  const pushApp = (id: string, v: number) => { touched[`app:${id}`] = Date.now(); paintApp(id, v); appSender(id).push(v) }
  $('mx').addEventListener('pointerdown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('.auA')
    if (!a || !up) return
    const id = a.dataset.a!
    const track = a.querySelector<HTMLElement>('.vt')!
    track.setPointerCapture(e.pointerId)
    a.classList.add('drag')
    const move = (ev: PointerEvent) => { const r = track.getBoundingClientRect(); pushApp(id, Math.round(Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height)) * 100)) }
    move(e)
    const done = () => { a.classList.remove('drag'); touched[`app:${id}`] = Date.now(); appSender(id).flush(); track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', done); track.removeEventListener('pointercancel', done) }
    track.addEventListener('pointermove', move); track.addEventListener('pointerup', done); track.addEventListener('pointercancel', done)
  })
  $('mx').addEventListener('keydown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('.auA')
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0
    if (!a || !d || !up) return
    e.preventDefault(); e.stopPropagation()
    pushApp(a.dataset.a!, stepLevel(Number(a.getAttribute('aria-valuenow') ?? 0), d))
  })

  // Switching the output: the row you tap lights up at once, and if Windows says no the old one comes back, with a shake and a plain sentence.
  let busyOut = false
  async function switchTo(id: string) {
    if (!up || !canSwitch) return
    const row = $('outs').querySelector<HTMLElement>(`[data-o="${CSS.escape(id)}"]`)
    if (!row || row.classList.contains('on')) return
    busyOut = true
    const before = outName
    $('outs').querySelectorAll('.auO').forEach((r) => r.classList.toggle('on', r === row))
    const r = await setDefaultOutput(id)
    busyOut = false
    if (!alive) return
    if (r) { outName = r.current; paintOutputs(r.outputs, !!r.can_switch); paintMaster() } else { outName = before; shake(row); tip(root, 'Switch in Windows. Halo could not change the output.'); delete shown.outs; void refreshOutputs() }
  }
  $('outs').addEventListener('click', (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>('.auO[data-o]'); if (r) void switchTo(r.dataset.o!) })
  $('outs').addEventListener('keydown', (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>('.auO[data-o]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void switchTo(r.dataset.o!) } })
  root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-k="retry"]')) void refresh() })

  // The stream feeds every control, the mic meter included. The panel reads once when it is built (the stream's first look went
  // out before this tab existed) and when the stream comes back, and polls every 10 s only while the stream is down.
  const offEvents = onHelperEvent(onPush)
  const offStream = onStreamState((v) => { if (!v && onScreen()) void refresh() })
  const poll = createFallbackPoll({ refresh: () => void refresh(), onScreen, streamUp })
  root.onEnter = () => { if (!seeded || !streamUp()) void refresh() }
  paintMaster(); paintMic()
  void refresh()
  root.destroy = () => { alive = false; catchUp.stop(); poll.stop(); offEvents(); offStream(); vol.cancel(); senders.forEach((s) => s.cancel()) }
  return root
}
