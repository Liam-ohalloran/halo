// Card 24: the Sixers tab's views (Box, Leaders, Team, Form). Pure, so the sorting and the sums can be tested.

import type { FormGame, PlayerLine, TeamBox } from '../../supabase/functions/nba/parse'

export type SortKey = 'min' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'to' | 'fg'
export const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'min', label: 'MIN' }, { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'fg', label: 'FG' },
]

/** Shooting as a whole number percent, 0 when nothing was attempted. */
export const pct = (m: number, a: number): number => (a > 0 ? Math.round((m / a) * 100) : 0)

const value = (p: PlayerLine, k: SortKey): number => (k === 'fg' ? p.fg[0] : p[k])

/** Biggest first. Ties keep the order they came in (the coach's, which is minutes). Pressing the same header again flips it. */
export function sortPlayers(players: PlayerLine[], key: SortKey, dir: 'desc' | 'asc' = 'desc'): PlayerLine[] {
  const sign = dir === 'desc' ? -1 : 1
  return players.map((p, i) => ({ p, i })).sort((a, b) => sign * (value(a.p, key) - value(b.p, key)) || a.i - b.i).map((x) => x.p)
}

/** "T. Maxey" from "Tyrese Maxey". One word names are kept. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  return parts.length < 2 ? full.trim() : `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

export interface Leader { stat: 'PTS' | 'REB' | 'AST'; player: PlayerLine; value: number }

/** The best scorer, rebounder and passer of a team. Nobody leads a stat they have none of. */
export function leaders(team: TeamBox | undefined): Leader[] {
  if (!team) return []
  const out: Leader[] = []
  for (const [stat, key] of [['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast']] as const) {
    const top = sortPlayers(team.players, key)[0]
    if (top && top[key] > 0) out.push({ stat, player: top, value: top[key] })
  }
  return out
}

export interface TeamTotals { pts: number; reb: number; ast: number; stl: number; blk: number; to: number; fgPct: number; tpPct: number; ftPct: number }
export function teamTotals(team: TeamBox | undefined): TeamTotals {
  const sum = (f: (p: PlayerLine) => number) => (team?.players ?? []).reduce((n, p) => n + f(p), 0)
  return {
    pts: sum((p) => p.pts), reb: sum((p) => p.reb), ast: sum((p) => p.ast), stl: sum((p) => p.stl), blk: sum((p) => p.blk), to: sum((p) => p.to),
    fgPct: pct(sum((p) => p.fg[0]), sum((p) => p.fg[1])), tpPct: pct(sum((p) => p.tp[0]), sum((p) => p.tp[1])), ftPct: pct(sum((p) => p.ft[0]), sum((p) => p.ft[1])),
  }
}

export interface CompareRow { label: string; a: number; b: number; suffix: string; /** For turnovers, less is better. */ lowerBetter?: boolean }
/** The rows of the Team view, the Sixers on the left. */
export function compareRows(a: TeamTotals, b: TeamTotals): CompareRow[] {
  return [
    { label: 'FG%', a: a.fgPct, b: b.fgPct, suffix: '%' }, { label: '3P%', a: a.tpPct, b: b.tpPct, suffix: '%' }, { label: 'FT%', a: a.ftPct, b: b.ftPct, suffix: '%' },
    { label: 'REB', a: a.reb, b: b.reb, suffix: '' }, { label: 'AST', a: a.ast, b: b.ast, suffix: '' }, { label: 'TO', a: a.to, b: b.to, suffix: '', lowerBetter: true },
  ]
}
/** How much of a comparison bar the left side fills, 0 to 100. Equal sides split it evenly. */
export const barSplit = (a: number, b: number): number => (a + b > 0 ? Math.round((a / (a + b)) * 100) : 50)
export const leftWins = (r: CompareRow): boolean | null => (r.a === r.b ? null : r.lowerBetter ? r.a < r.b : r.a > r.b)

/** "W 121 to 116" style summary of the last games: the run of W and L, and the record. */
export function formSummary(games: FormGame[]): { dots: ('W' | 'L')[]; record: string; streak: string } {
  const dots = games.map((g) => (g.won ? 'W' : 'L') as 'W' | 'L')
  const w = dots.filter((d) => d === 'W').length
  let n = 0
  while (n < dots.length && dots[n] === dots[0]) n++
  return { dots, record: `${w}-${dots.length - w}`, streak: dots.length ? `${dots[0]}${n}` : '' }
}
