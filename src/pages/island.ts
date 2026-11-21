import '../styles/tokens.css'
import '../styles/proto.css'
import './pages.css'
import { h } from '../components/dom'
import { Shell } from '../components/Shell'
import { IslandLive, type LiveData } from '../components/IslandLive'
import { PRIORITY, pickLive } from '../lib/island-live'
import { eqHud, hudFromEvent, newHudMemory } from '../lib/hud'
import { setForceReduced, setTimeScale } from '../lib/motion'
import { Banners } from '../components/Banners'
import type { AlertRow } from '../types'

// /island: card 17 on its own. A button for every live state and every HUD pill. The HUD buttons send the same events
// the helper does (volume, brightness and so on) through hudFromEvent, so the real path is what gets tested.
// ?live=leave,game,... turns states on, ?hud=Vol+ fires one, ?open=1 opens the window (for screenshots).

const app = document.getElementById('app')!
const params = new URLSearchParams(location.search)

const sh = Shell({ active: 'home', auto: true })
sh.host.show(sh.soon('home'))
const live = IslandLive(sh, {
  onTimer: (a) => {
    if (a === 'stop') { on.timer = false; timerLeft = 24 * 60 + 12; syncData(); syncButtons() }
    else { timerRun = !timerRun; syncData() }
  },
})

// ---- Card 18: a play button for every alert type. The source is empty (nothing real is read or marked here).
const SAMPLES: Record<string, Pick<AlertRow, 'title' | 'body' | 'action_label' | 'action_url'>> = {
  shift_cover: { title: 'Cover needed · Sat 5–10', body: 'Blink · Innaloo Crew Shifts', action_label: 'Open Blink', action_url: 'https://example.com/blink' },
  leave_reminder: { title: 'Leave in 10 min', body: 'Shift 6:30 · bus 6:02', action_label: 'Snooze', action_url: null },
  new_mark: { title: 'Chem test marked', body: 'SEQTA · tap to see your result', action_label: 'Open', action_url: 'https://example.com/seqta' },
  call: { title: 'Mum calling', body: 'Mobile · answer on your phone', action_label: 'Phone Link', action_url: 'https://example.com/phone' },
  sixers_final: { title: 'Sixers win 121–116', body: 'Embiid 26 · Edgecombe 24 · 13–3', action_label: 'Box score', action_url: 'https://example.com/box' },
  battery_low: { title: 'Battery 10%', body: 'About 25 min left', action_label: 'Saver', action_url: 'https://example.com/saver' },
  task_done: { title: 'Teams check done', body: '3 tasks added to TickTick', action_label: null, action_url: null },
  focus_done: { title: 'Focus done · 50 min', body: 'Chemistry logged · take 10', action_label: 'Break', action_url: 'https://example.com/break' },
}
let alertSeq = 0
const sample = (type: string, minsAgo = 0): AlertRow => ({ id: `demo-${++alertSeq}`, type, ...SAMPLES[type], created_at: new Date(Date.now() - minsAgo * 60_000).toISOString(), read_at: null })
const noSource = { rows: () => [] as AlertRow[], status: () => 'ok' as const, subscribe: () => () => {}, markRead: () => Promise.resolve() }
const banners = Banners(sh, live, { source: noSource, go: () => { sh.setActive('alerts', true); sh.host.show(sh.soon('alerts')) }, openUrl: (u) => { lastOpened = u; readout() } })
let lastOpened = ''

// ---- Sample data for each state -----------------------------------------------------------------
let timerLeft = 24 * 60 + 12 // seconds
let timerRun = true
const SAMPLE: Omit<LiveData, 'timer' | 'unread' | 'charge' | 'banner'> = {
  leave: { sub: 'Shift 5:30 · leave by 5:05', chip: '4 min' },
  game: { us: { tri: 'PHI', score: 88, colour: '#4C8DFF' }, them: { tri: 'MIL', score: 81, colour: '#2FA56A' }, status: 'Q3 · 5:21' },
  shift: { label: 'SHIFT · PA · 5:30', big: 'in 1:12', rightLabel: 'LEAVE BY', rightValue: '5:05' },
  music: { title: 'Montagem Rebola', art: cover(), playing: true },
}
function cover(): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff5fa2"/><stop offset="1" stop-color="#3d5afe"/></linearGradient></defs><rect width="40" height="40" fill="url(#g)"/></svg>'
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

type Flag = 'leave' | 'game' | 'timer' | 'shift' | 'music' | 'unread'
const on: Record<Flag, boolean> = { leave: false, game: false, timer: false, shift: false, music: false, unread: false }
const LABEL: Record<Flag, string> = { leave: 'Leave now', game: 'Live game', timer: 'Study timer', shift: 'Shift soon', music: 'Music', unread: 'Unread' }

