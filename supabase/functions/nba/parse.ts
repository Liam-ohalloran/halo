// Pure parsing for the `nba` edge function (card 09). No Deno or browser APIs in here, so the same
// file runs in the edge function, in the dev page with recorded sample JSON, and in `npm test`.
//
// Sources (public, no key, but they send no CORS headers, which is why this runs server side):
//   scoreboard  https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json
//   boxscore    https://cdn.nba.com/static/json/liveData/boxscore/boxscore_<gameId>.json
//   schedule    https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json

export const SIXERS = 'PHI'
export const MAXEY_ID = 1630178

export type GameStatus = 'scheduled' | 'live' | 'final'
/** `none` means no Sixers game on today's scoreboard. `next` still says when the following one is. */
export type FeedState = GameStatus | 'none'

export interface TeamLine { tri: string; name: string; score: number; record: string }
export interface SixersGame {
  id: string
  status: GameStatus
  /** The NBA's own words, e.g. "Q4 3:12", "Halftime", "Final", "Final/OT". */
  statusText: string
  period: number
  /** "3:12", or "" when no clock is running. */
  clock: string
  startsAt: string
  sixers: TeamLine
  opponent: TeamLine
  /** True when the Sixers are the home team. */
  home: boolean
}
export interface MaxeyLine { points: number; rebounds: number; assists: number }
export interface NextGame { startsAt: string; opponent: { tri: string; name: string }; home: boolean }
export interface NbaResponse {
  state: FeedState
  game: SixersGame | null
  maxey: MaxeyLine | null
  next: NextGame | null
  fetchedAt: string
}

// ---- Raw shapes, only the fields we read -------------------------------------------------------

interface RawTeam { teamTricode: string; teamName: string; teamCity?: string; wins?: number; losses?: number; score?: number }
export interface RawGame {
  gameId: string
  gameStatus: number
  gameStatusText: string
  period: number
  gameClock: string
  gameTimeUTC: string
  homeTeam: RawTeam
  awayTeam: RawTeam
}
export interface RawScoreboard { scoreboard: { games: RawGame[] } }
interface RawPlayer { personId: number; statistics: { points?: number; reboundsTotal?: number; assists?: number } }
export interface RawBoxscore { game: { homeTeam: { players: RawPlayer[] }; awayTeam: { players: RawPlayer[] } } }
interface RawScheduleGame { gameId: string; gameDateTimeUTC: string; homeTeam: RawTeam; awayTeam: RawTeam }
export interface RawSchedule { leagueSchedule: { gameDates: { gameDate: string; games: RawScheduleGame[] }[] } }

// ---- Helpers -----------------------------------------------------------------------------------

/** "PT03M12.00S" becomes "3:12". Under a minute stays as seconds, "0:45". Empty when there is no clock. */
export function parseClock(raw: string | null | undefined): string {
  const m = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(raw ?? '')
  if (!m) return ''
  const min = Number(m[1] ?? 0)
  const sec = Math.floor(Number(m[2] ?? 0))
  if (min === 0 && sec === 0) return ''
  return `${min}:${String(sec).padStart(2, '0')}`
}

/** 1 to 4 are quarters, then OT, 2OT and so on. */
export function periodLabel(period: number): string {
  if (period <= 0) return ''
  if (period <= 4) return `Q${period}`
  const ot = period - 4
  return ot === 1 ? 'OT' : `${ot}OT`
}

const statusOf = (n: number): GameStatus => (n === 2 ? 'live' : n === 3 ? 'final' : 'scheduled')

function line(t: RawTeam): TeamLine {
  return { tri: t.teamTricode, name: t.teamName, score: t.score ?? 0, record: `${t.wins ?? 0}-${t.losses ?? 0}` }
}

/** The Sixers game on a scoreboard, or null. */
export function findSixersGame(sb: RawScoreboard | null | undefined): SixersGame | null {
  const g = sb?.scoreboard?.games?.find((x) => x.homeTeam.teamTricode === SIXERS || x.awayTeam.teamTricode === SIXERS)
  if (!g) return null
  const home = g.homeTeam.teamTricode === SIXERS
  const status = statusOf(g.gameStatus)
  const clock = status === 'live' ? parseClock(g.gameClock) : ''
  return {
    id: g.gameId,
    status,
    statusText: status === 'live' && clock ? `${periodLabel(g.period)} ${clock}` : g.gameStatusText.trim(),
    period: g.period,
    clock,
    startsAt: g.gameTimeUTC,
    sixers: line(home ? g.homeTeam : g.awayTeam),
    opponent: line(home ? g.awayTeam : g.homeTeam),
    home,
  }
}

/** Maxey's points, rebounds and assists from a boxscore, or null if he has not played or is not listed. */
export function maxeyFromBox(box: RawBoxscore | null | undefined): MaxeyLine | null {
  const players = [...(box?.game?.homeTeam?.players ?? []), ...(box?.game?.awayTeam?.players ?? [])]
  const p = players.find((x) => x.personId === MAXEY_ID)
  if (!p) return null
  return { points: p.statistics.points ?? 0, rebounds: p.statistics.reboundsTotal ?? 0, assists: p.statistics.assists ?? 0 }
}

/** The next Sixers game that starts after `now`, from the league schedule. */
export function nextGame(schedule: RawSchedule | null | undefined, now: Date): NextGame | null {
  let best: NextGame | null = null
  for (const d of schedule?.leagueSchedule?.gameDates ?? []) {
    for (const g of d.games) {
      const home = g.homeTeam.teamTricode === SIXERS
      if (!home && g.awayTeam.teamTricode !== SIXERS) continue
      const at = Date.parse(g.gameDateTimeUTC)
      if (!(at > now.getTime())) continue
      if (!best || at < Date.parse(best.startsAt)) {
        const opp = home ? g.awayTeam : g.homeTeam
        best = { startsAt: g.gameDateTimeUTC, opponent: { tri: opp.teamTricode, name: opp.teamName }, home }
      }
    }
  }
  return best
}

/** Put it together. Boxscore is only used for a live or final game. */
export function buildResponse(
  sb: RawScoreboard | null,
  box: RawBoxscore | null,
  schedule: RawSchedule | null,
  now: Date,
): NbaResponse {
  const game = findSixersGame(sb)
  const showMaxey = game && game.status !== 'scheduled'
  const next = game?.status === 'live' ? null : nextGame(schedule, now)
  // A scheduled game today is its own "next game", so the schedule lookup would only repeat it.
  const upcoming: NextGame | null =
    game?.status === 'scheduled' ? { startsAt: game.startsAt, opponent: { tri: game.opponent.tri, name: game.opponent.name }, home: game.home } : next
  return {
    state: game ? game.status : 'none',
    game,
    maxey: showMaxey ? maxeyFromBox(box) : null,
    next: upcoming,
    fetchedAt: now.toISOString(),
  }
}
