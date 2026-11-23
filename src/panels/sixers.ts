import '../styles/tokens.css'
import '../styles/proto.css'
import './sixers.css'
import { pvRoot, type PvRoot } from '../ui/charts'
import { SIXERS_BLUE, countdown, perthWhen, sixersWon, teamColour, type NbaResponse } from '../lib/sixers'
import { periodLabel, type PlayerLine, type TeamBox } from '../../supabase/functions/nba/parse'
import { SORT_KEYS, barSplit, compareRows, formSummary, leaders, leftWins, pct, shortName, sortPlayers, teamTotals, type SortKey } from '../lib/sixers-box'

// Sixers tab (card 24), black island family. The scoreboard on the left (live score and clock, the final, or the next game with a
// countdown), and four views on the right: Box (a sortable box score, press a row for the player card), Leaders, Team and Form.
// Times are Perth time. It is fed by the same `nba` edge function as the island pill, so there is only one poll.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
type ViewKey = 'box' | 'lead' | 'cmp' | 'form'
const VIEWS: [ViewKey, string][] = [['box', 'Box'], ['lead', 'Leaders'], ['cmp', 'Team'], ['form', 'Form']]

const TEMPLATE = `<div class="sxG">
  <div class="blk sxScore pop" style="--i:0" data-k="score"></div>
  <div class="blk sxViews pop" style="--i:1">
    <div class="sxTabs" role="tablist" aria-label="Sixers views">${VIEWS.map(([k, n]) => `<button type="button" role="tab" data-v="${k}" aria-selected="${k === 'box'}">${n}</button>`).join('')}</div>
    <div class="sxBody" data-k="body" role="tabpanel"></div>
  </div>
</div>
<div class="sxState" data-k="state" role="status" hidden><b data-k="st"></b><span data-k="ss"></span><button type="button" data-k="retry" hidden>Try again</button></div>`

export interface SixersPanelHandle extends PvRoot {
  update(r: NbaResponse): void
  loading(): void
  error(offline: boolean): void
  destroy(): void
}

