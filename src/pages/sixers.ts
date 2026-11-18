import '../styles/tokens.css'
import '../components/components.css'
import '../components/sixers.css'
import './pages.css'
import { Button, Island, Segmented, preloadIcons } from '../components'
import { h } from '../components/dom'
import { confetti, mountSixers } from '../components/Sixers'
import { setForceReduced, setTimeScale } from '../lib/motion'
import { SAMPLE_KEYS, sample, type SampleKey } from '../dev/nba-sample'

// /sixers: card 09 on its own. Recorded sample JSON runs through the real parser, so every state can be
// checked without a game on. ?state=live|halftime|overtime|final-win|final-loss|next|none|loading|error|offline
// and ?open=1 are for screenshots.

const app = document.getElementById('app')!
await preloadIcons(['basketball', 'warning-circle', 'wifi-slash', 'arrow-clockwise', 'play', 'tray'])

const STATES = [...SAMPLE_KEYS, 'loading', 'error', 'offline'] as const
type St = (typeof STATES)[number]
const LABEL: Record<St, string> = { live: 'Live', halftime: 'Halftime', overtime: 'Overtime', 'final-win': 'Final, win', 'final-loss': 'Final, loss', next: 'Next game', none: 'Empty', loading: 'Loading', error: 'Error', offline: 'Offline' }

const params = new URLSearchParams(location.search)
const first = (STATES as readonly string[]).includes(params.get('state') ?? '') ? (params.get('state') as St) : 'live'

const isl = Island({ stageHeight: 300, initial: 'resting', base: 'resting', tint: '#4C8DFF', label: 'Sixers island' })
const stage = h('div', { class: 'p-stage' }, isl)
let current: St = first
const m = mountSixers(isl, { load: () => (current === 'error' ? Promise.reject(new Error('dev')) : current === 'loading' || current === 'offline' ? new Promise<never>(() => {}) : Promise.resolve(sample(current as SampleKey))) })

function apply(st: St) {
  current = st
  if (st === 'loading') return m.card.loading()
  if (st === 'error') return m.card.error(false)
  if (st === 'offline') return m.card.error(true)
  m.push(sample(st))
}
apply(first)
if (first === 'loading' || first === 'error' || first === 'offline') isl.setState('compact')
if (params.get('open') === '1') requestAnimationFrame(() => isl.open())

const stateBtns = STATES.map((s) => Button({ label: LABEL[s], kind: s === first ? 'primary' : 'secondary', onClick: () => pick(s) }))
const seg = h('div', { class: 'p-btns', role: 'group', 'aria-label': 'Sample state' }, ...stateBtns)
function pick(s: St) {
  stateBtns.forEach((b, i) => { b.classList.toggle('primary', STATES[i] === s); b.classList.toggle('secondary', STATES[i] !== s) })
  apply(s)
}

// Win celebration: a live game, then the same game going final with a Sixers win.
function replayWin() {
  pick('live')
  window.setTimeout(() => { pick('final-win') }, 1200)
}

app.append(h('div', { class: 'p-page' },
  h('header', { class: 'p-head' }, h('h1', {}, 'Sixers'), h('p', {}, 'Card 09. Sample NBA JSON through the real parser. Click the island to open it.')),
  h('div', { style: 'margin-top:24px' }, stage),
  h('div', { class: 'p-bar' },
    seg,
    h('span', { class: 'grow' }),
    Button({ label: 'Open', kind: 'primary', onClick: () => isl.open() }),
    Button({ label: 'Close', kind: 'secondary', onClick: () => isl.close() })),
  h('div', { class: 'p-bar' },
    Button({ label: 'Replay win', kind: 'tinted', colour: '#4C8DFF', icon: 'play', onClick: replayWin }),
    Button({ label: 'Confetti only', kind: 'secondary', onClick: () => { const b = isl.getBoundingClientRect(); confetti({ x: b.left + b.width / 2, y: b.top + 36 }) } }),
    h('span', { class: 'grow' }),
    Segmented({ options: ['Normal', 'x0.25'], label: 'Speed', onChange: (i) => setTimeScale(i === 1 ? 0.25 : 1) }),
    Segmented({ options: ['Motion', 'Reduced'], label: 'Motion', onChange: (i) => setForceReduced(i === 1) }))))
