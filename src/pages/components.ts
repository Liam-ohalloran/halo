import '../styles/tokens.css'
import '../components/components.css'
import './pages.css'
import { Button, Chip, EmptyState, ErrorState, Icon, IconButton, Island, LightSpill, NumberRoll, RingProgress, Segmented, Skeleton, SkeletonText, Slider, TabBar, Toggle, SUBJECTS, preloadIcons, type IslandState, type Subject } from '../components'
import { h } from '../components/dom'
import { setForceReduced, setTimeScale } from '../lib/motion'
import { TINT, fillIsland, shiftPill } from './demo'

// /components: every part of the library. Each interactive one in all five states side by side
// (rest, hover, pressed, focus-visible, disabled), then a live row where they really work.

const STATES = ['rest', 'hover', 'pressed', 'focus', 'disabled'] as const
type St = (typeof STATES)[number]
const LABEL: Record<St, string> = { rest: 'Rest', hover: 'Hover', pressed: 'Pressed', focus: 'Focus visible', disabled: 'Disabled' }
const FORCE: Partial<Record<St, string>> = { hover: 'is-hover', pressed: 'is-pressed', focus: 'is-focus' }

/** One cell per state. make() builds a fresh component, pick() chooses which element wears the forced class. */
function states(make: (disabled: boolean) => HTMLElement, pick: (el: HTMLElement) => HTMLElement = (e) => e): HTMLElement {
  const row = h('div', { class: 'p-states' })
  for (const st of STATES) {
    const el = make(st === 'disabled')
    const cls = FORCE[st]
    if (cls) pick(el).classList.add(cls)
    row.append(h('div', { class: 'p-state' }, h('span', { class: 'label' }, LABEL[st]), el))
  }
  return row
}
const sub = (t: string) => h('div', { class: 'label p-sub' }, t)
const card = (title: string, ...kids: (Node | string)[]) => h('section', { class: 'p-card' }, h('h3', {}, title), ...kids)
const note = (t: string) => h('p', { class: 'p-note' }, t)
const section = (title: string, intro: string, ...kids: Node[]) => h('section', { class: 'p-section' }, h('h2', {}, title), h('p', { class: 'p-note' }, intro), ...kids)

const ICONS = ['house', 'music-notes', 'book-open', 'wallet', 'basketball', 'sparkle', 'bell', 'tray', 'squares-four', 'sliders-horizontal', 'gear-six', 'play']
await preloadIcons([...ICONS, 'pause', 'skip-back', 'skip-forward', 'clock', 'warning-circle', 'wifi-slash', 'arrow-clockwise', 'calendar-blank', 'timer', 'check'])

// ---- Icon
const iconSec = section('Icon', 'Loads a Phosphor SVG by name and weight. Regular is inactive, fill is active.',
  card('Regular and fill, 22 px',
    h('div', { class: 'p-inset' }, ...ICONS.map((n) => Icon(n, 'regular'))),
    sub('Fill'),
    h('div', { class: 'p-inset' }, ...ICONS.map((n) => Icon(n, 'fill')))))

// ---- Controls
const buttonCard = card('Button',
  sub('Primary, 36'), states((d) => Button({ label: 'Start', kind: 'primary', disabled: d })),
  sub('Secondary, 36'), states((d) => Button({ label: 'Cancel', kind: 'secondary', disabled: d })),
  sub('Tinted, 44'), states((d) => Button({ label: 'Shift', kind: 'tinted', size: 44, icon: 'clock', colour: TINT.shift, disabled: d })))
const iconBtnCard = card('IconButton, 44 hit area, 22 icon', states((d) => IconButton({ icon: 'play', label: 'Play', disabled: d })))
const toggleCard = card('Toggle, 51 by 31',
  sub('Off'), states((d) => Toggle({ label: 'Off example', disabled: d })),
  sub('On'), states((d) => Toggle({ label: 'On example', checked: true, disabled: d })))
const sliderCard = card('Slider, track 6, thumb 22, 26 while dragging', states((d) => Slider({ label: 'Example slider', value: 40, disabled: d })))
const segCard = card('Segmented', note('The forced state sits on the unselected segment so it is visible.'),
  states((d) => Segmented({ options: ['Day', 'Week'], label: 'Range', disabled: d }), (e) => (e as ReturnType<typeof Segmented>).buttons[1]))
