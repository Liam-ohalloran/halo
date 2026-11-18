import { h } from '../components/dom'
import { Button, Chip, IconButton, NumberRoll, PanelHost, RingProgress, Skeleton, Slider, TabBar, type IslandHandle, type TabDef } from '../components'

// Sample content for the island, shared by /components and /motion. Static copy, no network.

export const TINT = { shift: '#FF9F0A', study: '#BF5AF2', music: '#FF5E7E', sixers: '#4C8DFF', celtics: '#2DBE6C', pay: '#30D158' }

const pillText = (t: string, extra = '') => h('span', { class: `p-pill-t ${extra}` }, t)

export function shiftPill(): Node[] {
  return [pillText('PA shift'), h('span', { class: 'p-pill-n', style: `color:${TINT.shift}` }, '1:42')]
}
export function musicPill(): Node[] {
  const bars = h('span', { class: 'p-bars', 'aria-hidden': 'true', style: `--c:${TINT.music}` }, h('i'), h('i'), h('i'), h('i'))
  return [h('span', { class: 'p-cover sm', 'aria-hidden': 'true' }), bars]
}
export function studyPill(): Node[] {
  return [pillText('Human Bio', 'hb'), h('span', { class: 'p-pill-n', style: `color:${TINT.study}` }, '18:24')]
}
export function gamePill(): Node[] {
  return [
    h('span', { class: 'p-pill-n', style: `color:${TINT.sixers}` }, 'PHI 98'),
    h('span', { class: 'p-live' }, h('i', { class: 'p-live-dot', 'aria-hidden': 'true' }), 'Q4 3:12'),
    h('span', { class: 'p-pill-n', style: `color:${TINT.celtics}` }, '94 BOS'),
  ]
}
export function restingDot(): Node[] { return [] }
export function alertBanner(): Node[] {
  return [
    h('div', { class: 'p-alert' }, h('span', { class: 'p-pill-t' }, 'Leave by 5:05'), h('small', {}, 'Your shift starts at 5:30')),
    h('span', { class: 'p-pill-n', style: `color:${TINT.shift}` }, '1:42'),
  ]
}

// ---- Expanded content: tab bar plus a panel host whose panels differ in height ----

function nowPanel(): HTMLElement {
  return h('div', { class: 'p-row' },
    h('div', { class: 'p-col' },
      h('span', { class: 'label' }, 'NEXT SHIFT'),
      h('div', { class: 'p-title' }, 'SATURDAY PA 5:30-9'),
      h('div', { class: 'p-sec' }, 'Leave by 5:05')),
    RingProgress({ size: 72, stroke: 7, colour: TINT.shift, value: 0.62, text: '1:42', label: 'Time until your shift' }))
}
function musicPanel(): HTMLElement {
  return h('div', { class: 'p-music' },
    h('div', { class: 'p-row' },
      h('span', { class: 'p-cover' }),
      h('div', { class: 'p-col grow' }, h('div', { class: 'p-title' }, 'MONTAGEM REBOLA'), h('div', { class: 'p-sec' }, 'ATLXS')),
      h('div', { class: 'p-ctl' }, IconButton({ icon: 'skip-back', label: 'Previous' }), IconButton({ icon: 'pause', label: 'Pause' }), IconButton({ icon: 'skip-forward', label: 'Next' }))),
    h('div', { class: 'p-row' }, h('span', { class: 'p-time' }, '1:12'), Slider({ value: 38, label: 'Progress' }), h('span', { class: 'p-time' }, '2:03')),
  )
}
function studyPanel(): HTMLElement {
  return h('div', { class: 'p-col gap' },
    h('div', { class: 'p-chips' }, Chip({ subject: 'hb', pressed: true }), Chip({ subject: 'chem' }), Chip({ subject: 'meth' }), Chip({ subject: 'spec' })),
    h('div', { class: 'p-row' },
      RingProgress({ size: 80, stroke: 8, colour: TINT.study, value: 0.74, text: '18:24', label: 'Study timer' }),
      h('div', { class: 'p-col grow' }, h('span', { class: 'label' }, 'FOCUS SESSION'), h('div', { class: 'p-title' }, 'Human Bio')),
      Button({ label: 'Pause', kind: 'primary', size: 44, icon: 'pause' })))
}
function payPanel(): HTMLElement {
  const roll = NumberRoll({ value: '187.85', label: 'This week' })
  return h('div', { class: 'p-col gap' },
    h('span', { class: 'label' }, 'THIS WEEK'),
    h('div', { class: 'p-big' }, h('span', { class: 'num' }, '$'), roll),
    h('div', { class: 'p-inset' }, h('div', { class: 'p-skelrow' }, Skeleton({ circle: true, height: 28 }), Skeleton({ height: 13, width: '55%' })), h('div', { class: 'p-skelrow' }, Skeleton({ circle: true, height: 28 }), Skeleton({ height: 13, width: '40%' }))))
}

export const DEMO_TABS: TabDef[] = [
  { id: 'now', label: 'Now', icon: 'house' },
  { id: 'music', label: 'Music', icon: 'music-notes' },
  { id: 'study', label: 'Study', icon: 'book-open' },
  { id: 'pay', label: 'Pay', icon: 'wallet' },
]
const BUILD: Record<string, () => HTMLElement> = { now: nowPanel, music: musicPanel, study: studyPanel, pay: payPanel }
const CHROME = 22 + 44 + 12 + 22 // top padding, tab bar, row gap, bottom padding

export interface ExpandedHandle {
  tabs: ReturnType<typeof TabBar>
  host: ReturnType<typeof PanelHost>
  go(id: string, animate?: boolean): void
  /** Re-measure the current panel, for example after fonts load. */
  relayout(): void
}

/** Fill the island's expanded view. Call after the island is in the document so panels can be measured. */
export function mountExpanded(isl: IslandHandle, tabIds: string[] = DEMO_TABS.map((t) => t.id)): ExpandedHandle {
  const tabs = TabBar({
    tabs: DEMO_TABS.filter((t) => tabIds.includes(t.id)),
    hidden: [],
    active: 'now',
    onChange: (id, from) => {
      const ids = tabs.visibleIds()
      show(id, ids.indexOf(id) > ids.indexOf(from ?? id) ? 1 : -1)
    },
  })
  const host = PanelHost()
  isl.setContent('expanded', [tabs, host])
  let currentId = 'now'
  let currentPanel: HTMLElement | null = null
  function show(id: string, dir: number) {
    currentId = id
    currentPanel = BUILD[id]()
    const hgt = host.show(currentPanel, dir)
    isl.setExpandedHeight(CHROME + hgt)
  }
  show('now', 0)
  return {
    tabs,
    host,
    go: (id, animate = true) => {
      if (id === currentId) return
      const ids = tabs.visibleIds()
      const dir = animate ? (ids.indexOf(id) > ids.indexOf(currentId) ? 1 : -1) : 0
      tabs.setActive(id)
      show(id, dir)
    },
    relayout: () => { if (currentPanel) { host.style.height = `${currentPanel.offsetHeight}px`; isl.setExpandedHeight(CHROME + currentPanel.offsetHeight) } },
  }
}

/** Fill every state of an island with the sample content. */
export function fillIsland(isl: IslandHandle): ExpandedHandle {
  isl.setContent('resting', restingDot())
  isl.setContent('compact', shiftPill())
  isl.setContent('wide', gamePill())
  isl.setContent('alert', alertBanner())
  return mountExpanded(isl)
}
