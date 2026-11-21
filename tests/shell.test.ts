import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RAIL, TAB_IDS, TAB_THEMES, RAIL_ICONS, parseTab } from '../src/styles/tabs.ts'
import { dayLabel, rangeLabel, tabMeta, weekStart } from '../src/lib/shell-meta.ts'

test('rail order is Home, Music, Study, Pay, Sixers, Week, divider, More, Controls (with Money and Marks)', () => {
  assert.deepEqual(RAIL, ['home', 'music', 'study', 'pay', 'sixers', 'week', 'money', 'alerts', 'marks', null, 'more', 'controls'])
})

test('every tab has a full theme and an icon', () => {
  for (const id of TAB_IDS) {
    const t = TAB_THEMES[id]
    assert.equal(t.id, id)
    assert.match(t.colour, /^#[0-9A-F]{6}$/i)
    assert.ok(t.label && t.bg && t.border && t.glow, `${id} has label, bg, border and glow`)
    assert.ok(RAIL_ICONS[id].length > 10)
  }
})

test('tab colours come from the shared rules', () => {
  // Home, Study and Pay follow the approved prototype (card 16).
  assert.equal(TAB_THEMES.home.colour, '#FFC23D')
  assert.equal(TAB_THEMES.study.colour, '#9fb0ff')
  assert.equal(TAB_THEMES.pay.colour, '#5CFF7A')
  assert.equal(TAB_THEMES.sixers.colour, '#88B5E0')
  assert.equal(TAB_THEMES.controls.colour, '#D99FB3')
})

test('the old Now id still resolves to Home', () => {
  assert.equal(parseTab('now'), 'home')
  assert.equal(parseTab('pay'), 'pay')
  assert.equal(parseTab('nope'), null)
  assert.equal(parseTab(null), null)
})

// 2026-11-21 12:00 in Perth is 04:00 UTC. The Perth day is what counts, not the device clock.
const sat = new Date('2026-11-21T04:00:00Z')
test('header lines are Perth dates', () => {
  assert.equal(dayLabel(sat), 'Sat 21 Nov')
  assert.equal(tabMeta('home', sat), 'Sat 21 Nov')
  assert.equal(tabMeta('pay', sat), '16 to 22 Nov')
  assert.equal(tabMeta('study', sat), 'Week of 16 Nov')
  assert.equal(tabMeta('week', sat), '21 to 27 Nov')
  assert.equal(tabMeta('music', sat), '')
})
test('Perth midnight rolls the day before UTC does', () => {
  assert.equal(dayLabel(new Date('2026-11-20T16:30:00Z')), 'Sat 21 Nov') // 00:30 Saturday in Perth
  assert.equal(dayLabel(new Date('2026-11-20T15:30:00Z')), 'Fri 20 Nov')
})
test('Sunday belongs to the week that started on Monday', () => {
  assert.equal(tabMeta('pay', new Date('2026-11-22T10:00:00Z')), '16 to 22 Nov')
  assert.equal(tabMeta('pay', new Date('2026-11-22T16:30:00Z')), '23 to 29 Nov') // Monday 00:30 in Perth
})
test('ranges that cross a month name both', () => {
  assert.equal(rangeLabel(weekStart(new Date('2026-12-02T04:00:00Z')), 7), '30 Nov to 6 Dec')
})
