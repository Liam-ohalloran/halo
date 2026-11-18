import { h } from './dom'
import { NumberRoll, type NumberRollHandle } from './NumberRoll'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { reduced } from '../lib/motion'
import { SIXERS_BLUE, countdown, createFeed, perthWhen, sixersWon, teamColour, type Feed, type NbaResponse } from '../lib/sixers'
import { periodLabel } from '../../supabase/functions/nba/parse'
import type { IslandHandle } from './Island'

// Card 09: the Sixers on the island.
//  - SixersPill: the compact wide pill. Sixers score on the left, opponent score on the right, both in
//    team colours, with a tiny quarter and clock in the middle and a pulsing live dot.
//  - SixersCard: the expanded card. Score, quarter, Maxey's line. Next game countdown when there's no game.
//  - Confetti: 1.5 s canvas burst when a Sixers win goes final. Skipped under Reduce motion.
//  - mountSixers: feeds an Island from the edge function.

const OPEN_H = 156 // expanded content height that makes the island the specified 200 px (22 + 156 + 22)

// ---- Pill --------------------------------------------------------------------------------------

export interface PillHandle { nodes: Node[]; update(r: NbaResponse): void }

export function SixersPill(r: NbaResponse): PillHandle {
  const left = NumberRoll({ value: '0' })
  const right = NumberRoll({ value: '0' })
  const clock = NumberRoll({ value: '0:00' })
  const dot = h('i', { class: 'sx-dot', 'aria-hidden': 'true' })
  const lbl = h('span', {}, '')
  const mid = h('span', { class: 'sx-mid' }, dot, lbl, clock)
  const lt = h('span', { class: 'sx-tri' }, 'PHI')
  const rt = h('span', { class: 'sx-tri' }, '')
  const l = h('span', { class: 'sx-pn' }, lt, left)
  const rr = h('span', { class: 'sx-pn' }, right, rt)
  const nodes: Node[] = [l, mid, rr]

  function update(x: NbaResponse) {
    const g = x.game
    if (!g) return
    const live = g.status === 'live'
    l.style.color = teamColour(g.sixers.tri)
    rr.style.color = teamColour(g.opponent.tri)
    lt.textContent = g.sixers.tri
    rt.textContent = g.opponent.tri
    left.set(String(g.sixers.score))
    right.set(String(g.opponent.score))
    dot.hidden = !live
    mid.classList.toggle('live', live)
    const hasClock = live && !!g.clock
    lbl.textContent = hasClock ? periodLabel(g.period) : g.statusText
    clock.hidden = !hasClock
    if (hasClock) clock.set(g.clock)
    l.setAttribute('aria-label', `${g.sixers.name} ${g.sixers.score}`)
    rr.setAttribute('aria-label', `${g.opponent.name} ${g.opponent.score}`)
    mid.setAttribute('aria-label', live ? `Live, ${g.statusText}` : g.statusText)
  }
  update(r)
  return { nodes, update }
}

// ---- Card --------------------------------------------------------------------------------------

type View = 'loading' | 'error' | 'game' | 'next' | 'empty'

export interface CardHandle {
  el: HTMLElement
  update(r: NbaResponse): void
  loading(): void
  error(offline: boolean): void
  /** Height of the content in px, for sizing the island. */
  height(): number
  destroy(): void
}

function stat(label: string, roll: NumberRollHandle) {
  return h('div', { class: 'sx-stat' }, roll, h('small', {}, label))
}