function syncData() {
  live.update({
    leave: on.leave ? SAMPLE.leave : null,
    game: on.game ? SAMPLE.game : null,
    timer: on.timer ? { label: 'FOCUS · CHEM', left: timerLeft * 1000, total: 50 * 60_000, running: timerRun, colour: '#BF5AF2' } : null,
    shift: on.shift ? SAMPLE.shift : null,
    music: on.music ? SAMPLE.music : null,
  })
  live.setUnread(on.unread ? 3 : 0)
  readout()
}
setInterval(() => { if (on.timer && timerRun && timerLeft > 0) { timerLeft--; syncData() } }, 1000)

// ---- HUD events, in the shapes the helper sends -------------------------------------------------
const mem = newHudMemory()
const dev = { vol: 40, muted: false, bri: 60, kbd: 40, mic: true, caps: false, wifi: true, bt: false, pm: 1, out: 0, eq: 0,
  plane: false, night: false, focus: false, anc: false, plugged: false }
const OUTS = [{ name: 'Speakers', kind: 'speakers' }, { name: 'WH-CH720N', kind: 'headphones' }, { name: 'LG monitor', kind: 'monitor' }]
const POWER = ['battery', 'balanced', 'performance']
const fire = (name: string, data: unknown) => { const m = hudFromEvent(mem, name, data); if (m) live.hud(m) }
const clamp = (v: number) => Math.max(0, Math.min(100, v))
const vol = () => ({ level: dev.vol, muted: dev.muted })

// Seed the memory with where everything starts, so the first press of each shows a pill like the real helper does.
const seed = () => {
  hudFromEvent(mem, 'volume', vol()); hudFromEvent(mem, 'brightness', { level: dev.bri }); hudFromEvent(mem, 'mic', { muted: !dev.mic })
  hudFromEvent(mem, 'caps', { on: dev.caps }); hudFromEvent(mem, 'wifi', { enabled: dev.wifi, ssid: 'Newman-Home' })
  hudFromEvent(mem, 'bluetooth', { enabled: true, connected_device: null }); hudFromEvent(mem, 'power', { mode: POWER[dev.pm] })
  hudFromEvent(mem, 'output', OUTS[dev.out]); hudFromEvent(mem, 'battery', { present: true, percent: 74, charging: false })
  for (const k of ['airplane', 'night', 'focus', 'anc']) hudFromEvent(mem, k, { on: false })
  hudFromEvent(mem, 'kbd', { level: dev.kbd })
}
seed()

const ACT: Record<string, () => void> = {
  'Vol −': () => { dev.muted = false; dev.vol = clamp(dev.vol - 6); fire('volume', vol()) },
  'Vol +': () => { dev.muted = false; dev.vol = clamp(dev.vol + 6); fire('volume', vol()) },
  'Mute': () => { dev.muted = !dev.muted; fire('volume', vol()) },
  'Bri −': () => { dev.bri = clamp(dev.bri - 8); fire('brightness', { level: dev.bri }) },
  'Bri +': () => { dev.bri = clamp(dev.bri + 8); fire('brightness', { level: dev.bri }) },
  'Kbd light': () => { dev.kbd = dev.kbd >= 100 ? 0 : clamp(dev.kbd + 30); fire('kbd', { level: dev.kbd }) },
  'Mic': () => { dev.mic = !dev.mic; fire('mic', { muted: !dev.mic }) },
  'Output': () => { dev.out = (dev.out + 1) % OUTS.length; fire('output', OUTS[dev.out]) },
  'Bluetooth': () => { dev.bt = !dev.bt; fire('bluetooth', { enabled: true, connected_device: dev.bt ? 'WH-CH720N' : null }) },
  'Wi-Fi': () => { dev.wifi = !dev.wifi; fire('wifi', { enabled: dev.wifi, ssid: dev.wifi ? 'Newman-Home' : null }) },
  'Airplane': () => { dev.plane = !dev.plane; fire('airplane', { on: dev.plane }) },
  'Night light': () => { dev.night = !dev.night; fire('night', { on: dev.night }) },
  'Focus': () => { dev.focus = !dev.focus; fire('focus', { on: dev.focus, detail: 'Study · 50 min · alerts held' }) },
  'Power mode': () => { dev.pm = (dev.pm + 1) % 3; fire('power', { mode: POWER[dev.pm] }) },
  'EQ': () => { dev.eq = (dev.eq + 1) % 4; live.hud(eqHud(dev.eq)) },
  'ANC': () => { dev.anc = !dev.anc; fire('anc', { on: dev.anc, device: 'WH-CH720N' }) },
  'Caps lock': () => { dev.caps = !dev.caps; fire('caps', { on: dev.caps }) },
  'Plug in': () => { dev.plugged = true; fire('battery', { present: true, percent: 74, charging: true }) },
  'Unplug': () => { dev.plugged = false; fire('battery', { present: true, percent: 74, charging: false, minutes_left: 25 }) },
}

