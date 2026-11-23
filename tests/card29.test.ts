import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockParts, dateLine, fmtElapsed, fmtHm, fmtHours, fmtLeft, greeting, lastSevenDays, sunCurve, sunState, sunTimes, weatherWords } from '../src/lib/base.ts'
import { CYCLE_KEYS, CYCLE_WIDTH, buildCycle, daysTo, everyMs, hrsTo, nextKey, settleKey, type CycleData } from '../src/lib/island-cycle.ts'
import { DEFAULT_UI, normaliseUi } from '../src/lib/ui-settings.ts'
import { fitSize } from '../src/lib/base-photo.ts'
import type { Settings, Shift } from '../src/types.ts'

/** A Perth (+08:00) instant. */
const perth = (y: number, mo: number, d: number, h: number, m = 0, s = 0) => new Date(Date.UTC(y, mo - 1, d, h - 8, m, s))

test('clock, date and greeting are Perth time, whatever the computer thinks', () => {
  const t = perth(2026, 11, 23, 19, 45)
  assert.deepEqual(clockParts(t), { h: '7', m: '45' })
  assert.deepEqual(clockParts(perth(2026, 11, 23, 0, 5)), { h: '12', m: '05' })
  assert.deepEqual(clockParts(perth(2026, 11, 23, 12, 0)), { h: '12', m: '00' })
  assert.equal(dateLine(t), 'Monday 23 November')
  // Just after midnight in Perth it is already the next day, even though it is still the 22nd in UTC.
  assert.equal(dateLine(new Date('2026-11-22T16:30:00Z')), 'Monday 23 November')
  assert.equal(greeting(perth(2026, 11, 23, 5)), 'Good morning, Liam')
  assert.equal(greeting(perth(2026, 11, 23, 11, 59)), 'Good morning, Liam')
  assert.equal(greeting(perth(2026, 11, 23, 12)), 'Good afternoon, Liam')
  assert.equal(greeting(perth(2026, 11, 23, 16, 59)), 'Good afternoon, Liam')
  assert.equal(greeting(perth(2026, 11, 23, 17)), 'Good evening, Liam')
})

test('sunrise and sunset are worked out for Perth, not typed in', () => {
  const dec = sunTimes(2026, 12, 21)
  assert.ok(Math.abs(dec.rise - (5 * 60 + 7)) <= 4 && Math.abs(dec.set - (19 * 60 + 22)) <= 4, 'the longest day: about 5:07 am to 7:22 pm')
  const jun = sunTimes(2026, 6, 21)
  assert.ok(Math.abs(jun.rise - (7 * 60 + 16)) <= 4 && Math.abs(jun.set - (17 * 60 + 20)) <= 4, 'the shortest day: about 7:16 am to 5:20 pm')
  const sep = sunTimes(2026, 9, 23)
  assert.ok(Math.abs(sep.set - sep.rise - 12 * 60 - 6) <= 5, 'near the equinox the day is a little over 12 hours')
  const nov = sunTimes(2026, 11, 23)
  assert.ok(nov.set > 18 * 60 + 50 && nov.set < 19 * 60 + 10)
  assert.deepEqual(fmtHm(19 * 60 + 1), { t: '7:01', ap: 'PM' })
  assert.deepEqual(fmtHm(0), { t: '12:00', ap: 'AM' })
  assert.deepEqual(fmtHm(12 * 60 + 5), { t: '12:05', ap: 'PM' })
})

