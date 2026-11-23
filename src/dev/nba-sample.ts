// Dev only: sample JSON (ESPN's shape, see tests/fixtures/nba) run through the real parser,
// so the pages show exactly what the edge function would return.
import { buildResponse, type NbaResponse } from '../../supabase/functions/nba/parse'
import { richBox, scheduleAhead } from './nba-rich'
import live from '../../tests/fixtures/nba/scoreboard-live.json'
import halftime from '../../tests/fixtures/nba/scoreboard-halftime.json'
import ot from '../../tests/fixtures/nba/scoreboard-ot.json'
import finalWin from '../../tests/fixtures/nba/scoreboard-final-win.json'
import finalLoss from '../../tests/fixtures/nba/scoreboard-final-loss.json'
import noGame from '../../tests/fixtures/nba/scoreboard-no-game.json'

export const SAMPLE_KEYS = ['live', 'halftime', 'overtime', 'final-win', 'final-loss', 'next', 'none'] as const
export type SampleKey = (typeof SAMPLE_KEYS)[number]

export function sample(key: SampleKey, now = new Date()): NbaResponse {
  const sched = scheduleAhead(26 * 3_600_000 + 14 * 60_000 + 33_000, now)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  switch (key) {
    case 'live': return buildResponse(live as any, richBox('NYK') as any, sched, now)
    case 'halftime': return buildResponse(halftime as any, richBox('NYK') as any, sched, now)
    case 'overtime': return buildResponse(ot as any, richBox('NYK') as any, sched, now)
    case 'final-win': return buildResponse(finalWin as any, richBox('NYK') as any, sched, now)
    case 'final-loss': return buildResponse(finalLoss as any, richBox('NYK') as any, sched, now)
    case 'next':
    case 'none': return buildResponse(noGame as any, null, sched, now)
  }
}