export function SixersPanel(o: { onRetry: () => void }): SixersPanelHandle {
  const root = pvRoot('sixers-pv is-loading') as SixersPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Sixers')
  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!
  const shown: Record<string, string> = {}
  const html = (k: string, v: string) => { if (shown[k] !== v) { shown[k] = v; $(k).innerHTML = v } }
  let data: NbaResponse | null = null
  let view: ViewKey = 'box'
  let team = 0 // 0 the Sixers, 1 the opponent
  let sort: SortKey = 'pts'
  let dir: 'desc' | 'asc' = 'desc'
  let player: string | null = null
  let tick = 0
  let nextAt = ''

  const boxes = (): { mine: TeamBox | undefined; theirs: TeamBox | undefined } => {
    const b = data?.box ?? []
    return { mine: b.find((t) => t.tri === 'PHI'), theirs: b.find((t) => t.tri !== 'PHI') }
  }

  // ---- Scoreboard
  function paintScore() {
    const r = data
    if (!r) return
    const g = r.game
    if (g && g.status !== 'scheduled') {
      const live = g.status === 'live'
      const lc = teamColour(g.sixers.tri), rc = teamColour(g.opponent.tri)
      const status = live ? (g.clock ? `${periodLabel(g.period)} ${g.clock}` : g.statusText) : 'Final'
      const result = live ? '' : sixersWon(r) ? 'Sixers win' : 'Sixers lose'
      const nx = r.next && !live ? `<div class="sxNext">Next: ${r.next.home ? 'vs' : 'at'} ${esc(r.next.opponent.tri)}, ${esc(perthWhen(r.next.startsAt))}</div>` : ''
      html('score', `<span class="caps ${live ? 'live' : ''}">${live ? '<i class="dot"></i>' : ''}${esc(status)}</span>
        <div class="sxPair"><div style="color:${lc}"><b class="num">${g.sixers.score}</b><small>${esc(g.sixers.tri)} · ${esc(g.sixers.record)}</small></div><div style="color:${rc}"><b class="num">${g.opponent.score}</b><small>${esc(g.opponent.tri)} · ${esc(g.opponent.record)}</small></div></div>
        ${result ? `<div class="sxRes ${sixersWon(r) ? 'win' : ''}">${result}</div>` : ''}${nx}`)
      nextAt = ''
    } else if (r.next) {
      nextAt = r.next.startsAt
      html('score', `<span class="caps">Next game</span><div class="sxOpp">${r.next.home ? 'vs' : 'at'} ${esc(r.next.opponent.name)}</div><div class="sxWhen">${esc(perthWhen(r.next.startsAt))}</div><div class="sxCd num" data-k="cd">${countdown(nextAt)}</div><small class="sxCdl">to tip off</small>`)
    } else {
      nextAt = ''
      html('score', '<span class="caps">Sixers</span><div class="sxOpp">No game coming up</div><div class="sxWhen">The schedule shows the next one when it is out.</div>')
    }
  }

  // ---- Views
  const stat = (n: number, l: string) => `<div><b class="num">${n}</b><small>${l}</small></div>`
  const bar = (l: string, m: number, a: number, c: string) => `<div class="hb"><div class="l"><span>${l} ${m}/${a}</span><b>${pct(m, a)}%</b></div><div class="tk"><i style="width:${pct(m, a)}%;background:${c}"></i></div></div>`
  function playerCard(p: PlayerLine, tri: string): string {
    return `<div class="sxPc"><button type="button" class="sxBk" data-back>‹ Box</button><h3>${esc(p.name)}</h3><span class="caps">${esc(tri)} · ${p.min} min · ${p.stl} stl · ${p.blk} blk · ${p.to} to</span>
      <div class="trip">${stat(p.pts, 'PTS')}${stat(p.reb, 'REB')}${stat(p.ast, 'AST')}</div>
      ${bar('FG', p.fg[0], p.fg[1], '#2f86ff')}${bar('3P', p.tp[0], p.tp[1], '#FFC23D')}${bar('FT', p.ft[0], p.ft[1], '#5CFF7A')}</div>`
  }
  function boxView(): string {
    const { mine, theirs } = boxes()
    const t = team === 0 ? mine : theirs
    if (!t) return '<p class="sxNone">The box score shows up once the game starts.</p>'
    if (player) { const p = t.players.find((x) => x.id === player); if (p) return playerCard(p, t.tri) }
    const rows = sortPlayers(t.players, sort, dir).slice(0, 5)
    const more = t.players.length - rows.length
    const colour = teamColour(t.tri)
    return `<div class="sxTm">${[mine, theirs].map((x, i) => x ? `<button type="button" data-team="${i}" class="${i === team ? 'on' : ''}">${esc(x.tri)}</button>` : '').join('')}<span class="hint">Tap a heading to sort, a row for the player</span></div>
      <table class="sxTbl"><thead><tr><th class="nm">PLAYER</th>${SORT_KEYS.map((k) => `<th><button type="button" data-sort="${k.key}" class="${k.key === sort ? 'on' : ''}" aria-label="Sort by ${k.label}">${k.label}${k.key === sort ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.map((p) => `<tr data-p="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} player card"><td class="nm" style="--c:${colour}">${esc(shortName(p.name))}</td><td class="num">${p.min}</td><td class="num">${p.pts}</td><td class="num">${p.reb}</td><td class="num">${p.ast}</td><td class="num">${p.fg[0]}-${p.fg[1]}</td></tr>`).join('')}</tbody></table>${more > 0 ? `<div class="sxMore">+${more} more</div>` : ''}`
  }
  function leadView(): string {
    const { mine, theirs } = boxes()
    if (!mine && !theirs) return '<p class="sxNone">Leaders show up once the game starts.</p>'
    const col = (t: TeamBox | undefined) => !t ? '' : `<div class="sxLc"><span class="caps" style="color:${teamColour(t.tri)}">${esc(t.tri)}</span>${leaders(t).map((l) => `<div class="sxLd"><small>${l.stat}</small><b class="num">${l.value}</b><span>${esc(shortName(l.player.name))}</span></div>`).join('') || '<p class="sxNone">Nobody yet.</p>'}</div>`
    return `<div class="sxLeads">${col(mine)}${col(theirs)}</div>`
  }
  function cmpView(): string {
    const { mine, theirs } = boxes()
    if (!mine || !theirs) return '<p class="sxNone">Team numbers show up once the game starts.</p>'
    const g = data?.game
    const lc = teamColour(mine.tri), rc = teamColour(theirs.tri)
    const rows = compareRows(teamTotals(mine), teamTotals(theirs))
    return `<div class="sxCmpH"><b style="color:${lc}">${esc(g?.sixers.tri ?? 'PHI')}</b><b style="color:${rc}">${esc(g?.opponent.tri ?? theirs.tri)}</b></div>` + rows.map((r) => {
      const w = leftWins(r)
      return `<div class="sxCmp"><span>${r.label}</span><b class="num ${w === true ? 'win' : ''}">${r.a}${r.suffix}</b><div class="tk"><i style="width:${barSplit(r.a, r.b)}%;background:${lc}"></i><u style="background:${rc}"></u></div><b class="num ${w === false ? 'win' : ''}">${r.b}${r.suffix}</b></div>`
    }).join('')
  }
  function formView(): string {
    const games = data?.form ?? []
    if (!games.length) return '<p class="sxNone">Recent games show up here once the season gets going.</p>'
    const s = formSummary(games)
    return `<div class="sxFormH"><div class="dots">${s.dots.map((d) => `<i class="${d === 'W' ? 'w' : 'l'}">${d}</i>`).join('')}</div><b class="num">${s.record}</b><small>${s.streak ? `Streak ${s.streak}` : ''}</small></div>` +
      games.map((g) => `<div class="sxFg"><i class="${g.won ? 'w' : 'l'}">${g.won ? 'W' : 'L'}</i><span>${g.home ? 'vs' : 'at'} ${esc(g.opponent.tri)}</span><b class="num">${g.sixers}-${g.opponentScore}</b><small>${esc(perthWhen(g.startsAt).split(',')[0])}</small></div>`).join('')
  }
  function paintBody() {
    html('body', view === 'box' ? boxView() : view === 'lead' ? leadView() : view === 'cmp' ? cmpView() : formView())
    root.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === view)))
  }

  // ---- Input. Pressing something only repaints the body.
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const v = t.closest<HTMLElement>('[data-v]'); if (v) { view = v.dataset.v as ViewKey; player = null; return paintBody() }
    const tm = t.closest<HTMLElement>('[data-team]'); if (tm) { team = Number(tm.dataset.team); player = null; return paintBody() }
    const so = t.closest<HTMLElement>('[data-sort]'); if (so) { const k = so.dataset.sort as SortKey; dir = k === sort && dir === 'desc' ? 'asc' : 'desc'; sort = k; return paintBody() }
    if (t.closest('[data-back]')) { player = null; return paintBody() }
    const row = t.closest<HTMLElement>('tr[data-p]'); if (row) { player = row.dataset.p!; return paintBody() }
    if (t.closest('[data-k="retry"]')) o.onRetry()
  })
  root.addEventListener('keydown', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('tr[data-p]')
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); player = row.dataset.p!; paintBody() }
  })

  function setState(title: string, sub: string, retry: boolean) {
    $('state').hidden = false
    root.querySelector<HTMLElement>('.sxG')!.hidden = true
    $('st').textContent = title; $('ss').textContent = sub
    $('retry').hidden = !retry
  }
  function clearState() { $('state').hidden = true; root.querySelector<HTMLElement>('.sxG')!.hidden = false }

  root.update = (r) => {
    data = r
    root.classList.remove('is-loading')
    clearState()
    paintScore()
    paintBody()
    window.clearInterval(tick)
    if (nextAt) tick = window.setInterval(() => { const cd = root.querySelector<HTMLElement>('[data-k="cd"]'); if (cd && !document.hidden) cd.textContent = countdown(nextAt) }, 1000)
  }
  root.loading = () => { if (!data) setState('Loading the game…', '', false) }
  root.error = (offline) => { window.clearInterval(tick); setState(offline ? "You're offline" : "Scores aren't loading", offline ? 'Showing the Sixers again once you are back online.' : 'Try again in a moment.', !offline) }
  root.destroy = () => window.clearInterval(tick)
  void SIXERS_BLUE
  return root
}
