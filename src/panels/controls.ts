import '../styles/tokens.css'
import '../styles/proto.css'
import './controls.css'
import { pvRoot, type PvRoot } from '../ui/charts'
import { getBattery, getBluetooth, getBrightness, getOutputs, getPowerMode, getVolume, getWifi, helperToken, onHelperEvent, onStreamState, setBluetooth, setBrightness, setMuted, setPowerMode, setVolume, setWifi, streamUp, type Battery, type Bluetooth, type PowerMode, type Volume, type Wifi } from '../lib/helper'
import { batteryText, controlsPatch, powerIndex, POWER_MODES, tapText, tileState, type TileState } from '../lib/controls'
import { SETTLE_MS, createActions, createCatchUp, createDragSender, createFallbackPoll, stepLevel } from '../lib/optimistic'
import { shake } from '../lib/shake'

// Controls tab (card 24, card 29), compact grid with colour. Brightness and volume are tall sliders (drag or scroll), then Wi-Fi, Bluetooth,
// Night light, Focus, Mute, the battery, the power mode and where the sound goes. Everything goes through the helper: a tap or drag is drawn at once and sent in the background (card 29), the helper pushes every change back over /events, and a "no" puts the control back with a small shake. With the
// helper off every tile is dimmed and says so, with one retry button. Night light is read only (the helper tells Halo, Halo never
// changes it), Focus has no public Windows API, and Halo never switches the audio output, so those say "Not available yet" or just show.

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  vol: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg>',
  bt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 5V2l5 5L7 17"/></svg>',
  night: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>',
  head: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="2" fill="currentColor"/><rect x="17" y="14" width="4" height="7" rx="2" fill="currentColor"/></svg>',
}
const TILES: { k: 'wifi' | 'bt' | 'night' | 'focus' | 'mute'; name: string; c: string; icon: string }[] = [
  { k: 'wifi', name: 'Wi-Fi', c: '#0A84FF', icon: ICONS.wifi }, { k: 'bt', name: 'Bluetooth', c: '#5E5CE6', icon: ICONS.bt },
  { k: 'night', name: 'Night light', c: '#FF9F0A', icon: ICONS.night }, { k: 'focus', name: 'Focus', c: '#BF5AF2', icon: ICONS.focus }, { k: 'mute', name: 'Mute', c: '#FF453A', icon: ICONS.mute },
]

const slider = (k: string, i: number, label: string, icon: string) => `<div class="ctS pop" data-s="${k}" style="--i:${i}" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="fl"></div><span class="pc num" data-k="${k}N">0</span><span class="ic">${icon}</span></div>`
const tile = (t: (typeof TILES)[number], i: number) => `<button type="button" class="ctT pop" data-t="${t.k}" style="--i:${i};--c:${t.c}" aria-pressed="false"><span class="ib">${t.icon}</span><b>${t.name}</b><span data-k="${t.k}S">…</span></button>`

const TEMPLATE = `<div class="ctG">
  ${slider('bri', 0, 'Brightness', ICONS.sun)}${slider('vol', 1, 'Volume', ICONS.vol)}
  ${tile(TILES[0], 2)}${tile(TILES[1], 3)}
  <div class="ctT ctBat pop" style="--i:4"><span class="caps">Battery</span><div class="v num" data-k="batV">–</div><div class="cells">${Array.from({ length: 10 }, () => '<i></i>').join('')}</div><span data-k="batS"></span></div>
  ${tile(TILES[2], 5)}${tile(TILES[3], 6)}${tile(TILES[4], 7)}
  <div class="ctPM pop" style="--i:8" role="radiogroup" aria-label="Power mode"><i class="k"></i>${POWER_MODES.map((m) => `<button type="button" role="radio" data-p="${m.id}" aria-checked="false">${m.label}</button>`).join('')}</div>
  <div class="ctOut pop" style="--i:9"><span class="ib">${ICONS.head}</span><div><b data-k="outN">Audio output</b><span>Audio output</span></div></div>
  <div class="ctOff" data-k="off" role="status" hidden><b data-k="offT">Start Halo helper</b><span>Controls need Halo to see your laptop.</span><button type="button" data-k="retry">Try again</button></div>
</div>`

