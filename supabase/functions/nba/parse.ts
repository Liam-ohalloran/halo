// Pure parsing for the `nba` edge function (card 09). No Deno or browser APIs in here, so the same
// file runs in the edge function, in the dev page with sample JSON, and in `npm test`.
//
// Source: ESPN's public JSON (no key). cdn.nba.com answers 403 to automated requests, so it is not used.
//   scoreboard  https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard
//   boxscore    https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=<id>
//   schedule    https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/phi/schedule

export const SIXERS = 'PHI'
/** Tyrese Maxey's ESPN athlete id. */
export const MAXEY_ID = '4431678'

export type GameStatus = 'scheduled' | 'live' | 'final'
/** `none` means no Sixers game on today's scoreboard. `next` still says when the following one is. */
export type FeedState = GameStatus | 'none'

export interface TeamLine { tri: string; name: string; score: number; record: string }
export interface SixersGame {
  id: string
  status: GameStatus
  /** Plain words, e.g. "Q4 3:12", "Halftime", "Final", "Final/OT". */
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
/** One player's line from the box score (card 24). Shooting is [made, attempted]. */
export interface PlayerLine {
  id: string
  name: string
  min: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  to: number
  fg: [number, number]
  tp: [number, number]
  ft: [number, number]
}
export interface TeamBox { tri: string; players: PlayerLine[] }
/** One finished game from the Sixers' schedule, for the Form view. */
export interface FormGame { startsAt: string; opponent: { tri: string; name: string }; home: boolean; sixers: number; opponentScore: number; won: boolean }
export interface NbaResponse {
  state: FeedState
  game: SixersGame | null
  maxey: MaxeyLine | null
  next: NextGame | null
  fetchedAt: string
  /** Both teams' players, for a live or final game (card 24). Absent from an older deploy of this function. */
  box?: TeamBox[]
  /** The last five finished games, newest first (card 24). */
  form?: FormGame[]
}

// ---- Raw shapes, only the fields we read -------------------------------------------------------

interface RawTeam { abbreviation: string; shortDisplayName?: string; name?: string; displayName?: string }
interface RawCompetitor { homeAway: 'home' | 'away'; score?: string; records?: { type?: string; summary?: string }[]; team: RawTeam }
export interface RawEvent {
  id: string
  date: string
  status: { displayClock?: string; period?: number; type: { state: 'pre' | 'in' | 'post'; detail?: string } }
  competitions: { competitors: RawCompetitor[] }[]
}
export interface RawScoreboard { events: RawEvent[] }
export interface RawBoxscore {
  boxscore?: { players?: { team?: { abbreviation?: string }; statistics?: { labels?: string[]; athletes?: { athlete: { id: string; displayName?: string; shortName?: string }; stats?: string[] }[] }[] }[] }
}
export interface RawScheduleCompetitor extends Omit<RawCompetitor, 'score'> { score?: string | { value?: number; displayValue?: string }; winner?: boolean }
export interface RawSchedule { events: { id: string; date: string; competitions: { competitors: RawScheduleCompetitor[]; status?: { type?: { completed?: boolean; state?: string } } }[] }[] }

// ---- Helpers -----------------------------------------------------------------------------------

/** ESPN abbreviations that differ from the NBA's own three letter codes. */
const TRI: Record<string, string> = { NY: 'NYK', SA: 'SAS', GS: 'GSW', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' }
export const nbaTri = (espn: string): string => TRI[espn] ?? espn

/** ESPN's display clock: "3:12" stays, "45.3" (under a minute) becomes "0:45", "0.0" and "" become "". */
export function parseClock(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  const m = /^(\d+):(\d{2})(?:\.\d+)?$/.exec(s)
  if (m) return `${Number(m[1])}:${m[2]}`
  const sec = /^(\d+)(?:\.\d+)?$/.exec(s)
  if (sec && Number(sec[1]) > 0) return `0:${String(Number(sec[1])).padStart(2, '0')}`
  return ''
}

/** 1 to 4 are quarters, then OT, 2OT and so on. */
export function periodLabel(period: number): string {
  if (period <= 0) return ''
  if (period <= 4) return `Q${period}`
  const ot = period - 4
  return ot === 1 ? 'OT' : `${ot}OT`
}

const statusOf = (state: string): GameStatus => (state === 'in' ? 'live' : state === 'post' ? 'final' : 'scheduled')
const iso = (d: string): string => { const t = Date.parse(d); return Number.isNaN(t) ? d : new Date(t).toISOString() }

function line(c: RawCompetitor): TeamLine {
  const rec = c.records?.find((r) => r.type === 'total') ?? c.records?.[0]
  return {
    tri: nbaTri(c.team.abbreviation),
    name: c.team.shortDisplayName ?? c.team.name ?? c.team.displayName ?? c.team.abbreviation,
    score: Number(c.score ?? 0) || 0,
    record: rec?.summary ?? '',
  }
}

const hasSixers = (cs: RawCompetitor[]) => cs.some((c) => nbaTri(c.team.abbreviation) === SIXERS)

/** The Sixers game on a scoreboard, or null. */
export function findSixersGame(sb: RawScoreboard | null | undefined): SixersGame | null {
  const ev = sb?.events?.find((e) => hasSixers(e.competitions?.[0]?.competitors ?? []))
  if (!ev) return null
  const cs = ev.competitions[0].competitors
  const mine = cs.find((c) => nbaTri(c.team.abbreviation) === SIXERS)!
  const other = cs.find((c) => c !== mine)
  if (!other) return null
  const status = statusOf(ev.status.type.state)
  const period = ev.status.period ?? 0
  const clock = status === 'live' ? parseClock(ev.status.displayClock) : ''
  return {
    id: ev.id,
    status,
    statusText: status === 'live' && clock ? `${periodLabel(period)} ${clock}` : (ev.status.type.detail ?? '').trim(),
    period,
    clock,
    startsAt: iso(ev.date),
    sixers: line(mine),
    opponent: line(other),
    home: mine.homeAway === 'home',
  }
}

/** Maxey's points, rebounds and assists from a boxscore, or null if he has not played or is not listed. */
export function maxeyFromBox(box: RawBoxscore | null | undefined): MaxeyLine | null {
  for (const team of box?.boxscore?.players ?? []) {
    for (const group of team.statistics ?? []) {
      const a = group.athletes?.find((x) => x.athlete.id === MAXEY_ID)
      if (!a?.stats?.length) continue
      const at = (label: string) => Number(a.stats![group.labels?.indexOf(label) ?? -1] ?? 0) || 0
      return { points: at('PTS'), rebounds: at('REB'), assists: at('AST') }
    }
  }
  return null
}

const pair = (v: string | undefined): [number, number] => {
  const m = /^(\d+)-(\d+)$/.exec((v ?? '').trim())
  return m ? [Number(m[1]), Number(m[2])] : [0, 0]
}
const mins = (v: string | undefined): number => Number.parseInt((v ?? '0').split(':')[0], 10) || 0

/** Both teams' players. Anyone with no stats (did not play) is left out. Labels are read by name, so a missing column is just zero. */
export function boxPlayers(box: RawBoxscore | null | undefined): TeamBox[] {
  const out: TeamBox[] = []
  for (const team of box?.boxscore?.players ?? []) {
    const players: PlayerLine[] = []
    for (const group of team.statistics ?? []) {
      const L = group.labels ?? []
      for (const a of group.athletes ?? []) {
        if (!a.stats?.length) continue
        const at = (label: string): string | undefined => a.stats![L.indexOf(label)]
        const n = (label: string) => Number(at(label) ?? 0) || 0
        players.push({ id: a.athlete.id, name: a.athlete.displayName ?? a.athlete.shortName ?? 'Player', min: mins(at('MIN')), pts: n('PTS'), reb: n('REB'), ast: n('AST'), stl: n('STL'), blk: n('BLK'), to: n('TO'), fg: pair(at('FG')), tp: pair(at('3PT')), ft: pair(at('FT')) })
      }
    }
    if (players.length) out.push({ tri: nbaTri(team.team?.abbreviation ?? ''), players })
  }
  return out
}

const scoreOf = (c: RawScheduleCompetitor | undefined): number => {
  const s = c?.score
  return Number(typeof s === 'object' && s ? (s.value ?? s.displayValue) : s) || 0
}

/** The last `n` finished Sixers games, newest first. A game counts as finished when the schedule says so. */
export function formFromSchedule(schedule: RawSchedule | null | undefined, n = 5): FormGame[] {
  const done: FormGame[] = []
  for (const ev of schedule?.events ?? []) {
    const comp = ev.competitions?.[0]
    const cs = comp?.competitors ?? []
    const mine = cs.find((c) => nbaTri(c.team.abbreviation) === SIXERS)
    const other = cs.find((c) => c !== mine)
    if (!mine || !other || !(comp?.status?.type?.completed || comp?.status?.type?.state === 'post')) continue
    const a = scoreOf(mine), b = scoreOf(other)
    const o = line({ ...other, score: String(b) } as RawCompetitor)
    done.push({ startsAt: iso(ev.date), opponent: { tri: o.tri, name: o.name }, home: mine.homeAway === 'home', sixers: a, opponentScore: b, won: mine.winner ?? a > b })
  }
  return done.sort((x, y) => Date.parse(y.startsAt) - Date.parse(x.startsAt)).slice(0, n)
}

/** The next Sixers game that starts after `now`, from the Sixers team schedule. */
export function nextGame(schedule: RawSchedule | null | undefined, now: Date): NextGame | null {
  let best: NextGame | null = null
  for (const ev of schedule?.events ?? []) {
    const cs = ev.competitions?.[0]?.competitors ?? []
    const mine = cs.find((c) => nbaTri(c.team.abbreviation) === SIXERS)
    const other = cs.find((c) => c !== mine)
    const at = Date.parse(ev.date)
    if (!mine || !other || !(at > now.getTime())) continue
    if (!best || at < Date.parse(best.startsAt)) {
      const o = line(other as RawCompetitor)
      best = { startsAt: iso(ev.date), opponent: { tri: o.tri, name: o.name }, home: mine.homeAway === 'home' }
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
    box: showMaxey ? boxPlayers(box) : [],
    form: formFromSchedule(schedule),
  }
}
