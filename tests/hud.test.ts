import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOLD_MS, hudFromEvent, newHudMemory, type HudMemory, type HudModel } from '../src/lib/hud.ts'
import { parseSse } from '../src/lib/helper.ts'

const seeded = (): HudMemory => {
  const m = newHudMemory()
  hudFromEvent(m, 'volume', { level: 40, muted: false })
  hudFromEvent(m, 'brightness', { level: 60 })
  hudFromEvent(m, 'output', { name: 'Speakers', kind: 'speakers' })
  return m
}
const must = (m: HudModel | null): HudModel => { assert.ok(m, 'expected a HUD'); return m }

test('the first event of each kind only seeds, so connecting never pops a pill', () => {
  const m = newHudMemory()
  const first: [string, unknown][] = [
    ['volume', { level: 40, muted: false }], ['brightness', { level: 60 }], ['mic', { muted: false }], ['caps', { on: false }],
    ['wifi', { enabled: true, ssid: 'x' }], ['bluetooth', { enabled: true, connected_device: null }], ['power', { mode: 'balanced' }],
    ['output', { name: 'Speakers', kind: 'speakers' }], ['battery', { present: true, percent: 50, charging: true }],
  ]
  for (const [n, d] of first) assert.equal(hudFromEvent(m, n, d), null, n)
})

test('the full snapshot after a reconnect changes nothing', () => {
  const m = seeded()
  assert.equal(hudFromEvent(m, 'volume', { level: 40, muted: false }), null)
  assert.equal(hudFromEvent(m, 'brightness', { level: 60 }), null)
  assert.equal(hudFromEvent(m, 'output', { name: 'Speakers', kind: 'speakers' }), null)
})

test('volume changes are a slider labelled with the output device, and know where the bar was', () => {
  const m = seeded()
  hudFromEvent(m, 'output', { name: 'WH-CH720N', kind: 'headphones' })
  const v = must(hudFromEvent(m, 'volume', { level: 46, muted: false }))
  assert.equal(v.kind, 'slider')
  if (v.kind === 'slider') assert.deepEqual([v.key, v.label, v.value, v.from, v.hold], ['vol', 'WH-CH720N', 46, 40, HOLD_MS])
  const up = must(hudFromEvent(m, 'volume', { level: 52, muted: false }))
  assert.equal(up.key, v.key, 'same key, so the pill on screen updates in place')
  if (up.kind === 'slider') assert.deepEqual([up.value, up.from], [52, 46])
})

test('mute is a toggle, red when muted, and unmuting goes back to blue', () => {
  const m = seeded()
  const muted = must(hudFromEvent(m, 'volume', { level: 40, muted: true }))
  assert.equal(muted.kind, 'toggle')
  assert.equal(muted.colour, '#FF453A')
  if (muted.kind === 'toggle') assert.deepEqual([muted.label, muted.on], ['Muted', false])
  const back = must(hudFromEvent(m, 'volume', { level: 40, muted: false }))
  assert.equal(back.colour, '#2f86ff')
  if (back.kind === 'toggle') assert.equal(back.on, true)
  hudFromEvent(m, 'volume', { level: 40, muted: true })
  const both = must(hudFromEvent(m, 'volume', { level: 36, muted: false })) // unmute and change at once
  assert.equal(both.kind, 'toggle')
})

test('a slider after unmuting starts from zero', () => {
  const m = seeded()
  hudFromEvent(m, 'volume', { level: 40, muted: true })
  hudFromEvent(m, 'volume', { level: 40, muted: false })
  const s = must(hudFromEvent(m, 'volume', { level: 46, muted: false }))
  if (s.kind === 'slider') assert.equal(s.from, 40)
})

test('brightness is a slider in gold', () => {
  const m = seeded()
  const b = must(hudFromEvent(m, 'brightness', { level: 68 }))
  assert.equal(b.kind, 'slider')
  assert.equal(b.colour, '#FFC23D')
  if (b.kind === 'slider') assert.deepEqual([b.value, b.from], [68, 60])
  assert.equal(hudFromEvent(m, 'brightness', { level: 68 }), null)
})

test('values are clamped to 0 to 100', () => {
  const m = seeded()
  const b = must(hudFromEvent(m, 'brightness', { level: 140 }))
  if (b.kind === 'slider') assert.equal(b.value, 100)
})