export interface ControlsPanelHandle extends PvRoot { destroy(): void }

export function ControlsPanel(): ControlsPanelHandle {
  const root = pvRoot('controls-pv') as ControlsPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Controls')
  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!
  const shown: Record<string, string> = {}
  const text = (k: string, v: string) => { if (shown[k] !== v) { shown[k] = v; $(k).textContent = v } }
  let alive = true
  let up = false
  let seeded = false
  let night: boolean | null = null
  let pm: PowerMode | null = null

  // What the helper last said, per control. A tap or drag is drawn at once. If the helper then says no, the control goes back to this.
  const sure = { bri: 0, vol: 0, mode: null as PowerMode | null, muted: false }
  const level = { bri: 0, vol: 0 }
  const touched: Record<string, number> = {}
  const actions = createActions()
  const catchUp = createCatchUp()

  const onScreen = () => alive && !document.hidden && root.isConnected && root.offsetParent !== null && !root.classList.contains('h-off')
  const el = (sel: string) => root.querySelector<HTMLElement>(sel)!

  function setUp(v: boolean) {
    up = v
    root.classList.toggle('is-off', !v)
    $('off').hidden = v
    text('offT', helperToken() ? 'Start Halo helper' : 'Open Halo on your laptop')
  }
  function setSlider(k: 'bri' | 'vol', v: number) {
    level[k] = v
    const s = el(`[data-s="${k}"]`)
    s.querySelector<HTMLElement>('.fl')!.style.height = `${v}%`
    s.setAttribute('aria-valuenow', String(v))
    text(`${k}N`, String(v))
  }
  function setTile(k: string, s: TileState) {
    const t = el(`[data-t="${k}"]`)
    t.classList.toggle('on', s.on)
    t.classList.toggle('na', s.disabled)
    t.setAttribute('aria-pressed', String(s.on))
    t.toggleAttribute('aria-disabled', s.disabled)
    text(`${k}S`, s.text)
  }
  /** A tile the helper has confirmed (a pushed value, a read, or the answer to a tap). */
  function confirmTile(k: string, s: TileState) { setTile(k, s) }
  function setPower(m: PowerMode | null) {
    pm = m
    const i = powerIndex(m)
    const k = el('.ctPM .k')
    k.style.transform = `translateX(${Math.max(0, i) * 100}%)`
    k.style.opacity = i < 0 ? '0' : '1'
    k.style.setProperty('--pmc', ['#30D158', '#0A84FF', '#FF9F0A'][Math.max(0, i)])
    root.querySelectorAll<HTMLElement>('[data-p]').forEach((b) => { const on = b.dataset.p === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)) })
  }
  function setBattery(bat: Battery | null) {
    const b = batteryText(bat)
    text('batV', b.value); text('batS', b.sub)
    root.querySelectorAll<HTMLElement>('.cells i').forEach((c, i) => c.classList.toggle('on', i < b.cells))
    el('.ctBat').classList.toggle('chg', !!bat?.charging)
  }

  // ---- What the helper tells us: a push (every change, as it happens), or a read (first paint, and the slow fallback). ----
  const dragging = (k: 'bri' | 'vol') => senders[k].busy || Date.now() - (touched[k] ?? 0) < SETTLE_MS
  const dragLeft = (k: 'bri' | 'vol') => (senders[k].busy ? SETTLE_MS : Math.max(0, SETTLE_MS - (Date.now() - (touched[k] ?? 0))))
  // A pushed value that lands while Liam's own change is settling is held back, then confirmed with one read when it is over.
  const hold = (key: string, left: () => number, read: () => Promise<unknown>) => catchUp.later(key, left, () => { if (alive) void read() })
  function takeVolume(v: Volume) {
    if (!dragging('vol')) { sure.vol = v.level; setSlider('vol', v.level) } else hold('vol', () => dragLeft('vol'), async () => { const r = await getVolume(); if (r) takeVolume(r) })
    if (!actions.settling('mute')) { sure.muted = v.muted; confirmTile('mute', tileState('mute', { on: v.muted })) } else hold('mute', () => actions.settleLeft('mute'), async () => { const r = await getVolume(); if (r) takeVolume(r) })
  }
  function takeBrightness(l: number) { if (!dragging('bri')) { sure.bri = l; setSlider('bri', l) } else hold('bri', () => dragLeft('bri'), async () => { const r = await getBrightness(); if (r) takeBrightness(r.level) }) }
  function takeWifi(w: Wifi | null) { if (!actions.settling('wifi')) confirmTile('wifi', tileState('wifi', w ? { on: w.enabled, detail: w.connected ? w.ssid : null } : null)); else hold('wifi', () => actions.settleLeft('wifi'), async () => takeWifi(await getWifi())) }
  function takeBluetooth(b: Bluetooth | null) { if (!actions.settling('bt')) confirmTile('bt', tileState('bt', b ? { on: b.enabled, detail: b.connected_device } : null)); else hold('bt', () => actions.settleLeft('bt'), async () => takeBluetooth(await getBluetooth())) }
  function takePower(m: PowerMode | null) { if (!actions.settling('pm')) { sure.mode = m; setPower(m) } else hold('pm', () => actions.settleLeft('pm'), async () => takePower((await getPowerMode())?.mode ?? null)) }

  async function refresh() {
    const [vol, bri, wifi, bt, bat, mode, outs] = await Promise.all([getVolume(), getBrightness(), getWifi(), getBluetooth(), getBattery(), getPowerMode(), getOutputs()])
    if (!alive) return
    setUp(!!(vol || bri || wifi || bt || bat || mode || outs))
    seeded = true
    if (vol) takeVolume(vol); else confirmTile('mute', tileState('mute', null))
    if (bri) takeBrightness(bri.level)
    takeWifi(wifi)
    takeBluetooth(bt)
    confirmTile('night', tileState('night', night === null ? null : { on: night }))
    confirmTile('focus', tileState('focus', null))
    setBattery(bat)
    takePower(mode?.mode ?? null)
    text('outN', outs?.current ?? 'No output')
  }

  function onPush(name: string, d: unknown) {
    if (!alive) return
    const p = controlsPatch(name, d)
    if (!p) return
    if (!up) setUp(true) // an event is proof the helper is there
    switch (p.kind) {
      case 'volume': takeVolume(p.value); break
      case 'brightness': takeBrightness(p.level); break
      case 'wifi': takeWifi(p.value); break
      case 'bluetooth': takeBluetooth(p.value); break
      case 'battery': setBattery(p.value); break
      case 'power': takePower(p.mode); break
      case 'output': text('outN', p.name); break
      case 'night': night = p.on; confirmTile('night', tileState('night', { on: p.on })); break
    }
  }

  // ---- Sliders: drag up and down, scroll, or the arrow keys. The screen follows the finger at once. The helper hears at most one
  // change every 50 ms (the newest), its answer settles the number, and a "no" puts the slider back and shakes it.
  const senders = {
    bri: createDragSender<number, { level: number }>({
      send: (v) => setBrightness(v),
      onReply: (r) => { if (!root.querySelector('[data-s="bri"].drag')) { sure.bri = r.level; setSlider('bri', r.level) } else sure.bri = r.level },
      onFail: () => { setSlider('bri', sure.bri); shake(el('[data-s="bri"]')) },
    }),
    vol: createDragSender<number, Volume>({
      send: (v) => setVolume(v),
      onReply: (r) => { sure.vol = r.level; if (!root.querySelector('[data-s="vol"].drag')) setSlider('vol', r.level); if (!actions.settling('mute')) confirmTile('mute', tileState('mute', { on: r.muted })) },
      onFail: () => { setSlider('vol', sure.vol); shake(el('[data-s="vol"]')) },
    }),
  }
  for (const k of ['bri', 'vol'] as const) {
    const s = el(`[data-s="${k}"]`)
    const move = (v: number) => { touched[k] = Date.now(); setSlider(k, v); senders[k].push(v) }
    const fromY = (clientY: number) => { const r = s.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height)) * 100) }
    s.addEventListener('pointerdown', (e) => {
      if (!up) return
      s.setPointerCapture(e.pointerId); s.classList.add('drag')
      const onMove = (ev: PointerEvent) => move(fromY(ev.clientY))
      onMove(e)
      const done = () => { s.classList.remove('drag'); touched[k] = Date.now(); senders[k].flush(); s.removeEventListener('pointermove', onMove); s.removeEventListener('pointerup', done); s.removeEventListener('pointercancel', done) }
      s.addEventListener('pointermove', onMove); s.addEventListener('pointerup', done); s.addEventListener('pointercancel', done)
    })
    s.addEventListener('wheel', (e) => { if (!up) return; e.preventDefault(); move(stepLevel(level[k], e.deltaY < 0 ? 5 : -5)) }, { passive: false })
    s.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0
      if (!d || !up) return
      e.preventDefault(); e.stopPropagation()
      move(stepLevel(level[k], d))
    })
  }

  // ---- Taps: the tile flips at once, the helper's answer fills in the network or device name, a "no" flips it back and shakes it.
  type TapKind = 'wifi' | 'bt' | 'mute'
  const SEND: Record<TapKind, (on: boolean) => Promise<unknown>> = { wifi: (on) => setWifi(on), bt: (on) => setBluetooth(on), mute: (on) => setMuted(on) }
  function tap(k: TapKind) {
    const t = el(`[data-t="${k}"]`)
    const prev: TileState = { on: t.classList.contains('on'), text: shown[`${k}S`] ?? '', disabled: false } // exactly what is on screen now
    const next: TileState = { on: !prev.on, text: tapText(k, !prev.on), disabled: false }
    void actions.run(k, {
      prev, next,
      apply: (s) => setTile(k, s),
      send: () => SEND[k](next.on),
      reconcile: (r) => {
        if (k === 'wifi') { const w = r as Wifi; confirmTile('wifi', tileState('wifi', { on: w.enabled, detail: w.connected ? w.ssid : null })) }
        else if (k === 'bt') { const b = r as Bluetooth; confirmTile('bt', tileState('bt', { on: b.enabled, detail: b.connected_device })) }
        else { const v = r as Volume; sure.muted = v.muted; confirmTile('mute', tileState('mute', { on: v.muted })) }
      },
      fail: () => shake(t),
    })
  }
  function pickPower(m: PowerMode) {
    const prev = pm
    void actions.run('pm', {
      prev, next: m,
      apply: (v) => setPower(v),
      send: () => setPowerMode(m),
      reconcile: (r) => { const mode = (r as { mode: PowerMode }).mode; sure.mode = mode; setPower(mode) },
      fail: () => shake(el('.ctPM')),
    })
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')
    if (t && up && !t.classList.contains('na')) {
      const k = t.dataset.t as string
      if (k === 'wifi' || k === 'bt' || k === 'mute') tap(k)
    }
    const p = (e.target as HTMLElement).closest<HTMLElement>('[data-p]')
    if (p && up) pickPower(p.dataset.p as PowerMode)
    if ((e.target as HTMLElement).closest('[data-k="retry"]')) void refresh()
  })

  // The stream feeds every control. The panel reads once when it is built (the stream's first look went out before this tab
  // existed) and when the stream comes back, and polls every 10 s only while the stream is down.
  const offEvents = onHelperEvent(onPush)
  const offStream = onStreamState((v) => { if (!v && onScreen()) void refresh() })
  const poll = createFallbackPoll({ refresh: () => void refresh(), onScreen, streamUp })
  root.onEnter = () => { if (!seeded || !streamUp()) void refresh() }
  void refresh()
  root.destroy = () => { alive = false; catchUp.stop(); poll.stop(); offEvents(); offStream(); senders.bri.cancel(); senders.vol.cancel() }
  return root
}
