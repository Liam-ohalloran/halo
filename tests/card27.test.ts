import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_UI, HUD_KEYS, LIVE_KEYS, SIZE_SCALE, SPEED_MUL, createUiStore, cssVars, hudAllowed, liveOff, mergeUi, normaliseUi, themeUi } from '../src/lib/ui-settings.ts'
import { mergeTheme, normalisePrefs, themeTabs } from '../src/lib/tabprefs.ts'
import { noteSource } from '../src/lib/win-notifications.ts'
import { pickLive } from '../src/lib/island-live.ts'
import { DEFAULT_ORDER } from '../src/styles/tabs.ts'

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }

test('settings: nothing saved gives the defaults, and every switch starts on', () => {
  assert.deepEqual(normaliseUi(null), DEFAULT_UI)
  assert.deepEqual(normaliseUi('rubbish'), DEFAULT_UI)
  assert.ok(LIVE_KEYS.every((k) => DEFAULT_UI.live[k]) && HUD_KEYS.every((k) => DEFAULT_UI.hud[k]) && DEFAULT_UI.clipboard)
  assert.deepEqual(liveOff(DEFAULT_UI), [])
})

test('settings: bad values fall back or are clamped, good ones are kept', () => {
  const s = normaliseUi({ size: 'huge', blur: 9000, glow: -4, speed: 'fast', live: { music: false, leave: 'no' }, hud: { sound: false }, sources: { phone: false }, clipboard: false })
  assert.equal(s.size, 'normal')
  assert.equal(s.blur, 150)
  assert.equal(s.glow, 0)
  assert.equal(s.speed, 'fast')
  assert.deepEqual(liveOff(s), ['music'], 'a value that is not a boolean is ignored, so Leave now stays on')
  assert.equal(s.hud.sound, false)
  assert.equal(s.hud.brightness, true)
  assert.equal(s.sources.phone, false)
  assert.equal(s.sources.windows, true)
  assert.equal(s.clipboard, false)
})

test('settings: the look drives the page through three CSS variables', () => {
  assert.deepEqual(cssVars(DEFAULT_UI), { '--halo-blur': '1', '--glow-strength': '1', '--halo-speed': '1' })
  const v = cssVars(normaliseUi({ blur: 0, glow: 150, speed: 'slow' }))
  assert.equal(v['--halo-blur'], '0')
  assert.equal(v['--glow-strength'], '1.5')
  assert.equal(v['--halo-speed'], String(SPEED_MUL.slow))
  assert.ok(SPEED_MUL.slow > 1 && SPEED_MUL.fast < 1)
  assert.deepEqual([SIZE_SCALE.normal, SIZE_SCALE.large > 1, SIZE_SCALE.larger > SIZE_SCALE.large], [1, true, true])
})

test('settings: a pill only shows when its switch is on, and events with no switch are left alone', () => {
  const off = normaliseUi({ hud: { sound: false, network: false } })
  for (const e of ['volume', 'output']) assert.equal(hudAllowed(off, e), false)
  for (const e of ['wifi', 'bluetooth']) assert.equal(hudAllowed(off, e), false)
  for (const e of ['brightness', 'mic', 'caps', 'night', 'airplane']) assert.equal(hudAllowed(off, e), true)
  assert.equal(hudAllowed(off, 'something-new'), true)
})

test('settings: a live state that is switched off is skipped and the next one in line shows', () => {
  const flags = { leave: false, game: true, timer: true, shift: true, music: true }
  assert.equal(pickLive(flags), 'game')
  assert.equal(pickLive({ ...flags, game: false }), 'timer')
  assert.equal(pickLive({ ...flags, game: false, timer: false, shift: false }), 'music')
  assert.equal(pickLive({ ...flags, game: false, timer: false, shift: false, music: false }), 'idle')
})

test('settings: a notification from Phone Link is a phone one, anything else is a Windows one', () => {
  assert.equal(noteSource({ app: 'Phone Link', body: '' }), 'phone')
  assert.equal(noteSource({ body: 'Phone Link' }), 'phone')
  assert.equal(noteSource({ app: 'Your Phone' }), 'phone')
  assert.equal(noteSource({ app: 'Outlook', body: 'Outlook' }), 'windows')
  assert.equal(noteSource(null), 'windows')
})

test('settings: the saved copy sits beside the tab list in the theme and nothing else is lost', () => {
  const s = normaliseUi({ glow: 60, live: { shift: false } })
  const tabs = normalisePrefs({ pinned: ['home', 'marks'] }, DEFAULT_ORDER)
  const theme = mergeUi(mergeTheme({ accent: '#FFB547' }, tabs), s)
  assert.equal(theme.accent, '#FFB547')
  assert.deepEqual(normaliseUi(themeUi(theme)), s)
  assert.deepEqual(normalisePrefs(themeTabs(theme), DEFAULT_ORDER), tabs)
  assert.equal(themeUi(null), null)
  assert.equal(themeUi({}), null)
})

test('settings store: changes reach listeners at once, are saved once, are remembered and ignore no-ops', () => {
  const storage = memory()
  const saved: number[] = []
  const store = createUiStore((s) => saved.push(s.glow), storage)
  const seen: number[] = []
  store.subscribe((s) => seen.push(s.glow))
  store.set({ glow: 40 })
  store.set({ glow: 40 })
  store.set({ glow: 5000 })
  assert.deepEqual(seen, [40, 150])
  assert.deepEqual(saved, [40, 150])
  assert.equal(createUiStore(undefined, storage).get().glow, 150, 'a reload keeps it')
  // What the database sends does not get sent straight back.
  store.load({ glow: 70 })
  assert.equal(store.get().glow, 70)
  assert.deepEqual(saved, [40, 150])
  const broken = createUiStore(undefined, { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
  assert.deepEqual(broken.get(), DEFAULT_UI)
  assert.doesNotThrow(() => broken.set({ glow: 10 }))
})
