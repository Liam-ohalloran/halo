import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALWAYS_PINNED, DEFAULT_PINNED, MAX_PINNED, NEVER_PINNED, canPinMore, mergeTheme, moreIds, movePinnedTo, moveTab, normalisePrefs, samePrefs, themeTabs, togglePin } from '../src/lib/tabprefs.ts'
import { SLEEP_H, clock12, clockPm, createNightMode, eveningOf, isMuted, planNight, tickCards, untilLabel } from '../src/lib/night.ts'
import { DEFAULT_ORDER } from '../src/styles/tabs.ts'

test('tab prefs: nothing saved gives the default pinned tabs', () => {
  const p = normalisePrefs(null, DEFAULT_ORDER)
  assert.deepEqual(p.pinned, DEFAULT_PINNED)
  assert.deepEqual(p.pinned, ['home', 'week', 'pay', 'study', 'music', 'sixers', 'alerts'])
  assert.deepEqual(normalisePrefs('nonsense', DEFAULT_ORDER).pinned, DEFAULT_PINNED)
  assert.deepEqual(normalisePrefs({ pinned: 5 }, DEFAULT_ORDER).pinned, DEFAULT_PINNED)
  // A save from before card 27 (an order and a hidden list, no pinned list) starts from the defaults.
  assert.deepEqual(normalisePrefs({ order: [...DEFAULT_ORDER].reverse(), hidden: ['money'] }, DEFAULT_ORDER).pinned, DEFAULT_PINNED)
})

test('tab prefs: unknown ids and duplicates are dropped, Home is always there, More is never pinned, nine becomes eight', () => {
  const p = normalisePrefs({ pinned: ['pay', 'ghost', 'pay', 'more', 'music'] }, DEFAULT_ORDER)
  assert.deepEqual(p.pinned, ['home', 'pay', 'music'], 'Home is put back at the front')
  const nine = normalisePrefs({ pinned: ['home', 'week', 'pay', 'study', 'music', 'sixers', 'alerts', 'money', 'marks', 'claude'] }, DEFAULT_ORDER)
  assert.equal(nine.pinned.length, MAX_PINNED)
  assert.deepEqual(normalisePrefs({ pinned: [] }, DEFAULT_ORDER).pinned, ['home'])
})

test('tab prefs: pin, unpin and the limit of 8', () => {
  let p = normalisePrefs(null, DEFAULT_ORDER)
  assert.deepEqual(moreIds(p, DEFAULT_ORDER), ['money', 'controls', 'claude', 'night', 'marks', 'shelf', 'widgets'], 'everything else, in the default order, and More is the button so it is left out')
  p = togglePin(p, 'money')
  assert.equal(p.pinned.length, 8)
  assert.ok(!canPinMore(p))
  assert.equal(togglePin(p, 'marks'), p, 'a ninth cannot be pinned')
  p = togglePin(p, 'pay')
  assert.ok(!p.pinned.includes('pay') && canPinMore(p))
  for (const id of ALWAYS_PINNED) assert.equal(togglePin(p, id), p, 'Home stays')
  for (const id of NEVER_PINNED) assert.equal(togglePin(p, id), p, 'More never goes in')
})

test('tab prefs: drag to a new place, and the arrow keys move one place', () => {
  let p = normalisePrefs(null, DEFAULT_ORDER)
  p = movePinnedTo(p, 'alerts', 1)
  assert.deepEqual(p.pinned.slice(0, 3), ['home', 'alerts', 'week'])
  assert.equal(movePinnedTo(p, 'alerts', 1), p, 'dropping it where it is changes nothing')
  assert.deepEqual(movePinnedTo(p, 'home', 99).pinned.at(-1), 'home', 'dropping past the end puts it last')
  p = moveTab(normalisePrefs(null, DEFAULT_ORDER), 'pay', 1)
  assert.deepEqual(p.pinned.slice(0, 4), ['home', 'week', 'study', 'pay'])
  const q = normalisePrefs(null, DEFAULT_ORDER)
  assert.equal(moveTab(q, 'home', -1), q, 'moving past the start does nothing')
  assert.equal(moveTab(q, 'alerts', 1), q, 'moving past the end does nothing')
  assert.ok(samePrefs(q, { pinned: [...q.pinned] }))
  assert.ok(!samePrefs(q, p))
})

test('tab prefs: saved inside the settings theme without losing its other keys, and read back the same', () => {
  const p = movePinnedTo(togglePin(normalisePrefs(null, DEFAULT_ORDER), 'marks'), 'marks', 1)
  const theme = mergeTheme({ accent: '#FFB547', tabs: 'old', ui: { glow: 50 } }, p)
  assert.equal(theme.accent, '#FFB547')
  assert.deepEqual(theme.ui, { glow: 50 }, 'the Settings switches sit beside the tabs and are kept')
  assert.deepEqual(normalisePrefs(themeTabs(theme), DEFAULT_ORDER), p, 'a second device reads the same order')
  assert.deepEqual(mergeTheme(null, p).tabs, { pinned: p.pinned })
  assert.equal(themeTabs(null), null)
  assert.equal(themeTabs({}), null)
})

