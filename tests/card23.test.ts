import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PINNED, mergeTheme, moveTab, normalisePrefs, samePrefs, themeTabs, toggleHidden, visibleIds } from '../src/lib/tabprefs.ts'
import { SLEEP_H, clock12, clockPm, createNightMode, eveningOf, isMuted, planNight, tickCards, untilLabel } from '../src/lib/night.ts'
import { DEFAULT_ORDER } from '../src/styles/tabs.ts'

test('tab prefs: nothing saved gives the default order with nothing hidden', () => {
  const p = normalisePrefs(null, DEFAULT_ORDER)
  assert.deepEqual(p.order, DEFAULT_ORDER)
  assert.deepEqual(p.hidden, [])
  assert.deepEqual(normalisePrefs('nonsense', DEFAULT_ORDER).order, DEFAULT_ORDER)
  assert.deepEqual(normalisePrefs({ order: 5, hidden: 'x' }, DEFAULT_ORDER), { order: DEFAULT_ORDER, hidden: [] })
})

test('tab prefs: unknown ids are dropped, duplicates collapse, pinned tabs cannot be hidden', () => {
  const p = normalisePrefs({ order: ['pay', 'ghost', 'pay', 'home'], hidden: ['ghost', 'home', 'more', 'money', 'money'] }, DEFAULT_ORDER)
  assert.equal(p.order.filter((x) => x === 'pay').length, 1)
  assert.ok(!p.order.includes('ghost'))
  assert.equal(p.order.length, DEFAULT_ORDER.length, 'every tab is still there')
  assert.deepEqual(p.hidden, ['money'])
})

test('tab prefs: a tab added later slots in after its default neighbour', () => {
  // An old save from before Night existed.
  const old = DEFAULT_ORDER.filter((x) => x !== 'night')
  const p = normalisePrefs({ order: old }, DEFAULT_ORDER)
  assert.equal(p.order.indexOf('night'), p.order.indexOf('claude') + 1)
  const reversed = normalisePrefs({ order: [...DEFAULT_ORDER].reverse() }, DEFAULT_ORDER)
  assert.deepEqual(reversed.order, [...DEFAULT_ORDER].reverse(), 'a complete saved order is kept exactly')
})

test('tab prefs: move, hide and show', () => {
  let p = normalisePrefs(null, DEFAULT_ORDER)
  p = moveTab(p, 'pay', 1)
  assert.deepEqual(p.order.slice(0, 3), ['home', 'week', 'pay'])
  assert.equal(moveTab(p, 'home', -1), p, 'moving past the start does nothing')
  assert.equal(moveTab(p, 'more', 1), p, 'moving past the end does nothing')
  p = toggleHidden(p, 'money')
  assert.ok(!visibleIds(p).includes('money'))
  p = toggleHidden(p, 'money')
  assert.ok(visibleIds(p).includes('money'))
  for (const id of PINNED) assert.equal(toggleHidden(p, id), p)
  assert.ok(samePrefs(p, { order: [...p.order], hidden: [] }))
})

test('tab prefs: saved inside the settings theme without losing its other keys, and read back the same', () => {
  const p = moveTab(toggleHidden(normalisePrefs(null, DEFAULT_ORDER), 'marks'), 'pay', 1)
  const theme = mergeTheme({ accent: '#FFB547', tabs: 'old' }, p)
  assert.equal(theme.accent, '#FFB547')
  assert.deepEqual(normalisePrefs(themeTabs(theme), DEFAULT_ORDER), p, 'a second device reads the same order')
  assert.deepEqual(mergeTheme(null, p).tabs, { order: p.order, hidden: p.hidden })
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
