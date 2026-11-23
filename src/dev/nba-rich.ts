// Dev only: a fuller sample than the fixtures have (card 24): eight Sixers and six of the other team with steals, and five finished
// games for the Form view. In ESPN's shape, so it runs through the real parser.
import type { RawBoxscore, RawSchedule } from '../../supabase/functions/nba/parse.ts'

const team = (abbreviation: string, name: string) => ({ abbreviation, name, shortDisplayName: name })
const comp = (homeAway: 'home' | 'away', t: ReturnType<typeof team>) => ({ homeAway, team: t })
/** A schedule whose next Sixers game is `ahead` ms from now, so the countdown always has something to show. */
export function scheduleAhead(ahead: number, now: Date): RawSchedule {
  const date = new Date(now.getTime() + ahead).toISOString()
  // Five finished games behind it (newest first in the data does not matter, the parser sorts), for the Form view.
  const past: [string, string, 'home' | 'away', number, number][] = [['NYK', 'Knicks', 'home', 112, 104], ['MIA', 'Heat', 'away', 98, 101], ['BOS', 'Celtics', 'home', 121, 116], ['ORL', 'Magic', 'away', 107, 99], ['CLE', 'Cavaliers', 'home', 103, 110]]
  const done = past.map(([tri, name, ha, a, b], i) => ({ id: `p${i}`, date: new Date(now.getTime() - (i + 1) * 2 * 86_400_000).toISOString(), competitions: [{ status: { type: { completed: true, state: 'post' } }, competitors: [{ ...comp(ha, team('PHI', '76ers')), score: String(a) }, { ...comp(ha === 'home' ? 'away' : 'home', team(tri, name)), score: String(b) }] }] }))
  return { events: [...done, { id: 'next', date, competitions: [{ competitors: [comp('home', team('PHI', '76ers')), comp('away', team('CHI', 'Bulls'))] }] }] } as RawSchedule
}

type Row = [string, string, number, number, number, number, number, number, [number, number], [number, number], [number, number]]
const SIX: Row[] = [['1', 'Tyrese Maxey', 36, 31, 4, 9, 1, 0, [11, 21], [4, 9], [5, 5]], ['2', 'Joel Embiid', 33, 26, 11, 5, 1, 2, [9, 17], [1, 3], [7, 8]], ['3', 'VJ Edgecombe', 34, 24, 6, 4, 2, 1, [9, 15], [3, 6], [3, 4]], ['4', 'Kelly Oubre Jr.', 28, 14, 5, 2, 1, 0, [5, 11], [2, 5], [2, 2]], ['5', 'Kyle Lowry', 22, 9, 3, 7, 0, 0, [3, 7], [2, 4], [1, 1]], ['6', 'Quentin Grimes', 19, 8, 2, 1, 1, 0, [3, 8], [2, 5], [0, 0]], ['7', 'Paul George', 24, 7, 4, 3, 0, 1, [3, 9], [1, 4], [0, 0]], ['8', 'Andre Drummond', 14, 2, 7, 0, 0, 1, [1, 3], [0, 0], [0, 2]]]
const OPP: Row[] = [['11', 'Jalen Brunson', 37, 29, 3, 8, 1, 0, [10, 22], [3, 8], [6, 7]], ['12', 'Karl-Anthony Towns', 34, 18, 12, 3, 0, 1, [7, 14], [2, 6], [2, 2]], ['13', 'Mikal Bridges', 35, 17, 4, 4, 1, 0, [6, 13], [3, 7], [2, 2]], ['14', 'OG Anunoby', 33, 11, 5, 2, 2, 1, [4, 10], [2, 6], [1, 2]], ['15', 'Josh Hart', 30, 9, 9, 6, 1, 0, [4, 8], [1, 2], [0, 0]], ['16', 'Mitchell Robinson', 20, 6, 8, 0, 1, 2, [3, 4], [0, 0], [0, 3]]]
const rich = (tri: string, rows: Row[]) => ({ team: { abbreviation: tri }, statistics: [{ labels: ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK'], athletes: rows.map((r) => ({ athlete: { id: r[0], displayName: r[1] }, stats: [String(r[2]), String(r[3]), r[8].join('-'), r[9].join('-'), r[10].join('-'), String(r[4]), String(r[5]), String(r[7]), String(r[6]), '0'] })) }] })
/** A fuller box score than the fixtures have: eight Sixers and six of the other team, with steals. */
export const richBox = (opp: string): RawBoxscore => ({ boxscore: { players: [rich('PHI', SIX), rich(opp, OPP)] } })