// Sat 21 Nov 2026, 3:48 pm Perth.
const NOW = new Date('2026-11-21T07:48:00Z')
const SUN_SHIFT = { starts_at: '2026-11-21T22:00:00Z', title: 'SUNDAY PL 6-2' } // Sun 6:00 am Perth

test('night: alarm an hour before the first shift, lights out eight hours before that', () => {
  const p = planNight(NOW, [SUN_SHIFT], [])
  assert.equal(p.evening, '2026-11-21')
  assert.equal(clockPm(p.alarm), '5:00 am')
  assert.equal(clockPm(p.lightsOut), '9:00 pm')
  assert.equal((p.alarm.getTime() - p.lightsOut.getTime()) / 36e5, SLEEP_H)
  assert.equal(p.event?.kind, 'shift')
  assert.equal(p.f, 0, 'the arc has not started at 3:48 pm')
  assert.equal(untilLabel(p.lightsOut, NOW), '5h 12m')
  assert.equal(clock12(p.lightsOut), '9:00')
})

test('night: the earliest thing wins, a midnight deadline does not set the alarm, no event means 7 am', () => {
  const later = { starts_at: '2026-11-22T03:00:00Z', title: 'SUNDAY EXTRA 11-2' }
  assert.equal(planNight(NOW, [later, SUN_SHIFT], []).event?.label, 'SUNDAY PL 6-2')
  const deadline = { due_at: '2026-11-21T16:00:00Z', subject: 'English', title: 'Text response' } // 12 am Sunday Perth
  assert.equal(planNight(NOW, [], [deadline]).event, null)
  const test8 = { due_at: '2026-11-22T00:30:00Z', subject: 'Chemistry', title: 'Test' } // 8:30 am Sunday
  const t = planNight(NOW, [], [test8])
  assert.equal(t.event?.kind, 'test')
  assert.equal(clockPm(t.alarm), '7:30 am')
  const none = planNight(NOW, [], [])
  assert.equal(none.event, null)
  assert.equal(clockPm(none.alarm), '7:00 am')
  assert.equal(clockPm(none.lightsOut), '11:00 pm')
  // A shift today or two days away is not tomorrow.
  assert.equal(planNight(NOW, [{ starts_at: '2026-11-21T10:00:00Z', title: 'today late' }, { starts_at: '2026-11-23T22:00:00Z', title: 'two days' }], []).event, null)
})

test('night: after midnight it is still last evening, and the arc runs 0 to 1', () => {
  const twoAm = new Date('2026-11-21T18:00:00Z') // 2 am Sunday Perth
  assert.equal(eveningOf(twoAm), '2026-11-21')
  assert.equal(eveningOf(new Date('2026-11-21T21:30:00Z')), '2026-11-22', '5:30 am Sunday is the new day')
  assert.equal(planNight(twoAm, [SUN_SHIFT], []).tomorrow, '2026-11-22')
  assert.ok(planNight(twoAm, [SUN_SHIFT], []).f > 0.6, 'well along the arc at 2 am')
  assert.equal(planNight(new Date('2026-11-21T04:00:00Z'), [SUN_SHIFT], []).f, 0, 'before 5 pm it has not started')
  assert.equal(untilLabel(planNight(NOW, [SUN_SHIFT], []).lightsOut, new Date('2026-11-22T01:00:00Z')), 'past')
})

test('night: the four tick cards follow tomorrow', () => {
  const shift = tickCards(planNight(NOW, [SUN_SHIFT], []))
  assert.deepEqual(shift.map((c) => c.title), ['Uniform out', 'Phone charging', 'Alarm 5:00', 'Water bottle'])
  assert.equal(shift[1].sub, 'BY 9:00')
  assert.equal(tickCards(planNight(NOW, [], [{ due_at: '2026-11-22T00:30:00Z', subject: 'Chemistry', title: 'Test' }]))[0].title, 'Bag packed')
})

test('night mode mutes banners and the unread dot but never leave reminders', () => {
  for (const k of ['hud', 'charge', 'unread'] as const) { assert.equal(isMuted(k, true), true); assert.equal(isMuted(k, false), false) }
  assert.equal(isMuted('leave', true), false)
  for (const k of ['game', 'timer', 'shift', 'music'] as const) assert.equal(isMuted(k, true), false)
})

test('night mode is remembered per device and tells whoever is listening', () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  const a = createNightMode(storage, null)
  assert.equal(a.get(), false)
  const seen: boolean[] = []
  a.subscribe((on) => seen.push(on))
  a.set(true); a.set(true); a.set(false); a.set(true)
  assert.deepEqual(seen, [true, false, true], 'no news when nothing changed')
  assert.equal(createNightMode(storage, null).get(), true, 'a reload keeps it')
  const broken = createNightMode({ getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }, null)
  assert.equal(broken.get(), false)
  assert.doesNotThrow(() => broken.set(true))
})