const chipCard = card('Chip',
  sub('Unselected'), states((d) => Chip({ subject: 'hb', disabled: d })),
  sub('Selected'), states((d) => Chip({ subject: 'meth', pressed: true, disabled: d })),
  sub('All subjects'), h('div', { class: 'p-inset' }, ...(Object.keys(SUBJECTS) as Subject[]).map((s) => Chip({ subject: s, pressed: true }))))
const tabCard = card('TabBar', note('Regular icon when inactive. Fill plus a sliding dot when active. Arrow keys, Home and End move between tabs.'),
  states((d) => TabBar({ tabs: [{ id: 'now', label: 'Now', icon: 'house' }, { id: 'music', label: 'Music', icon: 'music-notes', disabled: d }], active: 'now', settings: false }), (e) => (e as ReturnType<typeof TabBar>).buttons.get('music')!),
  sub('Full bar, reorder and hide ready'),
  (() => {
    const bar = TabBar({ active: 'now' })
    const hide = Toggle({ label: 'Show Controls tab', onChange: (on) => bar.setHidden(on ? [] : ['controls']) })
    const rev = Button({ label: 'Reverse order', kind: 'secondary', onClick: () => bar.setOrder([...bar.visibleIds()].reverse()) })
    return h('div', { class: 'p-gap' }, h('div', { class: 'p-inset tabs-scroll' }, bar), h('div', { class: 'p-inset' }, h('label', { class: 'p-field' }, 'Show Controls (v2 only, 8 tabs at most)', hide), rev))
  })())

const ringNote = note('Not interactive. Shown at four values and two colours.')
const ringCard = card('RingProgress', ringNote,
  h('div', { class: 'p-inset' },
    RingProgress({ value: 0.1, colour: TINT.shift, text: '10', label: 'Ten percent' }), RingProgress({ value: 0.35, colour: TINT.shift, text: '35', label: 'Thirty five percent' }),
    RingProgress({ value: 0.72, colour: TINT.study, text: '72', label: 'Seventy two percent' }), RingProgress({ value: 1, colour: TINT.pay, text: '100', label: 'Complete' }),
    RingProgress({ value: 0.5, size: 40, stroke: 5, colour: TINT.sixers, label: 'Small ring' })))
const rollNote = note('Not interactive. Digits roll one by one when the number changes.')
const rollCard = card('NumberRoll', rollNote,
  h('div', { class: 'p-inset p-big' }, NumberRoll({ value: '16:48' }), NumberRoll({ value: '$187.85' }), NumberRoll({ value: '98' })))
const stateCard = card('Skeleton, EmptyState, ErrorState', note('Loading is a shimmer, never a spinner. Errors are one plain sentence and a retry.'),
  h('div', { class: 'p-states', style: 'grid-template-columns:repeat(auto-fit,minmax(240px,1fr));align-items:start' },
    h('div', { class: 'p-state' }, h('span', { class: 'label' }, 'Skeleton'), h('div', { class: 'p-inset', style: 'width:100%;display:grid;gap:12px' },
      h('div', { class: 'p-skelrow' }, Skeleton({ circle: true, height: 40 }), h('div', { style: 'flex:1;display:grid;gap:8px' }, Skeleton({ height: 15, width: '70%' }), Skeleton({ height: 13, width: '45%' }))),
      SkeletonText(3))),
    h('div', { class: 'p-state' }, h('span', { class: 'label' }, 'Empty'), h('div', { class: 'p-inset', style: 'width:100%;justify-content:center' }, EmptyState({ icon: 'calendar-blank', title: 'No shifts this week.', body: 'New ones show up here after the next sync.' }))),
    h('div', { class: 'p-state' }, h('span', { class: 'label' }, 'Error'), h('div', { class: 'p-inset', style: 'width:100%;justify-content:center' }, ErrorState({ onRetry: () => undefined }))),
    h('div', { class: 'p-state' }, h('span', { class: 'label' }, 'Offline'), h('div', { class: 'p-inset', style: 'width:100%;justify-content:center' }, ErrorState({ kind: 'offline', onRetry: () => undefined })))))

