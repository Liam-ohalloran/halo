// Edge function `nba` (card 09). Fetches ESPN's public NBA JSON server side (no CORS for browsers, and
// cdn.nba.com blocks automated requests with a 403) and returns only the Sixers game, cached for 20 seconds.
// No secrets are used here. Deploy:  supabase functions deploy nba --project-ref brqrszaljxeduelpuyty

import { buildResponse, type NbaResponse, type RawBoxscore, type RawScoreboard, type RawSchedule } from './parse.ts'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const SCOREBOARD = `${BASE}/scoreboard`
const boxscoreUrl = (id: string) => `${BASE}/summary?event=${id}`
const SCHEDULE = `${BASE}/teams/phi/schedule`

const CACHE_MS = 20_000
const SCHEDULE_MS = 6 * 60 * 60 * 1000

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; Halo)' } })
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return (await res.json()) as T
}

let cache: { at: number; body: NbaResponse } | null = null
let schedule: { at: number; data: RawSchedule } | null = null

async function loadSchedule(now: number): Promise<RawSchedule | null> {
  if (schedule && now - schedule.at < SCHEDULE_MS) return schedule.data
  try {
    const data = await getJson<RawSchedule>(SCHEDULE)
    schedule = { at: now, data }
    return data
  } catch {
    return schedule?.data ?? null
  }
}

async function load(): Promise<NbaResponse> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS) return cache.body
  const sb = await getJson<RawScoreboard>(SCOREBOARD)
  const first = buildResponse(sb, null, null, new Date(now))
  let box: RawBoxscore | null = null
  if (first.game && first.game.status !== 'scheduled') {
    // Maxey's line is nice to have. If the boxscore is not up yet the game still shows.
    box = await getJson<RawBoxscore>(boxscoreUrl(first.game.id)).catch(() => null)
  }
  const sched = first.game?.status === 'live' ? null : await loadSchedule(now)
  const body = buildResponse(sb, box, sched, new Date(now))
  cache = { at: now, body }
  return body
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const headers = { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=20' }
  try {
    return new Response(JSON.stringify(await load()), { headers })
  } catch (e) {
    // Serve the last good answer rather than an error if the NBA hiccups.
    if (cache) return new Response(JSON.stringify(cache.body), { headers })
    console.error('nba fetch failed', e)
    return new Response(JSON.stringify({ error: 'nba_unavailable' }), { status: 502, headers })
  }
})
