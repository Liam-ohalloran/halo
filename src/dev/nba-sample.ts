// Dev only: sample NBA JSON (same shape as cdn.nba.com, see tests/fixtures/nba) run through the real parser,
// so the pages show exactly what the edge function would return.
import { buildResponse, type NbaResponse, type RawSchedule } from '../../supabase/functions/nba/parse'
import live from '../../tests/fixtures/nba/scoreboard-live.json'
import halftime from '../../tests/fixtures/nba/scoreboard-halftime.json'
import ot from '../../tests/fixtures/nba/scoreboard-ot.json'
import finalWin from '../../tests/fixtures/nba/scoreboard-final-win.json'
import finalLoss from '../../tests/fixtures/nba/scoreboard-final-loss.json'
import noGame from '../../tests/fixtures/nba/scoreboard-no-game.json'
import boxLive from '../../tests/fixtures/nba/boxscore-live.json'
import boxFinal from '../../tests/fixtures/nba/boxscore-final-win.json'

export const SAMPLE_KEYS = ['live', 'halftime', 'overtime', 'final-win', 'final-loss', 'next', 'none'] as const
export type SampleKey = (typeof SAMPLE_KEYS)[number]

const team = (tri: string, name: string, city: string) => ({ teamId: 1, teamName: name, teamCity: city, teamTricode: tri })
/** A schedule whose next Sixers game is `ahead` ms from now, so the countdown always has something to show. */
function scheduleAhead(ahead: number, now: Date): RawSchedule {
  const at = new Date(now.getTime() + ahead).toISOString()
  return { leagueSchedule: { gameDates: [{ gameDate: '', games: [{ gameId: 'next', gameDateTimeUTC: at, homeTeam: team('PHI', '76ers', 'Philadelphia'), awayTeam: team('CHI', 'Bulls', 'Chicago') }] }] } }
}

export function sample(key: SampleKey, now = new Date()): NbaResponse {
  const sched = scheduleAhead(26 * 3_600_000 + 14 * 60_000 + 33_000, now)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  switch (key) {
    case 'live': return buildResponse(live as any, boxLive as any, null, now)
    case 'halftime': return buildResponse(halftime as any, boxLive as any, null, now)
    case 'overtime': return buildResponse(ot as any, boxLive as any, null, now)
    case 'final-win': return buildResponse(finalWin as any, boxFinal as any, sched, now)
    case 'final-loss': return buildResponse(finalLoss as any, boxFinal as any, sched, now)
    case 'next':
    case 'none': return buildResponse(noGame as any, null, sched, now)
  }
}