const controlsSec = section('Controls', 'Each interactive component in all five states. The forced states use the same styles as real hover, pressed and keyboard focus.',
  buttonCard, iconBtnCard, toggleCard, sliderCard, segCard, chipCard, tabCard, ringCard, rollCard, stateCard)

// ---- LightSpill and Island
const spillStage = (build: (stage: HTMLElement) => void, height = 150) => {
  const s = h('div', { class: 'p-stage', style: `height:${height}px` })
  build(s)
  return s
}
const rawSpill = spillStage((s) => {
  const sp = LightSpill({ colours: [TINT.shift, TINT.shift] })
  const body = h('div', { style: 'position:absolute;top:0;left:50%;width:220px;height:40px;margin-left:-110px;background:#000;border-radius:0 0 20px 20px' })
  s.append(sp, body)
  const fit = () => sp.setShape({ cx: s.clientWidth / 2, w: 220, h: 40, r: 20 })
  new ResizeObserver(fit).observe(s)
})
function islandStage(opts: { tint: string; colours?: [string, string]; pulse?: 'slow' | 'music'; content: () => Node[] }) {
  const isl = Island({ stageHeight: 96, initial: 'compact', tint: opts.tint, pulse: opts.pulse, toggleOnClick: false })
  if (opts.colours) isl.setColours(...opts.colours)
  isl.setContent('compact', opts.content())
  return h('div', { class: 'p-stage' }, isl)
}
const spillSec = section('LightSpill', 'One fragment shader. Three stacked falloffs (26, 110 and 300 px), tone mapped, with a slow breathing pulse. It pauses when hidden and goes static under Reduce motion.',
  card('On its own', rawSpill),
  card('Colour from the content',
    h('div', { class: 'p-gap' },
      h('div', {}, h('span', { class: 'label' }, 'Shift, amber'), islandStage({ tint: TINT.shift, content: shiftPill })),
      h('div', {}, h('span', { class: 'label' }, 'Live game, team colours split left and right'), (() => {
        const isl = Island({ stageHeight: 96, initial: 'wide', tint: TINT.sixers, toggleOnClick: false })
        isl.setColours(TINT.sixers, TINT.celtics)
        isl.setContent('wide', [h('span', { class: 'p-pill-n', style: `color:${TINT.sixers}` }, 'PHI 98'), h('span', { class: 'p-live' }, h('i', { class: 'p-live-dot' }), 'Q4 3:12'), h('span', { class: 'p-pill-n', style: `color:${TINT.celtics}` }, '94 BOS')])
        return h('div', { class: 'p-stage' }, isl)
      })()),
      h('div', {}, h('span', { class: 'label' }, 'Music, faster pulse'), islandStage({ tint: TINT.music, pulse: 'music', content: () => [h('span', { class: 'p-cover sm' }), h('span', { class: 'p-bars', style: `--c:${TINT.music}` }, h('i'), h('i'), h('i'), h('i'))] })))))

const islandStates = card('Island, five states', note('Rest, hover, pressed, focus visible and disabled. Click or press Enter to open any of them.'), (() => {
  const row = h('div', { class: 'p-states', style: 'grid-template-columns:repeat(auto-fit,minmax(250px,1fr))' })
  for (const st of STATES) {
    const isl = Island({ stageHeight: 96, initial: 'resting', tint: TINT.shift, toggleOnClick: false })
    isl.setContent('resting', [])
    const cls = FORCE[st]
    if (cls) isl.classList.add(cls)
    if (st === 'disabled') isl.setDisabled(true)
    row.append(h('div', { class: 'p-state', style: 'width:100%' }, h('span', { class: 'label' }, LABEL[st]), h('div', { class: 'p-stage', style: 'width:100%' }, isl)))
  }
  return row
})())

