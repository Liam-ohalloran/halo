import '../styles/tokens.css'
import '../styles/proto.css'
import './controls.css'
import { pvRoot, type PvRoot } from '../ui/charts'
import { getBattery, getBluetooth, getBrightness, getOutputs, getPowerMode, getVolume, getWifi, helperToken, onHelperEvent, setBluetooth, setBrightness, setMuted, setPowerMode, setVolume, setWifi, type PowerMode } from '../lib/helper'
import { batteryText, powerIndex, POWER_MODES, tileState, type TileState } from '../lib/controls'

// Controls tab (card 24), compact grid with colour. Brightness and volume are tall sliders (drag or scroll), then Wi-Fi, Bluetooth,
// Night light, Focus, Mute, the battery, the power mode and where the sound goes. Everything goes through the helper. With the
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
</div>
<div class="ctOff" data-k="off" role="status" hidden><b data-k="offT">Start Halo helper</b><span>Controls need Halo to see your laptop.</span><button type="button" data-k="retry">Try again</button></div>`

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
  let night: boolean | null = null
  const level = { bri: 0, vol: 0 }
  const busy: Record<string, number> = {}
  let pm: PowerMode | null = null
  let timer = 0

  const onScreen = () => alive && !document.hidden && root.isConnected && root.offsetParent !== null && !root.classList.contains('h-off')

  function setSlider(k: 'bri' | 'vol', v: number) {
    level[k] = v
    const el = root.querySelector<HTMLElement>(`[data-s="${k}"]`)!
    el.querySelector<HTMLElement>('.fl')!.style.height = `${v}%`
    el.setAttribute('aria-valuenow', String(v))
    text(`${k}N`, String(v))
  }
  function setTile(k: string, s: TileState) {
    const el = root.querySelector<HTMLElement>(`[data-t="${k}"]`)!
    el.classList.toggle('on', s.on)
    el.classList.toggle('na', s.disabled)
    el.setAttribute('aria-pressed', String(s.on))
    el.toggleAttribute('aria-disabled', s.disabled)
    text(`${k}S`, s.text)
  }
  function setPower(m: PowerMode | null) {
    pm = m
    const i = powerIndex(m)
    const k = root.querySelector<HTMLElement>('.ctPM .k')!
    k.style.transform = `translateX(${Math.max(0, i) * 100}%)`
    k.style.opacity = i < 0 ? '0' : '1'
    k.style.setProperty('--pmc', ['#30D158', '#0A84FF', '#FF9F0A'][Math.max(0, i)])
    root.querySelectorAll<HTMLElement>('[data-p]').forEach((b) => { const on = b.dataset.p === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)) })
  }

  async function refresh() {
    const [vol, bri, wifi, bt, bat, mode, outs] = await Promise.all([getVolume(), getBrightness(), getWifi(), getBluetooth(), getBattery(), getPowerMode(), getOutputs()])
    if (!alive) return
    up = !!(vol || bri || wifi || bt || bat || mode || outs)
    root.classList.toggle('is-off', !up)
    $('off').hidden = up
    text('offT', helperToken() ? 'Start Halo helper' : 'Open Halo on your laptop')
    if (vol && !busy.vol) setSlider('vol', vol.level)
    if (bri && !busy.bri) setSlider('bri', bri.level)
    setTile('wifi', tileState('wifi', wifi ? { on: wifi.enabled, detail: wifi.connected ? wifi.ssid : null } : null))
    setTile('bt', tileState('bt', bt ? { on: bt.enabled, detail: bt.connected_device } : null))
    setTile('night', tileState('night', night === null ? null : { on: night }))
    setTile('focus', tileState('focus', null))
    setTile('mute', tileState('mute', vol ? { on: vol.muted } : null))
    const b = batteryText(bat)
    text('batV', b.value); text('batS', b.sub)
    root.querySelectorAll<HTMLElement>('.cells i').forEach((c, i) => c.classList.toggle('on', i < b.cells))
    root.querySelector('.ctBat')!.classList.toggle('chg', !!bat?.charging)
    if (!busy.pm) setPower(mode?.mode ?? null)
    text('outN', outs?.current ?? 'No output')
  }

  // Sliders: drag up and down, scroll, or the arrow keys. The page is told at once, the laptop gets at most one change every 80 ms.
  for (const k of ['bri', 'vol'] as const) {
    const el = root.querySelector<HTMLElement>(`[data-s="${k}"]`)!
    let last = 0
    let pending = 0
    const send = (v: number) => {
      busy[k] = Date.now()
      const go = () => { last = Date.now(); void (k === 'bri' ? setBrightness(v) : setVolume(v)); window.setTimeout(() => { if (Date.now() - busy[k] >= 1200) delete busy[k] }, 1300) }
      window.clearTimeout(pending)
      if (Date.now() - last > 80) go(); else pending = window.setTimeout(go, 80)
    }
    const fromY = (clientY: number) => { const r = el.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height)) * 100) }
    el.addEventListener('pointerdown', (e) => {
      if (!up) return
      el.setPointerCapture(e.pointerId); el.classList.add('drag')
      const move = (ev: PointerEvent) => { const v = fromY(ev.clientY); setSlider(k, v); send(v) }
      move(e)
      const done = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', done); el.removeEventListener('pointercancel', done) }
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', done); el.addEventListener('pointercancel', done)
    })
    el.addEventListener('wheel', (e) => { if (!up) return; e.preventDefault(); const v = Math.max(0, Math.min(100, level[k] + (e.deltaY < 0 ? 5 : -5))); setSlider(k, v); send(v) }, { passive: false })
    el.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0
      if (!d || !up) return
      e.preventDefault(); e.stopPropagation()
      const v = Math.max(0, Math.min(100, level[k] + d)); setSlider(k, v); send(v)
    })
  }

  root.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')
    if (t && up && !t.classList.contains('na')) {
      const k = t.dataset.t!
      const on = !t.classList.contains('on')
      t.classList.toggle('on', on) // at once, the helper's answer confirms it
      if (k === 'wifi') void setWifi(on).then(refresh)
      else if (k === 'bt') void setBluetooth(on).then(refresh)
      else if (k === 'mute') void setMuted(on).then(refresh)
    }
    const p = (e.target as HTMLElement).closest<HTMLElement>('[data-p]')
    if (p && up) { const m = p.dataset.p as PowerMode; setPower(m); busy.pm = Date.now(); void setPowerMode(m).then(() => window.setTimeout(() => { delete busy.pm; void refresh() }, 600)) }
    if ((e.target as HTMLElement).closest('[data-k="retry"]')) void refresh()
  })

  const offEvents = onHelperEvent((name, d) => { if (name === 'night') { night = !!(d as { on?: boolean }).on; if (up) setTile('night', tileState('night', { on: night })) } })
  root.onEnter = () => { void refresh() }
  timer = window.setInterval(() => { if (onScreen()) void refresh() }, 2500)
  void refresh()
  root.destroy = () => { alive = false; window.clearInterval(timer); offEvents() }
  void pm
  return root
}