export function SixersCard(o: { onRetry: () => void }): CardHandle {
  const el = h('div', { class: 'sx', style: `min-height:${OPEN_H}px` })
  let view: View | null = null
  let tick = 0

  // -- Game view, built once so digits roll when the numbers change
  const lTri = h('div', { class: 'sx-t' }, 'PHI')
  const lRec = h('div', { class: 'sx-r' }, '')
  const lScore = NumberRoll({ value: '0' })
  const rTri = h('div', { class: 'sx-t' }, '')
  const rRec = h('div', { class: 'sx-r' }, '')
  const rScore = NumberRoll({ value: '0' })
  const lSide = h('div', { class: 'sx-side' }, h('div', { class: 'sx-id' }, lTri, lRec), h('div', { class: 'sx-big' }, lScore))
  const rSide = h('div', { class: 'sx-side r' }, h('div', { class: 'sx-big' }, rScore), h('div', { class: 'sx-id' }, rTri, rRec))
  const dot = h('i', { class: 'sx-dot', 'aria-hidden': 'true' })
  const qtr = h('span', { class: 'sx-q' }, '')
  const clk = NumberRoll({ value: '0:00' })
  const status = h('div', { class: 'sx-status' }, h('div', { class: 'sx-qrow' }, dot, qtr), h('div', { class: 'sx-clk' }, clk))
  const result = h('div', { class: 'sx-result' }, '')
  const centre = h('div', { class: 'sx-centre' }, status, result)
  const pts = NumberRoll({ value: '0' }); const reb = NumberRoll({ value: '0' }); const ast = NumberRoll({ value: '0' })
  const maxey = h('div', { class: 'sx-inset' },
    h('div', { class: 'sx-name' }, h('span', { class: 'full' }, 'Tyrese '), 'Maxey'),
    h('div', { class: 'sx-stats' }, stat('PTS', pts), stat('REB', reb), stat('AST', ast)))
  const maxeyNote = h('div', { class: 'sx-inset sx-note' }, 'Maxey stats show up once the game starts.')
  const foot = h('div', { class: 'sx-foot' }, '')
  const game = h('div', { class: 'sx-game' }, h('div', { class: 'sx-scores' }, lSide, centre, rSide), maxey, maxeyNote, foot)

  // -- Next game view
  const nOpp = h('div', { class: 'sx-nopp' }, '')
  const nWhen = h('div', { class: 'sx-nwhen' }, '')
  const nTri = h('div', { class: 'sx-npair' }, '')
  const nCount = NumberRoll({ value: '00:00:00' })
  const next = h('div', { class: 'sx-next' },
    h('div', { class: 'sx-ncol' }, h('span', { class: 'label' }, 'NEXT GAME'), nOpp, nWhen, nTri),
    h('div', { class: 'sx-inset sx-ncount' }, h('span', { class: 'label' }, 'TIP OFF IN'), h('div', { class: 'sx-nbig' }, nCount)))
  let nextAt = ''

  const show = (v: View, node: Node) => {
    if (view === v) return false
    view = v
    el.replaceChildren(node)
    return true
  }
  const startTick = () => {
    window.clearInterval(tick)
    tick = window.setInterval(() => { if (!document.hidden && nextAt) nCount.set(countdown(nextAt)) }, 1000)
  }

  function update(r: NbaResponse) {
    const g = r.game
    if (g && g.status !== 'scheduled') {
      show('game', game)
      const live = g.status === 'live'
      const lc = teamColour(g.sixers.tri)
      const rc = teamColour(g.opponent.tri)
      lTri.textContent = g.sixers.tri; lTri.style.color = lc
      rTri.textContent = g.opponent.tri; rTri.style.color = rc
      lRec.textContent = g.sixers.record; rRec.textContent = g.opponent.record
      lScore.set(String(g.sixers.score)); rScore.set(String(g.opponent.score))
      lSide.setAttribute('aria-label', `${g.sixers.name} ${g.sixers.score}`)
      rSide.setAttribute('aria-label', `${g.opponent.name} ${g.opponent.score}`)
      dot.hidden = !live
      const hasClock = live && !!g.clock
      qtr.textContent = live ? (hasClock ? periodLabel(g.period) : g.statusText) : 'Final'
      status.classList.toggle('final', !live)
      clk.hidden = !hasClock
      if (hasClock) clk.set(g.clock)
      const won = sixersWon(r)
      result.hidden = live
      result.textContent = won ? 'Sixers win' : 'Sixers lose'
      result.classList.toggle('win', won)
      if (r.maxey) { pts.set(String(r.maxey.points)); reb.set(String(r.maxey.rebounds)); ast.set(String(r.maxey.assists)) }
      maxey.hidden = !r.maxey
      maxeyNote.hidden = !!r.maxey
      const nx = r.next
      foot.hidden = live || !nx
      if (nx) foot.textContent = `Next: ${nx.home ? 'vs' : 'at'} ${nx.opponent.tri}, ${perthWhen(nx.startsAt)}`
      return
    }
    const nx = r.next
    if (nx) {
      show('next', next)
      nextAt = nx.startsAt
      nOpp.textContent = `${nx.home ? 'vs' : 'at'} ${nx.opponent.name}`
      nWhen.textContent = perthWhen(nx.startsAt)
      nTri.replaceChildren(
        h('span', { style: `color:${SIXERS_BLUE}` }, 'PHI'), h('i', {}, nx.home ? 'vs' : 'at'), h('span', { style: `color:${teamColour(nx.opponent.tri)}` }, nx.opponent.tri))
      nCount.set(countdown(nextAt))
      startTick()
      return
    }
    show('empty', EmptyState({ icon: 'basketball', title: 'No Sixers game coming up.', body: 'The schedule will show the next one when it is out.' }))
  }

  return {
    el,
    update,
    loading() {
      if (view && view !== 'loading') return
      show('loading', h('div', { class: 'sx-skel', 'aria-label': 'Loading the Sixers game', role: 'status' },
        h('div', { class: 'sx-skel-row' }, Skeleton({ width: 120, height: 40 }), Skeleton({ width: 72, height: 28 }), Skeleton({ width: 120, height: 40 })),
        Skeleton({ height: 56, radius: 22 })))
    },
    error(offline) {
      window.clearInterval(tick)
      show('error', ErrorState({ kind: offline ? 'offline' : 'error', message: offline ? undefined : 'Sixers scores are not loading right now. Try again.', onRetry: o.onRetry }))
    },
    height: () => el.offsetHeight,
    destroy() { window.clearInterval(tick) },
  }
}