const live = (() => {
  const isl = Island({ stageHeight: 340, initial: 'compact', tint: TINT.shift, hover: true, label: 'Halo island' })
  const stage = h('div', { class: 'p-stage' }, isl)
  const ex = fillIsland(isl)
  const kinds: IslandState[] = ['resting', 'compact', 'wide', 'alert', 'expanded']
  const seg = Segmented({ options: ['Resting', 'Compact', 'Live game', 'Alert', 'Expanded'], selected: 1, label: 'Island state', onChange: (i) => {
    const k = kinds[i]
    isl.setTint(k === 'wide' ? TINT.sixers : TINT.shift)
    if (k === 'wide') isl.setColours(TINT.sixers, TINT.celtics)
    isl.setState(k)
  } })
  isl.setState('compact')
  document.fonts?.ready.then(() => ex.relayout())
  return card('Island, live', note('Hover the island for a moment, or click it, to pull it out. Switch tabs inside. Pick a state below.'), stage,
    h('div', { style: 'margin-top:12px;overflow-x:auto' }, seg),
    h('div', { class: 'p-btns', style: 'margin-top:12px' }, Button({ label: 'Send alert', kind: 'tinted', colour: TINT.shift, onClick: () => isl.alert(undefined, 2600) }), Button({ label: 'Open', kind: 'primary', onClick: () => isl.open() }), Button({ label: 'Close', onClick: () => isl.close() })))
})()
const islandSec = section('Island', 'The shell. Compact to expanded morph on a spring, ears, a key line tinted to the content, an alert banner mode. See the full set of transitions on the motion page.', islandStates, live)

// ---- Live row: the same parts, working
const liveRow = (() => {
  const out = h('span', { class: 'p-readout' }, 'Volume 40')
  const ring = RingProgress({ size: 72, stroke: 7, colour: TINT.study, value: 0.4, text: '40', label: 'Volume' })
  const roll = NumberRoll({ value: '187.85' })
  let cents = 18785
  const bump = (d: number) => { cents = Math.max(0, cents + d); roll.set((cents / 100).toFixed(2)) }
  const play = IconButton({ icon: 'play', label: 'Play' })
  play.addEventListener('click', () => { const on = play.getAttribute('aria-label') === 'Play'; play.setAttribute('aria-label', on ? 'Pause' : 'Play'); play.setIcon(on ? 'pause' : 'play') })
  const motionSeg = Segmented({ options: ['Normal', 'x0.25'], label: 'Speed', onChange: (i) => setTimeScale(i ? 0.25 : 1) })
  return section('Live row', 'The same parts, actually working. Try them with the mouse and the keyboard.',
    h('div', { class: 'p-card' },
      h('div', { class: 'p-inset', style: 'margin-bottom:16px' }, Button({ label: 'Add $12.50', kind: 'primary', size: 44, onClick: () => bump(1250) }), Button({ label: 'Take off', onClick: () => bump(-1250) }), h('span', { class: 'p-big' }, h('span', { class: 'num' }, '$'), roll)),
      h('div', { class: 'p-inset', style: 'margin-bottom:16px' }, IconButton({ icon: 'skip-back', label: 'Previous' }), play, IconButton({ icon: 'skip-forward', label: 'Next' }), Toggle({ label: 'Sound', checked: true }),
        h('div', { style: 'display:grid;gap:4px;min-width:160px' }, Slider({ label: 'Volume', value: 40, onInput: (v) => { out.textContent = `Volume ${v}`; ring.setValue(v / 100, String(v)) } }), out), ring),
      h('div', { class: 'p-inset', style: 'margin-bottom:16px' }, Segmented({ options: ['Now', 'Pay', 'Study'], label: 'Panel' }), Chip({ subject: 'hb', pressed: true }), Chip({ subject: 'chem' }), Chip({ subject: 'meth' })),
      h('div', { class: 'p-inset' }, h('label', { class: 'p-field' }, 'Reduce motion preview', Toggle({ label: 'Reduce motion preview', onChange: (on) => setForceReduced(on) })), h('label', { class: 'p-field' }, 'Speed', motionSeg))))
})()

const app = document.getElementById('app')!
app.append(h('div', { class: 'p-page' },
  h('header', { class: 'p-head' }, h('h1', {}, 'Components'), h('p', {}, 'The reusable parts every Halo screen is built from. Card 03.')),
  iconSec, controlsSec, spillSec, islandSec, liveRow))
