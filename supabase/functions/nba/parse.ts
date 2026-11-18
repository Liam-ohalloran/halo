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
export interface NbaResponse {
  state: FeedState
  game: SixersGame | null
  maxey: MaxeyLine | null
  next: NextGame | null
  fetchedAt: string
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
  boxscore?: { players?: { statistics?: { labels?: string[]; athletes?: { athlete: { id: string }; stats?: string[] }[] }[] }[] }
}
export interface RawSchedule { events: { id: string; date: string; competitions: { competitors: RawCompetitor[] }[] }[] }

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
      const o = line(other)
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
  }
}