// ---- Confetti ----------------------------------------------------------------------------------

/** A 1.5 s burst of Sixers colours from the top centre. Does nothing under Reduce motion. */
export function confetti(origin?: { x: number; y: number }): void {
  if (reduced()) return
  const cv = h('canvas', { class: 'sx-confetti', 'aria-hidden': 'true' })
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = window.innerWidth, H = window.innerHeight
  cv.width = W * dpr; cv.height = H * dpr
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  document.body.append(cv)
  const colours = [SIXERS_BLUE, '#ED174C', '#FFFFFF', '#4C8DFF', '#FFB547']
  const ox = origin?.x ?? W / 2, oy = origin?.y ?? 36
  const parts = Array.from({ length: 110 }, (_, i) => {
    const a = Math.PI * (0.12 + 0.76 * Math.random()) // downward fan
    const sp = 260 + Math.random() * 520
    return { x: ox + (Math.random() - 0.5) * 80, y: oy, vx: Math.cos(a) * sp * (i % 2 ? 1 : -1) * 0.8, vy: Math.sin(a) * sp, s: 5 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: colours[i % colours.length] }
  })
  const DUR = 1500
  const t0 = performance.now()
  let last = t0
  const frame = (now: number) => {
    const t = now - t0
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    ctx.clearRect(0, 0, W, H)
    const fade = t > 1100 ? Math.max(0, 1 - (t - 1100) / 400) : 1
    for (const p of parts) {
      p.vy += 900 * dt
      p.vx *= 0.985
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y); ctx.rotate(p.r)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2)
      ctx.restore()
    }
    if (t < DUR) requestAnimationFrame(frame)
    else cv.remove()
  }
  requestAnimationFrame(frame)
}

// ---- Wire it to an island ----------------------------------------------------------------------

export interface SixersMount {
  feed: Feed
  card: CardHandle
  /** Push a response in by hand (dev page and tests). Runs the same path as the poller. */
  push(r: NbaResponse): void
  stop(): void
}

/** Fill the island's wide and expanded states from the Sixers feed. Live or final: the pill shows. No game: it rests. */
export function mountSixers(isl: IslandHandle, o: { load?: () => Promise<NbaResponse> } = {}): SixersMount {
  let pill: PillHandle | null = null
  let last: NbaResponse | null = null
  const card = SixersCard({ onRetry: () => void feed.refresh() })
  card.loading()
  isl.setContent('expanded', card.el)

  const apply = (r: NbaResponse, prev: NbaResponse | null) => {
    last = r
    card.update(r)
    isl.setExpandedHeight(22 + Math.max(OPEN_H, card.height()) + 22)
    const g = r.game
    const showPill = !!g && g.status !== 'scheduled'
    if (showPill && g) {
      if (!pill) { pill = SixersPill(r); isl.setContent('wide', pill.nodes) } else pill.update(r)
      isl.setColours(teamColour(g.sixers.tri), teamColour(g.opponent.tri))
      isl.setPulse('slow')
      if (isl.state !== 'wide' && isl.state !== 'expanded') isl.setState('wide')
    } else {
      isl.setTint(SIXERS_BLUE)
      if (isl.state === 'wide') isl.setState('resting')
    }
    // A Sixers win just went final: celebrate once, on the transition only.
    if (prev?.game?.status === 'live' && sixersWon(r) && r.game?.id === prev.game.id) {
      const b = isl.getBoundingClientRect()
      confetti({ x: b.left + b.width / 2, y: b.top + 36 })
    }
  }
  const feed = createFeed({
    load: o.load,
    onData: apply,
    onError: (offline) => { if (!last) card.error(offline) },
  })
  return {
    feed,
    card,
    push: (r) => { apply(r, last) },
    stop: () => { feed.stop(); card.destroy() },
  }
}