test('the sun card: sunset by day, sunrise at night, and the dot sits on the arc by day only', () => {
  const day = sunState(perth(2026, 11, 23, 13, 20))
  assert.equal(day.up, true)
  assert.equal(day.next, 'Sunset')
  assert.match(day.other, /^Sunrise \d:\d\d AM$/)
  assert.ok(day.t > 0.4 && day.t < 0.6, 'around the middle of the day')
  const eve = sunState(perth(2026, 11, 23, 19, 45))
  assert.equal(eve.up, false)
  assert.equal(eve.next, 'Sunrise')
  assert.equal(eve.nextAp, 'AM')
  assert.match(eve.other, /^Sunset \d:\d\d PM$/)
  assert.equal(eve.t, 1)
  const dawn = sunState(perth(2026, 11, 23, 3, 30))
  assert.deepEqual([dawn.up, dawn.next, dawn.t], [false, 'Sunrise', 0])
  const dayY = Number(/cy="([\d.]+)"/.exec(sunCurve(day))![1])
  assert.ok(dayY < 28, 'by day the dot is above the baseline')
  assert.match(sunCurve(eve), /cy="28\.0"/, 'at night it rests on the baseline')
})

test('weather words: Clear reads as Sunny by day and Clear night after dark', () => {
  assert.equal(weatherWords('Clear', true), 'Sunny')
  assert.equal(weatherWords('Clear', false), 'Clear night')
  assert.equal(weatherWords('Showers', false), 'Showers')
})

const settings: Settings = { weekday_rate: 20, saturday_rate: 20, sunday_multiplier: 1.25, public_holiday_multiplier: 2 }
const shift = (id: string, y: number, mo: number, d: number, h1: number, h2: number, station: string | null = 'PA'): Shift => ({ id, title: 'SHIFT', station, starts_at: perth(y, mo, d, h1).toISOString(), ends_at: perth(y, mo, d, h2).toISOString(), is_public_holiday: false })

test('last 7 days of pay: the seven days up to today, oldest first, today last, only shifts that have started', () => {
  const now = perth(2026, 11, 23, 19, 45) // Monday
  const rows = [
    shift('a', 2026, 11, 17, 17, 21), // Tue, 4 h
    shift('b', 2026, 11, 21, 12, 18), // Sat, 6 h less the 30 minute break
    shift('c', 2026, 11, 23, 16, 19), // Mon, 3 h, today
    shift('d', 2026, 11, 23, 20, 22), // Mon, later tonight: not started, not counted
    shift('e', 2026, 11, 16, 9, 17), // the Monday before the window: not counted
  ]
  const w = lastSevenDays(rows, settings, now)
  assert.deepEqual(w.letters, ['T', 'W', 'T', 'F', 'S', 'S', 'M'])
  assert.equal(w.bars.length, 7)
  assert.equal(w.bars[4], 100, 'Saturday is the biggest day')
  assert.deepEqual([w.bars[1], w.bars[2], w.bars[3], w.bars[5]], [0, 0, 0, 0])
  assert.ok(w.bars[0] > 0 && w.bars[0] < 100 && w.bars[6] > 0 && w.bars[6] < 100)
  assert.equal(w.hours, 4 + 5.5 + 3)
  assert.equal(w.gross, 20 * 4 + 20 * 5.5 + 20 * 3)
  const none = lastSevenDays([], settings, now)
  assert.deepEqual([none.gross, none.hours, none.bars], [0, 0, [0, 0, 0, 0, 0, 0, 0]])
})

test('music progress text', () => {
  assert.equal(fmtElapsed(81), '1:21')
  assert.equal(fmtElapsed(-5), '0:00')
  assert.equal(fmtLeft(81, 186), '\u22121:45')
  assert.equal(fmtLeft(200, 186), '\u22120:00')
  assert.equal(fmtHours(24.8), '24.8 h')
  assert.equal(fmtHours(25), '25 h')
})

// ---- The cycle ----------------------------------------------------------------------------------------------------

