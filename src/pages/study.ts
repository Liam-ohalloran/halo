import '../styles/tokens.css'
import '../components/components.css'
import './pages.css'
import '../panels/study.css'
import type { Backend } from '../types'
import { Island, PanelHost, preloadIcons } from '../components'
import { h } from '../components/dom'
import { supabase } from '../lib/supabase'
import { supabaseBackend } from '../supabase'
import { StudyPanel, ICONS_NEEDED } from '../panels/study'
import { StudyPill } from '../panels/studyPill'
import { createStudyTimer } from '../panels/studyTimer'

// /study: the Study panel inside the island, plus the compact pill that shows while a session is on.
// Signed in: real data. In dev, ?mock=full|empty|error|loading|running uses fixtures for screenshots.

const app = document.getElementById('app')!
const params = new URLSearchParams(location.search)

async function backend(): Promise<Backend | null> {
  if (import.meta.env.DEV && params.has('mock')) {
    const { mockBackend } = await import('../dev/mock')
    return mockBackend(params.get('mock') || 'full')
  }
  const { data } = await supabase.auth.getSession()
  return data.session ? supabaseBackend : null
}

async function boot() {
  await preloadIcons([...ICONS_NEEDED, 'house'])
  const api = await backend()
  if (!api) {
    const { mountSignIn } = await import('../components/signin')
    mountSignIn(app, supabase)
    supabase.auth.onAuthStateChange((_e, session) => { if (session) location.reload() })
    return
  }

  const timer = createStudyTimer(api, 'Human Biology')
  const pill = StudyPill(timer)
  const narrow = innerWidth < 520
  const isl = Island({ stageHeight: narrow ? 900 : 440, base: 'compact', initial: 'compact', label: 'Study island', tint: '#BF5AF2',
    // Closing returns to compact. With nothing running that should be the resting dot instead.
    onState: (st) => { if (st === 'compact' && timer.state.status === 'idle') queueMicrotask(() => isl.setState('resting')) } })
  const stage = h('div', { class: 's-stage' }, isl)
  app.append(h('div', { class: 's-page' },
    h('h1', {}, 'Study'),
    h('p', { class: 's-lead' }, 'Pick a subject, start a 25 minute focus session. Open the island to see it. Reload any time and the timer keeps its place.'),
    stage))

  const CHROME = 22 + 22 // expanded top and bottom padding
  const host = PanelHost()
  isl.setContent('expanded', [host])
  isl.setContent('resting', [])
  isl.setContent('compact', pill.nodes)

  let panelEl: HTMLElement
  const relayout = () => {
    host.style.height = `${panelEl.offsetHeight}px`
    isl.setExpandedHeight(CHROME + panelEl.offsetHeight)
  }
  const panel = StudyPanel(api, timer, () => requestAnimationFrame(relayout))
  panelEl = panel
  isl.setExpandedHeight(CHROME + host.show(panel, 0))

  // Compact pill only while a session is on. Otherwise the island rests.
  let lastStatus = ''
  const follow = () => {
    const s = timer.state
    if (s.status === lastStatus) return
    lastStatus = s.status
    isl.setTint(pill.colour())
    if (isl.state === 'expanded') return
    isl.setState(s.status === 'idle' ? 'resting' : 'compact')
  }
  timer.subscribe(follow)

  await timer.init()
  follow()
  relayout()
  document.fonts?.ready.then(relayout)
  if (import.meta.env.DEV) (window as unknown as { __halo: unknown }).__halo = { isl, timer }
}

boot()