test('mic, caps lock, Wi-Fi and the generic toggles', () => {
  const m = newHudMemory()
  const start: [string, unknown][] = [['mic', { muted: false }], ['caps', { on: false }], ['wifi', { enabled: true, ssid: 'Newman-Home' }], ['airplane', { on: false }], ['night', { on: false }], ['focus', { on: false }], ['anc', { on: false }]]
  for (const [n, d] of start) hudFromEvent(m, n, d)
  const mic = must(hudFromEvent(m, 'mic', { muted: true }))
  assert.equal(mic.colour, '#FF453A')
  if (mic.kind === 'toggle') assert.deepEqual([mic.label, mic.on], ['Mic muted', false])
  const caps = must(hudFromEvent(m, 'caps', { on: true }))
  assert.equal(caps.hold, 1100)
  const wifi = must(hudFromEvent(m, 'wifi', { enabled: false, ssid: null }))
  if (wifi.kind === 'toggle') assert.deepEqual([wifi.on, wifi.sub], [false, 'Not connected'])
  for (const n of ['airplane', 'night', 'focus', 'anc']) {
    const t = must(hudFromEvent(m, n, { on: true }))
    assert.equal(t.kind, 'toggle', n)
    assert.equal(hudFromEvent(m, n, { on: true }), null, `${n} again`)
  }
})

test('a Bluetooth device connecting and leaving', () => {
  const m = newHudMemory()
  hudFromEvent(m, 'bluetooth', { enabled: true, connected_device: null })
  const on = must(hudFromEvent(m, 'bluetooth', { enabled: true, connected_device: 'WH-CH720N' }))
  assert.equal(on.wide, true)
  if (on.kind === 'toggle') assert.deepEqual([on.label, on.on], ['WH-CH720N connected', true])
  const off = must(hudFromEvent(m, 'bluetooth', { enabled: true, connected_device: null }))
  if (off.kind === 'toggle') assert.deepEqual([off.label, off.on], ['WH-CH720N disconnected', false])
})

test('power mode and audio output are choices with the picked one lit', () => {
  const m = newHudMemory()
  hudFromEvent(m, 'power', { mode: 'balanced' })
  hudFromEvent(m, 'output', { name: 'Speakers', kind: 'speakers' })
  const p = must(hudFromEvent(m, 'power', { mode: 'performance' }))
  assert.equal(p.kind, 'choice')
  if (p.kind === 'choice') assert.deepEqual([p.options, p.sel], [['Saver', 'Balanced', 'Best'], 2])
  const o = must(hudFromEvent(m, 'output', { name: 'WH-CH720N', kind: 'headphones' }))
  if (o.kind === 'choice') assert.deepEqual([o.label, o.sel, o.options.length], ['WH-CH720N', 1, 3])
})

test('plug in fills a green bar to the battery, unplug says on battery', () => {
  const m = newHudMemory()
  hudFromEvent(m, 'battery', { present: true, percent: 74, charging: false })
  const plug = must(hudFromEvent(m, 'battery', { present: true, percent: 74, charging: true }))
  assert.equal(plug.kind, 'charge')
  if (plug.kind === 'charge') assert.deepEqual([plug.on, plug.pct, plug.colour], [true, 74, '#30D158'])
  assert.equal(hudFromEvent(m, 'battery', { present: true, percent: 75, charging: true }), null, 'percent creeping up is not a change')
  const unplug = must(hudFromEvent(m, 'battery', { present: true, percent: 75, charging: false }))
  if (unplug.kind === 'charge') assert.deepEqual([unplug.on, unplug.pct], [false, 75])
  assert.equal(hudFromEvent(newHudMemory(), 'battery', { present: false }), null)
})

test('unknown events and junk data are ignored', () => {
  const m = newHudMemory()
  assert.equal(hudFromEvent(m, 'media', { title: 'x' }), null)
  assert.equal(hudFromEvent(m, 'volume', null), null)
  assert.equal(hudFromEvent(m, 'nonsense', 5), null)
})

test('event stream: whole messages are parsed, a half message waits for the rest', () => {
  const a = parseSse('retry: 2000\n\n: keep-alive\n\nevent: volume\ndata: {"level":40,"muted":false}\n\nevent: bri')
  assert.deepEqual(a.messages, [{ event: 'volume', data: { level: 40, muted: false } }])
  assert.equal(a.rest, 'event: bri')
  const b = parseSse(a.rest + 'ghtness\ndata: {"level":7}\n\n')
  assert.deepEqual(b.messages, [{ event: 'brightness', data: { level: 7 } }])
  assert.equal(b.rest, '')
  assert.deepEqual(parseSse('event: x\r\ndata: nope\r\n\r\n').messages, [])
})