const all = Object.fromEntries(CYCLE_KEYS.map((k) => [k, true])) as Record<(typeof CYCLE_KEYS)[number], boolean>
const full = (now: Date): CycleData => ({
  weather: { temp: 24, desc: 'Clear', chance: 0, hours: [] },
  battery: { present: true, percent: 74, charging: false, minutes_left: 97 },
  media: { available: true, title: 'Montagem Xonada', artist: 'ATLXS', album: '', source: 'Spotify', playing: true, position: 1, duration: 100, has_art: false },
  art: null,
  shift: { ...shift('s', 2026, 11, 24, 7, 12, 'PI'), starts_at: perth(2026, 11, 24, 7, 30).toISOString() },
  pay: { gross: 480, hours: 24.8, bars: [], letters: [] },
  test: { id: 't', subject: 'Chem', title: 'Unit test', due_at: new Date(now.getTime() + 7 * 864e5).toISOString() },
})

test('the cycle has every mode in the prototype order, with the prototype words', () => {
  const now = perth(2026, 11, 23, 19, 47)
  const items = buildCycle(full(now), now, all)
  assert.deepEqual(items.map((i) => i.key), [...CYCLE_KEYS])
  const by = Object.fromEntries(items.map((i) => [i.key, i]))
  assert.deepEqual([by.time.title, by.time.mid, by.time.right, by.time.rightIcon], ['7:47', 'Mon 23 Nov', '24\u00B0', 'moon'])
  assert.deepEqual([by.shift.title, by.shift.right], ['Shift PI \u00B7 Tue 7:30', 'in 11h 43m'])
  assert.deepEqual([by.music.title, by.music.right], ['Montagem Xonada', 'ATLXS'])
  assert.deepEqual([by.battery.title, by.battery.right], ['74%', '1h 37m left'])
  assert.deepEqual([by.pay.title, by.pay.right], ['$480', 'last 7 days'])
  assert.deepEqual([by.event.title, by.event.right], ['Chem test \u00B7 Mon', 'in 7 days'])
  for (const i of items) assert.equal(i.w, CYCLE_WIDTH[i.key], 'each mode has its own width')
  assert.equal(new Set(items.map((i) => i.colour)).size, items.length, 'and its own glow colour')
})

test('modes with nothing to show are skipped, and so are the ones switched off', () => {
  const now = perth(2026, 11, 23, 13, 0)
  assert.deepEqual(buildCycle({}, now, all).map((i) => i.key), ['time'], 'with no data at all the island still shows the time')
  const d = full(now)
  assert.deepEqual(buildCycle({ ...d, media: { ...d.media!, playing: false } }, now, all).map((i) => i.key), ['time', 'shift', 'battery', 'pay', 'event'], 'paused is not now playing')
  assert.ok(!buildCycle({ ...d, battery: { present: false, percent: null, charging: false, minutes_left: null } }, now, all).some((i) => i.key === 'battery'))
  assert.ok(!buildCycle({ ...d, pay: { gross: 0, hours: 0, bars: [], letters: [] } }, now, all).some((i) => i.key === 'pay'), 'no pay in 7 days, nothing to say')
  assert.ok(!buildCycle({ ...d, test: { ...d.test!, due_at: new Date(now.getTime() - 864e5).toISOString() } }, now, all).some((i) => i.key === 'event'), 'a test that has gone is not shown')
  assert.deepEqual(buildCycle(d, now, { ...all, time: false, music: false, pay: false }).map((i) => i.key), ['shift', 'battery', 'event'])
  assert.deepEqual(buildCycle(d, now, Object.fromEntries(CYCLE_KEYS.map((k) => [k, false])) as typeof all), [], 'all off: the cycle is off and the island rests')
})

test('time mode shows a sun by day and a moon at night, and a low battery turns red', () => {
  assert.equal(buildCycle(full(perth(2026, 11, 23, 13)), perth(2026, 11, 23, 13), all)[0].rightIcon, 'sun')
  assert.equal(buildCycle(full(perth(2026, 11, 23, 21)), perth(2026, 11, 23, 21), all)[0].rightIcon, 'moon')
  const now = perth(2026, 11, 23, 13)
  const d = full(now)
  const low = buildCycle({ ...d, battery: { present: true, percent: 12, charging: false, minutes_left: 20 } }, now, all).find((i) => i.key === 'battery')!
  assert.equal(low.colour, '#FF453A')
  const chg = buildCycle({ ...d, battery: { present: true, percent: 12, charging: true, minutes_left: null } }, now, all).find((i) => i.key === 'battery')!
  assert.equal(chg.right, 'Charging')
  assert.notEqual(chg.colour, '#FF453A')
})

