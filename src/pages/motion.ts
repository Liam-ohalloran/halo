import '../styles/tokens.css'
import '../components/components.css'
import './pages.css'
import { Button, Island, Segmented, Toggle, preloadIcons, TABS } from '../components'
import { h } from '../components/dom'
import { after, setForceReduced, setPaused, setTimeScale, stepFrame } from '../lib/motion'
import { TINT, alertBanner, fillIsland, gamePill, musicPill, shiftPill } from './demo'

// /motion: a button for every island transition, a x0.25 slow motion toggle, pause and single frame step,
// so the pull-out from HALO.md 3.5 can be tuned frame by frame.

const app = document.getElementById('app')!
await preloadIcons([...TABS.map((t) => t.icon), 'pause', 'skip-back', 'skip-forward', 'play', 'gear-six'])

const isl = Island({ stageHeight: 340, tint: TINT.shift, base: 'compact', label: 'Halo island' })
const stage = h('div', { class: 'p-stage' }, isl)
const ex = fillIsland(isl)
isl.setState('compact')

// ---- Content states
const COMPACT: Record<string, { tint: string; node: () => Node[]; pulse: 'slow' | 'music' }> = {
  shift: { tint: TINT.shift, node: shiftPill, pulse: 'slow' },
  music: { tint: TINT.music, node: musicPill, pulse: 'music' },
  study: { tint: TINT.study, node: () => [h('span', { class: 'p-pill-t', style: 'color:var(--hb)' }, 'Human Bio'), h('span', { class: 'p-pill-n', style: `color:${TINT.study}` }, '18:24')], pulse: 'slow' },
}
function showCompact(key: keyof typeof COMPACT) {
  const c = COMPACT[key]
  isl.setTint(c.tint)
  isl.setPulse(c.pulse)
  if (isl.state === 'compact') isl.swapContent('compact', c.node())
  else { isl.setContent('compact', c.node()); isl.setState('compact') }
}
function showGame() {
  isl.setContent('wide', gamePill())
  isl.setColours(TINT.sixers, TINT.celtics)
  isl.setPulse('slow')
  isl.setState('wide')
}
function showAlert() {
  isl.setContent('alert', alertBanner())
  isl.setTint(TINT.shift)
  isl.alert(undefined, 2600)
}
function nextTab(d: number) {
  if (isl.state !== 'expanded') isl.open()
  const ids = ex.tabs.visibleIds()
  const i = ids.indexOf(ex.tabs.active ?? ids[0])
  ex.go(ids[(i + d + ids.length) % ids.length])
}

// ---- Play all: a timeline on the motion clock, so it slows down, pauses and steps with everything
let seqCancel: (() => void)[] = []
function playAll() {
  seqCancel.forEach((c) => c()); seqCancel = []
  const steps: [number, () => void][] = [
    [0, () => { isl.setState('resting') }],
    [900, () => showCompact('shift')],
    [1800, () => showCompact('music')],
    [2700, () => isl.open()],
    [4000, () => nextTab(1)],
    [4900, () => nextTab(1)],
    [5800, () => nextTab(-1)],
    [6800, () => isl.close()],
    [7800, () => showAlert()],
    [11000, () => showGame()],
    [12400, () => { showCompact('study') }],
    [13400, () => isl.setState('resting')],
  ]
  for (const [t, fn] of steps) seqCancel.push(after(t, fn))
}

// ---- Controls
const readout = h('span', { class: 'p-readout', 'aria-live': 'off' }, 'w 300  h 40  r 20')
isl.onFrame = (s) => { readout.textContent = `w ${s.w.toFixed(0)}  h ${s.h.toFixed(0)}  r ${s.r.toFixed(0)}` }

const speed = Segmented({ options: ['Normal', 'x0.25'], label: 'Speed', onChange: (i) => setTimeScale(i === 1 ? 0.25 : 1) })
const reduce = Toggle({ label: 'Preview Reduce motion', onChange: (on) => setForceReduced(on) })
const pauseBtn = Button({ label: 'Pause', kind: 'secondary', icon: 'pause', onClick: () => {
  const on = pauseBtn.dataset.on !== '1'
  pauseBtn.dataset.on = on ? '1' : ''
  setPaused(on)
  pauseBtn.setLabel(on ? 'Resume' : 'Pause')
  stepBtn.disabled = !on
} })
const stepBtn = Button({ label: 'Step frame', kind: 'secondary', icon: 'skip-forward', disabled: true, onClick: () => stepFrame() })

const btn = (label: string, fn: () => void, kind: 'primary' | 'secondary' | 'tinted' = 'secondary', icon?: string) => Button({ label, kind, icon, onClick: fn })

app.append(h('div', { class: 'p-page' },
  h('header', { class: 'p-head' }, h('h1', {}, 'Motion'), h('p', {}, 'Every island transition from HALO.md 3.5. Card 03.')),
  h('div', { style: 'margin-top:24px' }, stage),
  h('div', { class: 'p-bar' },
    h('label', { class: 'p-field' }, 'Speed', speed),
    h('label', { class: 'p-field' }, 'Reduce motion', reduce),
    h('span', { class: 'grow' }),
    pauseBtn, stepBtn, readout),
  h('div', { class: 'p-groups' },
    h('div', { class: 'p-group' }, h('span', { class: 'label' }, 'Pull-out'),
      h('div', { class: 'p-btns' }, btn('Open', () => isl.open(), 'primary'), btn('Close', () => isl.close()), btn('Previous tab', () => nextTab(-1)), btn('Next tab', () => nextTab(1)), btn('Play all', playAll, 'tinted', 'play'))),
    h('div', { class: 'p-group' }, h('span', { class: 'label' }, 'Compact states'),
      h('div', { class: 'p-btns' }, btn('Resting', () => isl.setState('resting')), btn('Shift', () => showCompact('shift')), btn('Music', () => showCompact('music')), btn('Study', () => showCompact('study')), btn('Live game', showGame))),
    h('div', { class: 'p-group' }, h('span', { class: 'label' }, 'Alerts'),
      h('div', { class: 'p-btns' }, btn('Alert banner', showAlert, 'tinted', 'sparkle'))),
    h('div', { class: 'p-group' }, h('span', { class: 'label' }, 'What to watch for'),
      h('ol', { class: 'p-steps' },
        h('li', {}, h('b', {}, '0 to 90 ms. '), 'Compact content fades, scales to 0.94 and blurs 4 px. The island squashes (scaleX 1.03, scaleY 0.97).'),
        h('li', {}, h('b', {}, '60 to 520 ms. '), 'Width, height and radius spring together (stiffness 380, damping 28), anchored to the top edge. The light spill grows with the shape.'),
        h('li', {}, h('b', {}, 'From about 55% of the motion. '), 'Rows stagger in 30 ms apart, tab bar first. Each rises 6 px and scales 0.98 to 1.'),
        h('li', {}, h('b', {}, 'Close. '), 'Stiffness 420, damping 32. Content is gone before the shape finishes shrinking.'),
        h('li', {}, h('b', {}, 'Interrupt. '), 'Press Open then Close mid way. The shape reverses from where it is, with no snap.'))),
  ),
))

// Island sizes depend on the font, so re-measure panels once Onest has loaded.
document.fonts?.ready.then(() => ex.relayout())
