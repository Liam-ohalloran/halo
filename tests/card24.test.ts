import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { boxPlayers, buildResponse, formFromSchedule } from '../supabase/functions/nba/parse.ts'
import { richBox, scheduleAhead } from '../src/dev/nba-rich.ts'
import { barSplit, compareRows, formSummary, leaders, leftWins, pct, shortName, sortPlayers, teamTotals } from '../src/lib/sixers-box.ts'
import { fmtTime, fraction, livePosition, musicView, wavePath } from '../src/lib/music.ts'
import { batteryText, powerIndex, tileState } from '../src/lib/controls.ts'
import { appColour, litBars, mixerApps } from '../src/lib/audio.ts'
import { APP_SLOTS, moveItem, normaliseItems, pickable, safeSite, search, siteGroups, tileColours, validateItem, type LaunchItem } from '../src/lib/launch.ts'
import { FALLBACK, accentsFromPixels } from '../src/lib/palette.ts'

const NOW = new Date('2026-11-21T07:48:00Z')
const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/nba/${n}.json`, import.meta.url), 'utf8'))
/** The same sample the dev pages use, built here without the JSON imports Node can't do. */
const sample = (key: 'final-win' | 'next', now = NOW) => {
  const sched = scheduleAhead(26 * 3_600_000, now)
  return key === 'next' ? buildResponse(fx('scoreboard-no-game'), null, sched, now) : buildResponse(fx('scoreboard-final-win'), richBox(fx('scoreboard-final-win')) as never, sched, now)
}

// ---- Sixers: one game, every view
test('sixers: the box score is for the same two teams as the scoreboard, in every sample game', () => {
  for (const name of ['scoreboard-live', 'scoreboard-halftime', 'scoreboard-ot', 'scoreboard-final-win', 'scoreboard-final-loss']) {
    const sb = fx(name)
    const r = buildResponse(sb, richBox(sb) as never, scheduleAhead(3_600_000, NOW), NOW)
    assert.ok(r.game, name)
    assert.deepEqual(r.box!.map((t) => t.tri).sort(), [r.game!.sixers.tri, r.game!.opponent.tri].sort(), `${name}: box teams match the scoreboard`)
  }
})

test('sixers: a box score from a different game is dropped, never mixed in', () => {
  const sb = fx('scoreboard-final-win')
  const other = { boxscore: { players: [{ team: { abbreviation: 'PHI' }, statistics: [{ labels: ['MIN', 'PTS'], athletes: [{ athlete: { id: '1', displayName: 'A' }, stats: ['30', '10'] }] }] }, { team: { abbreviation: 'ZZZ' }, statistics: [{ labels: ['MIN', 'PTS'], athletes: [{ athlete: { id: '2', displayName: 'B' }, stats: ['30', '10'] }] }] }] } }
  assert.deepEqual(buildResponse(sb, other as never, null, NOW).box, [])
})

// ---- Sixers: parsing and the four views
test('sixers: a live or final game carries both teams box scores and the last five results', () => {
  const r = sample('final-win', NOW)
  assert.equal(r.box?.length, 2)
  assert.equal(r.box![0].tri, 'PHI')
  assert.equal(r.box![0].players.length, 8)
  assert.deepEqual(r.box![0].players[0].fg, [11, 21])
  assert.equal(r.form?.length, 5)
  assert.ok(Date.parse(r.form![0].startsAt) > Date.parse(r.form![1].startsAt), 'newest first')
  assert.equal(sample('next', NOW).box?.length, 0, 'no box score before the game')
})

test('sixers: players with no stats are left out, a missing column is zero, bad shooting text is 0-0', () => {
  const raw = { boxscore: { players: [{ team: { abbreviation: 'PHI' }, statistics: [{ labels: ['MIN', 'PTS', 'FG'], athletes: [{ athlete: { id: '1', displayName: 'A' }, stats: ['30', '12', 'x'] }, { athlete: { id: '2', displayName: 'B' }, stats: [] }] }] }] } }
  const b = boxPlayers(raw)
  assert.equal(b[0].players.length, 1)
  assert.deepEqual([b[0].players[0].pts, b[0].players[0].reb, b[0].players[0].fg], [12, 0, [0, 0]])
  assert.deepEqual(boxPlayers(null), [])
})

test('sixers: form reads finished games only, takes the winner flag or the score, and keeps the last five', () => {
  const ev = (id: string, date: string, mine: string, theirs: string, done: boolean, winner?: boolean) => ({ id, date, competitions: [{ status: { type: { completed: done } }, competitors: [{ homeAway: 'home' as const, score: mine, winner, team: { abbreviation: 'PHI', name: '76ers' } }, { homeAway: 'away' as const, score: { displayValue: theirs }, team: { abbreviation: 'NY', name: 'Knicks' } }] }] })
  const f = formFromSchedule({ events: [ev('a', '2026-11-01T00:00Z', '100', '90', true), ev('b', '2026-11-03T00:00Z', '90', '100', true), ev('c', '2026-11-05T00:00Z', '0', '0', false), ev('d', '2026-11-07T00:00Z', '99', '98', true, false)] } as never)
  assert.deepEqual(f.map((g) => g.won), [false, false, true], 'the winner flag beats the score, and the unplayed game is skipped')
  assert.equal(f[0].opponent.tri, 'NYK')
  assert.equal(formFromSchedule(null).length, 0)
})

test('sixers: sorting is biggest first, flips on a second press, and ties keep their order', () => {
  const p = sample('final-win', NOW).box![0].players
  assert.deepEqual(sortPlayers(p, 'pts').slice(0, 2).map((x) => x.pts), [31, 26])
  assert.equal(sortPlayers(p, 'pts', 'asc')[0].pts, 2)
  assert.equal(sortPlayers(p, 'min')[0].name, 'Tyrese Maxey')
  assert.equal(sortPlayers(p, 'fg')[0].fg[0], 11)
  assert.deepEqual(sortPlayers([], 'pts'), [])
})

test('sixers: leaders, team totals, comparison rows and bars', () => {
  const [a, b] = sample('final-win', NOW).box!
  assert.deepEqual(leaders(a).map((l) => [l.stat, l.player.name, l.value]), [['PTS', 'Tyrese Maxey', 31], ['REB', 'Joel Embiid', 11], ['AST', 'Tyrese Maxey', 9]])
  assert.deepEqual(leaders(undefined), [])
  const t = teamTotals(a)
  assert.equal(t.pts, 31 + 26 + 24 + 14 + 9 + 8 + 7 + 2)
  assert.equal(t.fgPct, pct(11 + 9 + 9 + 5 + 3 + 3 + 3 + 1, 21 + 17 + 15 + 11 + 7 + 8 + 9 + 3))
  const rows = compareRows(t, teamTotals(b))
  assert.equal(rows.length, 6)
  assert.equal(leftWins({ label: 'TO', a: 3, b: 5, suffix: '', lowerBetter: true }), true, 'fewer turnovers is better')
  assert.equal(leftWins({ label: 'REB', a: 5, b: 5, suffix: '' }), null)
  assert.equal(barSplit(30, 10), 75)
  assert.equal(barSplit(0, 0), 50)
  assert.equal(pct(0, 0), 0)
  assert.equal(shortName('Tyrese Maxey'), 'T. Maxey')
  assert.equal(shortName('Karl-Anthony Towns'), 'K. Towns')
  assert.equal(shortName('Nene'), 'Nene')
})

test('sixers: form summary gives the dots, the record and the streak', () => {
  const s = formSummary(sample('final-win', NOW).form!)
  assert.deepEqual(s.dots, ['W', 'L', 'W', 'W', 'L'])
  assert.equal(s.record, '3-2')
  assert.equal(s.streak, 'W1')
  assert.deepEqual(formSummary([]), { dots: [], record: '0-0', streak: '' })
})

// ---- Music
test('music: clock text, fractions and the live position', () => {
  assert.equal(fmtTime(187), '3:07')
  assert.equal(fmtTime(-5), '0:00')
  assert.equal(fmtTime(NaN), '0:00')
  assert.equal(fraction(50, 200), 0.25)
  assert.equal(fraction(300, 200), 1)
  assert.equal(fraction(10, 0), 0, 'a stream with no length has no progress')
  assert.equal(livePosition(10, 200, true, 2500), 12.5)
  assert.equal(livePosition(10, 200, false, 2500), 10, 'paused does not move')
  assert.equal(livePosition(199, 200, true, 5000), 200, 'never past the end')
})

test('music: the wave ripples up to the playhead and is flat when paused', () => {
  const playing = wavePath(0.5, true)
  const paused = wavePath(0.5, false)
  assert.notEqual(playing, paused)
  assert.ok(!/L\d+ (?!9\.00)/.test(paused.replace('M0 9', '')), 'every point of a paused wave sits on the middle line')
  assert.ok(playing.startsWith('M0 9'))
})

test('music: the tab is off without the helper, idle with nothing playing, and a song otherwise', () => {
  assert.deepEqual(musicView(null), { kind: 'off' })
  const base = { available: true, title: 'T', artist: 'A', album: 'B', source: 'Spotify', playing: true, position: 1, duration: 100, has_art: true }
  assert.deepEqual(musicView({ ...base, available: false }), { kind: 'idle' })
  assert.deepEqual(musicView({ ...base, title: '' }), { kind: 'idle' })
  const v = musicView({ ...base, source: '' })
  assert.equal(v.kind === 'song' && v.source, 'Music')
})

test('palette: two bright, different accent colours from a cover, and a fallback when there is nothing colourful', () => {
  const px: number[] = []
  const fill = (r: number, g: number, b: number, n: number) => { for (let i = 0; i < n; i++) px.push(r, g, b, 255) }
  fill(220, 30, 90, 60) // pink
  fill(30, 90, 220, 30) // blue
  fill(10, 10, 10, 200) // near black is ignored
  fill(250, 250, 250, 100) // near white is ignored
  const [a, b] = accentsFromPixels(px)
  assert.match(a, /^#[0-9a-f]{6}$/)
  assert.notEqual(a, b)
  assert.ok(parseInt(a.slice(1, 3), 16) > parseInt(a.slice(5, 7), 16), 'the biggest colour is the pink one (more red than blue)')
  const grey: number[] = []
  for (let i = 0; i < 100; i++) grey.push(120, 120, 120, 255)
  assert.deepEqual(accentsFromPixels(grey), FALLBACK)
  assert.deepEqual(accentsFromPixels([]), FALLBACK)
})

// ---- Controls and Audio
test('controls: tile wording, disabled looks, battery text', () => {
  assert.deepEqual(tileState('focus', null), { on: false, text: 'Not available yet', disabled: true })
  assert.deepEqual(tileState('wifi', { on: true, detail: 'Home' }), { on: true, text: 'Home', disabled: false })
  assert.equal(tileState('bt', { on: false }).text, 'Off')
  assert.equal(tileState('wifi', null).disabled, true, 'helper off: dimmed')
  assert.deepEqual(tileState('night', { on: true }), { on: true, text: 'On, read only', disabled: true })
  assert.equal(tileState('mute', { on: true }).text, 'Silenced')
  assert.deepEqual(batteryText({ present: true, percent: 74, charging: false, minutes_left: 97 }), { value: '74%', cells: 7, sub: '1h 37m left' })
  assert.equal(batteryText({ present: true, percent: 80, charging: true, minutes_left: null }).sub, 'Charging')
  assert.equal(batteryText({ present: false, percent: null, charging: false, minutes_left: null }).sub, 'No battery')
  assert.equal(batteryText(null).sub, 'Helper off')
  assert.deepEqual([powerIndex('battery'), powerIndex('performance'), powerIndex(null)], [0, 2, -1])
})

test('audio: the mixer shows the four apps Liam uses first, hides system helpers, and keeps colours steady', () => {
  const app = (id: string, level: number) => ({ id, name: id, level, muted: false })
  const m = mixerApps([app('chrome', 55), app('shellexperiencehost', 90), app('discord', 35), app('zoom', 99), app('spotify', 80), app('teams', 60), app('vlc', 10)])
  assert.deepEqual(m.shown.map((a) => a.id), ['spotify', 'chrome', 'discord', 'teams'])
  assert.equal(m.more, 2, 'zoom and vlc are the extra ones')
  assert.equal(appColour('Spotify'), '#1ED760')
  assert.equal(appColour('zoom'), appColour('zoom'))
  assert.deepEqual(mixerApps([]), { shown: [], more: 0 })
  assert.equal(litBars(0), 0)
  assert.equal(litBars(1), 18)
  assert.ok(litBars(0.2) > 4 && litBars(0.2) < 18, 'a quiet voice still lights some bars')
  assert.equal(litBars(-3), 0)
})

// ---- Launch
const item = (id: string, kind: 'app' | 'site', name: string, target: string, grp = '', sort = 0): LaunchItem => ({ id, kind, name, target, grp, sort })
test('launch: a new item is checked and cleaned, with a plain sentence when it is wrong', () => {
  assert.deepEqual(validateItem({ kind: 'site', name: ' GitHub ', target: 'github.com', grp: 'Build' }), { ok: true, item: { kind: 'site', name: 'GitHub', target: 'https://github.com', grp: 'Build' } })
  assert.equal(safeSite('javascript:alert(1)'), null)
  assert.equal(safeSite('file:///C:/x'), null)
  assert.equal(safeSite('http://a.test/x y'), null)
  assert.equal(validateItem({ kind: 'site', name: '', target: 'x.com' }).ok, false)
  assert.deepEqual(validateItem({ kind: 'site', name: 'X', target: 'nope' }), { ok: false, error: 'That does not look like a web address.' })
  assert.deepEqual(validateItem({ kind: 'app', name: 'Spotify', target: 'Spotify.lnk' }), { ok: true, item: { kind: 'app', name: 'Spotify', target: 'Spotify.lnk', grp: '' } })
  assert.equal(validateItem({ kind: 'app', name: 'X', target: ' ' }).ok, false)
  assert.equal(validateItem({ kind: 'folder', name: 'X', target: 'C:/' }).ok, false)
  const long = validateItem({ kind: 'app', name: 'x'.repeat(60), target: 'a.lnk' })
  assert.equal(long.ok && long.item.name.length, 24)
})

test('launch: rows from the database are cleaned and put in order', () => {
  const rows = normaliseItems([{ id: 'b', kind: 'app', name: 'B', target: 'b.lnk', sort: 2 }, { id: 'a', kind: 'site', name: 'A', target: 'https://a.test', grp: 'Work', sort: 1 }, { id: 'x', kind: 'folder', name: 'X', target: 'y' }, null, { id: 5 }])
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b'])
  assert.deepEqual(normaliseItems('nonsense'), [])
})

test('launch: search by name (and a site by its address), groups in School, Work, Build order, ungrouped last', () => {
  const all = [item('1', 'app', 'Spotify', 's.lnk'), item('2', 'site', 'GitHub', 'https://github.com', 'Build'), item('3', 'site', 'SEQTA', 'https://seqta.test', 'School'), item('4', 'site', 'Misc', 'https://m.test'), item('5', 'site', 'myJob', 'https://j.test', 'Work'), item('6', 'site', 'Zed', 'https://z.test', 'Zebra')]
  assert.deepEqual(search(all, 'spot').map((i) => i.id), ['1'])
  assert.deepEqual(search(all, 'GITHUB.com').map((i) => i.id), ['2'])
  assert.equal(search(all, '  ').length, all.length)
  assert.deepEqual(siteGroups(all).map((g) => g.name), ['School', 'Work', 'Build', 'Zebra', ''])
})

test('launch: dragging an app moves it among apps only and renumbers everything', () => {
  const all = [item('a', 'app', 'A', 'a', '', 0), item('s', 'site', 'S', 'https://s.test', '', 1), item('b', 'app', 'B', 'b', '', 2), item('c', 'app', 'C', 'c', '', 3)]
  const moved = moveItem(all, 'c', 0)
  assert.deepEqual(moved.filter((i) => i.kind === 'app').map((i) => i.id), ['c', 'a', 'b'])
  assert.equal(moved.find((i) => i.id === 's')!.kind, 'site')
  assert.deepEqual(moved.map((i) => i.sort).sort(), [0, 1, 2, 3])
  assert.equal(moveItem(all, 'a', 0), all, 'dropping it where it is changes nothing')
  assert.equal(moveItem(all, 'nope', 0), all)
  assert.deepEqual(moveItem(all, 'a', 99).filter((i) => i.kind === 'app').map((i) => i.id), ['b', 'c', 'a'])
})

test('launch: tile colours are steady, the picker skips apps already added, and 13 apps fit', () => {
  assert.deepEqual(tileColours('Spotify'), tileColours('spotify'))
  const apps = [{ id: 'Spotify.lnk', name: 'Spotify' }, { id: 'Chrome.lnk', name: 'Chrome' }, { id: 'Canva.lnk', name: 'Canva' }]
  const have = [item('1', 'app', 'Spotify', 'spotify.lnk')]
  assert.deepEqual(pickable(apps, have, '').map((a) => a.name), ['Chrome', 'Canva'])
  assert.deepEqual(pickable(apps, have, 'ca').map((a) => a.name), ['Canva'])
  assert.equal(pickable(apps, [], '', 2).length, 2)
  assert.equal(APP_SLOTS, 13)
})