test('a shift that has started says On shift, and the countdown rolls over to days', () => {
  const d: CycleData = { shift: shift('s', 2026, 11, 23, 17, 21, 'PA') }
  const mid = perth(2026, 11, 23, 18, 30)
  const it = buildCycle(d, mid, all).find((i) => i.key === 'shift')!
  assert.deepEqual([it.title, it.right], ['On shift \u00B7 PA', 'ends in 2h 30m'])
  assert.equal(hrsTo(0), 'now')
  assert.equal(hrsTo(50 * 3_600_000), '2d 2h')
  assert.deepEqual([daysTo(mid, mid), daysTo(mid, perth(2026, 11, 24, 9)), daysTo(mid, perth(2026, 11, 30, 9))], ['today', 'tomorrow', 'in 7 days'])
})

test('the cycle moves on one mode at a time and carries on when a mode goes away', () => {
  const k = (...ks: (typeof CYCLE_KEYS)[number][]) => ks.map((key) => ({ key }))
  assert.equal(nextKey([], 'time'), null)
  assert.equal(nextKey(k('time'), 'time'), 'time', 'one mode cycles to itself')
  assert.equal(nextKey(k('time', 'shift', 'pay'), null), 'time')
  assert.equal(nextKey(k('time', 'shift', 'pay'), 'shift'), 'pay')
  assert.equal(nextKey(k('time', 'shift', 'pay'), 'pay'), 'time', 'and round again')
  // Music stopped while it was showing: the next one in the fixed order takes over instead of jumping back to the start.
  assert.equal(settleKey(k('time', 'shift', 'pay'), 'music'), 'pay')
  assert.equal(settleKey(k('time', 'shift'), 'event'), 'time')
  assert.equal(settleKey(k('time', 'shift'), 'shift'), 'shift', 'a mode that is still there stays')
  assert.equal(settleKey([], 'shift'), null)
})

test('the interval is 4, 6 or 10 seconds', () => {
  assert.deepEqual([4, 6, 10].map(everyMs), [4000, 6000, 10000])
  assert.deepEqual([5, 0, '6', null, undefined].map(everyMs), [6000, 6000, 6000, 6000, 6000])
})

// ---- Settings and the photo ---------------------------------------------------------------------------------------

test('settings: the cycle starts with every mode on, every 6 seconds, and the clock behind the mountains', () => {
  assert.ok(CYCLE_KEYS.every((k) => DEFAULT_UI.cycle[k]))
  assert.equal(DEFAULT_UI.cycleEvery, 6)
  assert.equal(DEFAULT_UI.clockBehind, true)
  const s = normaliseUi({ cycle: { pay: false, time: 'no' }, cycleEvery: 10, clockBehind: false })
  assert.equal(s.cycle.pay, false)
  assert.equal(s.cycle.time, true, 'a value that is not a boolean is ignored')
  assert.equal(s.cycleEvery, 10)
  assert.equal(s.clockBehind, false)
  assert.equal(normaliseUi({ cycleEvery: 7 }).cycleEvery, 6, 'only 4, 6 and 10 are allowed')
  assert.deepEqual(normaliseUi({ glow: 60 }).cycle, DEFAULT_UI.cycle, 'a row saved before card 29 gets the defaults')
})

test('a picked photo is scaled down to 1400 px wide and keeps its shape', () => {
  assert.deepEqual(fitSize(2576, 1718), { w: 1400, h: 934 })
  assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 }, 'a small photo is left alone')
  assert.deepEqual(fitSize(4000, 100), { w: 1400, h: 35 })
})