// ---- Page ---------------------------------------------------------------------------------------
const btn = (label: string, fn: () => void, attrs: Record<string, unknown> = {}) => h('button', { type: 'button', class: 'il-dev', onclick: fn, ...attrs }, label)
const stateBtns = new Map<Flag, HTMLButtonElement>()
for (const k of ['leave', 'game', 'timer', 'shift', 'music', 'unread'] as Flag[]) {
  const b = btn(LABEL[k], () => { on[k] = !on[k]; if (k === 'timer' && on.timer) timerRun = true; if (sh.isOpen) sh.close(); syncData(); syncButtons() }, { 'data-state': k, 'aria-pressed': 'false' })
  stateBtns.set(k, b)
}
const chargingBtn = btn('Charging', () => { if (sh.isOpen) sh.close(); live.charging({ pct: 74, toFull: '~1h 05m' }); readout() }, { 'data-state': 'charge' })
function syncButtons() { for (const [k, b] of stateBtns) { b.classList.toggle('on', on[k]); b.setAttribute('aria-pressed', String(on[k])) } }

const hudBtns = Object.keys(ACT).map((k) => btn(k, ACT[k], { 'data-hud': k }))
// A held key repeats. Holding Vol + must slide the bar, not flash it.
let holdT = 0
const holdBtn = btn('Hold Vol +', () => {}, { 'data-hold': 'vol' })
holdBtn.addEventListener('pointerdown', () => { ACT['Vol +'](); holdT = window.setInterval(ACT['Vol +'], 90) })
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) holdBtn.addEventListener(ev, () => clearInterval(holdT))

const notifyBtns = Object.keys(SAMPLES).map((t) => btn(t.replace('_', ' '), () => banners.play(sample(t)), { 'data-notify': t }))
const notifyAll = btn('Play all', () => { for (const t of Object.keys(SAMPLES)) banners.play(sample(t)) }, { 'data-notify': 'all' })
const read = h('p', { class: 'il-read', 'aria-live': 'polite' })
function readout() {
  const kind = pickLive({ leave: on.leave, game: on.game, timer: on.timer, shift: on.shift, music: on.music, charge: !!live.data.charge, unread: on.unread ? 3 : 0 })
  read.textContent = `${lastOpened ? `Opened link: ${lastOpened}. ` : ''}Showing: ${live.shown}. Priority: ${PRIORITY.join(', ')}. Top of the list that is on: ${kind}.`
}
const slow = btn('Slow motion ×0.25', () => { const v = slow.classList.toggle('on'); setTimeScale(v ? 0.25 : 1) })
const rm = btn('Reduce motion', () => { setForceReduced(rm.classList.toggle('on')) })

const row = (title: string, ...kids: Node[]) => h('section', { class: 'il-row' }, h('span', { class: 'il-lab' }, title), ...kids)
app.append(sh.el, h('div', { class: 'il-page' },
  h('header', {}, h('h1', {}, 'Island'), h('p', {}, 'Cards 17 and 18. Every live state, every HUD pill and every notification banner. The island is at the top of the screen. Keys: − = for volume, [ ] for brightness, M for mute.')),
  row('Live', ...stateBtns.values(), chargingBtn),
  row('HUD', ...hudBtns, holdBtn),
  row('Notify', ...notifyBtns, notifyAll),
  row('Page', slow, rm),
  read,
))

document.addEventListener('keydown', (e) => {
  if ((e.target as Element).closest('input, textarea')) return
  const m: Record<string, string> = { '-': 'Vol −', '=': 'Vol +', '+': 'Vol +', '[': 'Bri −', ']': 'Bri +', m: 'Mute', M: 'Mute' }
  const k = m[e.key]
  if (k) { e.preventDefault(); ACT[k]() }
})

for (const k of (params.get('live') ?? '').split(',')) if (k in on) on[k as Flag] = true
if (params.get('live')?.includes('charge')) live.charging({ pct: 74, toFull: '~1h 05m' })
syncData(); syncButtons()
const first = params.get('hud')
if (first && ACT[first]) setTimeout(ACT[first], 400)
for (const t of (params.get('notify') ?? '').split(',')) if (t in SAMPLES) setTimeout(() => banners.play(sample(t)), 300)
if (params.get('open') === '1') requestAnimationFrame(() => sh.open())
