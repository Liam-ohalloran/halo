// Run with: npm test. Parses sample NBA JSON (same shape as cdn.nba.com, see tests/fixtures/nba).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildResponse, findSixersGame, maxeyFromBox, nextGame, parseClock, periodLabel } from '../supabase/functions/nba/parse.ts'

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/nba/${name}.json`, import.meta.url), 'utf8'))
// Wed 18 Nov 2026, 9:00 pm Perth.
const NOW = new Date('2026-11-18T13:00:00Z')

test('parseClock', () => {
  assert.equal(parseClock('PT03M12.00S'), '3:12')
  assert.equal(parseClock('PT11M59.90S'), '11:59')
  assert.equal(parseClock('PT00M45.30S'), '0:45')
  assert.equal(parseClock('PT00M00.00S'), '')
  assert.equal(parseClock(''), '')
  assert.equal(parseClock(undefined), '')
})

test('periodLabel', () => {
  assert.deepEqual([1, 4, 5, 6, 0].map(periodLabel), ['Q1', 'Q4', 'OT', '2OT', ''])
})

test('live game: Sixers on the left, Q4 3:12, Maxey line', () => {
  const r = buildResponse(fx('scoreboard-live'), fx('boxscore-live'), null, NOW)
  assert.equal(r.state, 'live')
  assert.equal(r.game?.statusText, 'Q4 3:12')
  assert.equal(r.game?.home, true)
  assert.equal(`${r.game?.sixers.tri} ${r.game?.sixers.score}`, 'PHI 98')
  assert.equal(`${r.game?.opponent.score} ${r.game?.opponent.tri}`, '94 BOS')
  assert.deepEqual(r.maxey, { points: 28, rebounds: 5, assists: 7 })
  assert.equal(r.next, null)
})

test('away game: the Sixers still come first', () => {
  const sb = fx('scoreboard-live')
  const g = sb.scoreboard.games[1]
  ;[g.homeTeam, g.awayTeam] = [g.awayTeam, g.homeTeam]
  const game = findSixersGame(sb)
  assert.equal(game?.home, false)
  assert.equal(game?.sixers.tri, 'PHI')
  assert.equal(game?.sixers.score, 98)
})

test('halftime and overtime read plainly', () => {
  assert.equal(findSixersGame(fx('scoreboard-halftime'))?.statusText, 'Halftime')
  const ot = findSixersGame(fx('scoreboard-ot'))
  assert.equal(ot?.statusText, 'OT 1:05')
  assert.equal(ot?.period, 5)
})

test('final: Maxey line and the next game', () => {
  const r = buildResponse(fx('scoreboard-final-win'), fx('boxscore-final-win'), fx('schedule'), NOW)
  assert.equal(r.state, 'final')
  assert.equal(r.game?.statusText, 'Final')
  assert.ok(r.game!.sixers.score > r.game!.opponent.score)
  assert.deepEqual(r.maxey, { points: 34, rebounds: 4, assists: 9 })
  assert.equal(r.next?.opponent.tri, 'CHI')
})

test('today scheduled game becomes the next game, no Maxey line', () => {
  const r = buildResponse(fx('scoreboard-today-scheduled'), null, fx('schedule'), NOW)
  assert.equal(r.state, 'scheduled')
  assert.equal(r.maxey, null)
  assert.equal(r.next?.startsAt, '2026-11-19T00:30:00Z')
  assert.equal(r.next?.opponent.tri, 'BOS')
  assert.equal(r.next?.home, true)
})

test('no game today: state none, next game from the schedule', () => {
  const r = buildResponse(fx('scoreboard-no-game'), null, fx('schedule'), NOW)
  assert.equal(r.state, 'none')
  assert.equal(r.game, null)
  assert.equal(r.next?.opponent.tri, 'CHI')
  assert.equal(r.next?.startsAt, '2026-11-21T00:30:00Z')
})

test('nextGame skips past games, picks the earliest Sixers game, away games read as away', () => {
  assert.equal(nextGame(fx('schedule'), NOW)?.opponent.tri, 'CHI')
  const later = nextGame(fx('schedule'), new Date('2026-11-21T02:00:00Z'))
  assert.equal(later?.opponent.tri, 'MIA')
  assert.equal(later?.home, false)
  assert.equal(nextGame(fx('schedule'), new Date('2027-01-01T00:00:00Z')), null)
})

test('missing or odd data does not throw', () => {
  assert.equal(findSixersGame(null), null)
  assert.equal(maxeyFromBox(null), null)
  assert.equal(maxeyFromBox({ game: { homeTeam: { players: [] }, awayTeam: { players: [] } } }), null)
  const r = buildResponse(null, null, null, NOW)
  assert.equal(r.state, 'none')
  assert.equal(r.next, null)
})
