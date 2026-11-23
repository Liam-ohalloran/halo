import './style.css'
import type { Backend } from './types'
import { supabase, supabaseBackend } from './supabase'
import { SESSION_KEY } from './lib/supabase'
import { hasStoredSession, recoverSession } from './lib/session-store'
import { passwordSaveError, passwordProblem } from './lib/auth-form'
import { h, icon, reducedMotion, SPRING, toast } from './ui'
import { mountNow } from './views/now'
import { mountPay } from './panels/pay'
import { mountStudy } from './views/study'
import { mountAuth } from './views/auth'
import { isEmbed } from './lib/embed'
import { connectDesktopHelper, isDesktop, sizeForScreen } from './lib/desktop'
import { watchAuthLinks } from './lib/desktop-auth'

type Tab = 'now' | 'pay' | 'study'
const TABS: { id: Tab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'pay', label: 'Pay' },
  { id: 'study', label: 'Study' },
]

const app = document.getElementById('app')!
const params = new URLSearchParams(location.search)

function sparkles(): HTMLElement {
  const wrap = h('div', { class: 'sparkles', 'aria-hidden': 'true' })
  // A handful of dots: pure CSS animation (compositor only), paused when hidden.
  for (let i = 0; i < 9; i++) {
    const s = h('i')
    s.style.cssText = `left:${(i * 37 + 11) % 100}%;top:${(i * 53 + 7) % 100}%;--d:${(i * 0.73) % 4}s;--s:${0.6 + ((i * 7) % 5) / 6}`
    wrap.append(s)
  }
  return wrap
}

function getTab(): Tab {
  const q = params.get('tab') as Tab | null
  if (q && TABS.some((t) => t.id === q)) return q
  try {
    const t = localStorage.getItem('halo.tab') as Tab | null
    if (t && TABS.some((x) => x.id === t)) return t
  } catch { /* ignore */ }
  return 'now'
}

function renderApp(api: Backend, onSignOut: () => void): () => void {
  let tab = getTab()
  let unmount: () => void = () => {}

  // One realtime channel, fanned out to whichever view is mounted.
  const listeners = new Set<() => void>()
  const live = h('span', { class: 'live-dot', title: 'Connecting…' })
  const stopRealtime = api.onShiftsChange(
    () => listeners.forEach((f) => f()),
    (ok) => {
      live.classList.toggle('on', ok)
      live.title = ok ? 'Live' : 'Reconnecting…'
    },
  )
  const subscribe = (cb: () => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  const indicator = h('span', { class: 'tab-ind' })
  const buttons = TABS.map((t) =>
    h('button', { class: 'tab', role: 'tab', id: `tab-${t.id}`, 'aria-controls': 'view', onclick: () => select(t.id) }, t.label),
  )
  const nav = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Halo' }, indicator, ...buttons)
  const view = h('main', { class: 'view', id: 'view', role: 'tabpanel' })
  const offline = h('div', { class: 'offline', hidden: navigator.onLine }, icon('cloud', 12), 'Offline · showing what we have')

  const header = h('header', { class: 'island' },
    h('div', { class: 'brand' }, h('span', { class: 'halo-mark' }), 'halo'),
    h('div', { class: 'island-right' },
      live,
      h('button', { class: 'icon-btn sm', 'aria-label': 'Sign out', title: 'Sign out', onclick: onSignOut }, icon('out', 14)),
    ),
  )
  app.replaceChildren(h('div', { class: 'shell' }, sparkles(), header, nav, offline, view))

  const onOnline = () => (offline.hidden = navigator.onLine)
  addEventListener('online', onOnline)
  addEventListener('offline', onOnline)

  function moveIndicator(animate: boolean) {
    const i = TABS.findIndex((t) => t.id === tab)
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)))
    nav.dataset.active = tab
    const b = buttons[i]
    const x = b.offsetLeft
    const w = b.offsetWidth
    indicator.style.transition = animate && !reducedMotion() ? '' : 'none'
    indicator.style.transform = `translateX(${x}px)`
    indicator.style.width = `${w}px`
  }

  function select(next: Tab, first = false) {
    const dir = TABS.findIndex((t) => t.id === next) - TABS.findIndex((t) => t.id === tab)
    if (next === tab && !first) return
    tab = next
    try { localStorage.setItem('halo.tab', tab) } catch { /* ignore */ }
    moveIndicator(!first)
    unmount()
    view.setAttribute('aria-labelledby', `tab-${tab}`)
    unmount = tab === 'now' ? mountNow(view, api, subscribe) : tab === 'pay' ? mountPay(view, api, subscribe) : mountStudy(view, api)
    if (!first && !reducedMotion()) {
      view.animate(
        [{ transform: `translateX(${dir > 0 ? 14 : -14}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 460, easing: SPRING },
      )
    }
  }

  // Keyboard: arrow keys move between tabs.
  nav.addEventListener('keydown', (e) => {
    const i = TABS.findIndex((t) => t.id === tab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id
      select(n)
      buttons[TABS.findIndex((t) => t.id === n)].focus()
    }
  })
  const ro = new ResizeObserver(() => moveIndicator(false))
  ro.observe(nav)

  select(tab, true)
  return () => {
    unmount()
    stopRealtime()
    ro.disconnect()
    removeEventListener('online', onOnline)
    removeEventListener('offline', onOnline)
  }
}

/** Settings, signed in only: set or change the password. Returns a sentence when it fails, null when it worked. The password is passed straight on. */
async function setPassword(password: string): Promise<string | null> {
  const problem = passwordProblem(password)
  if (problem) return problem
  const { error } = await supabase.auth.updateUser({ password })
  return error ? passwordSaveError(error.message) : null
}

function booting() {
  app.replaceChildren(h('div', { class: 'shell boot' }, sparkles(), h('div', { class: 'boot-pill', 'aria-label': 'Loading Halo' }, h('span', { class: 'halo-mark' }))))
}

async function start() {
  isEmbed() // reads ?embed=1, remembers it, and sets html.embed before anything draws
  if (isDesktop()) await connectDesktopHelper() // reads ?desktop=1 (the Halo desktop app), sets html.desktop, and finds the bundled helper
  // index.html ships with class="home" so the first paint is the Halo black. The old draft screens opt out.
  if (params.has('legacy') || (import.meta.env.DEV && params.has('mock'))) document.documentElement.classList.remove('home')
  // Dev-only preview of the Now panel on fixtures with a fixed clock: /?demo=soon&open=1 (stripped from production builds).
  if (import.meta.env.DEV && params.has('demo')) {
    const { mockSource, mockClock } = await import('./dev/now-mock')
    const { mountHome } = await import('./components/home')
    const mode = (params.get('demo') || 'full') as Parameters<typeof mockSource>[0]
    const start = mockClock(mode).getTime()
    const t0 = Date.now()
    const { mockBackend } = await import('./dev/mock')
    const { sample } = await import('./dev/nba-sample')
    const sx = (params.get('sixers') ?? 'none') as Parameters<typeof sample>[0]
    const { homeMock } = await import('./dev/home-mock')
    const { baseFixture } = await import('./dev/base-mock')
    mountHome(app, { source: mockSource(mode), api: mockBackend(params.get('api') ?? 'full'), home: homeMock(params.get('home') ?? 'full'), base: params.has('base') ? baseFixture(params.get('base') || 'proto') : undefined, sixers: () => Promise.resolve(sample(sx)), now: () => new Date(start + Date.now() - t0), open: params.has('open'), tab: params.get('tab') ?? undefined,
      // ?account=1 shows Settings as a signed in user sees it (fixtures only, no real sign in).
      account: params.has('account') ? { email: 'liam@example.com', onSetPassword: async (p: string) => (p === 'fail-me-now' ? 'Could not save that. Try again.' : null) } : undefined })
    return
  }
  // Home is the card 01 island. The old draft tabs stay reachable at ?legacy=1 until cards 06 to 08 replace them.
  if (!params.has('legacy') && !params.has('mock')) {
    // Signed out: sign-in screen. Signed in: the island. The session persists across reloads.
    // A stored session that cannot be refreshed yet (Windows started Halo before Wi-Fi was up) is not a sign out: wait for
    // the network instead of showing the sign-in card. A session the server rejected is removed by Supabase and ends this wait.
    const session = (await recoverSession(() => supabase.auth.getSession(), () => hasStoredSession(SESSION_KEY))) as Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
    const data = { session }
    const linkError = new URLSearchParams(location.hash.slice(1)).get('error_description')
    const { mountHome } = await import('./components/home')
    const { mountSignIn, mountSignedInNote } = await import('./components/signin')
    // Card 25: a halo:// link from the magic link email signs the app in. A problem with it shows on the sign-in screen.
    if (isDesktop()) watchAuthLinks(supabase, (m) => { const n = document.querySelector('.signin-msg'); if (n) { n.className = 'signin-msg err'; n.textContent = m } })
    const render = (signedIn: boolean, email = '') => {
      if (signedIn) {
        document.documentElement.classList.remove('signin')
        // Card 15b: on desktop and embedded, "Signed in as" and "Add to Home Screen" live in Settings (the More tab).
        mountHome(app, { account: { email, onSignOut: () => void supabase.auth.signOut(), onSetPassword: setPassword } })
        // The phone keeps its stack for now, so it keeps the footer too.
        if (!isEmbed() && !isDesktop() && matchMedia('(max-width: 480px)').matches) mountSignedInNote(app, supabase, email)
      } else {
        if (isDesktop()) sizeForScreen(460, 440) // the sign-in card needs a window of its own while the island is not there
        mountSignIn(app, supabase, linkError ? "That link didn't work. Send a new one." : undefined)
      }
    }
    let current = Boolean(data.session)
    render(current, data.session?.user.email ?? '')
    supabase.auth.onAuthStateChange((_e, session) => {
      const next = Boolean(session)
      if (next !== current) { current = next; render(next, session?.user.email ?? '') }
    })
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    return
  }
  booting()

  // Dev-only fixtures for design review (stripped from production builds).
  if (import.meta.env.DEV && params.has('mock')) {
    const { mockBackend } = await import('./dev/mock')
    const mode = params.get('mock') ?? 'full'
    if (mode === 'signedout') return void mountAuth(app, supabase, params.get('err') ?? undefined)
    if (mode === 'boot') return
    return void renderApp(mockBackend(mode), () => toast('Signed out (mock)'))
  }

  // Errors from a bad/expired magic link come back in the URL hash.
  const hash = new URLSearchParams(location.hash.slice(1))
  const linkError = hash.get('error_description')?.replace(/\+/g, ' ')

  let teardown: () => void = () => {}
  let signedIn: string | null = null
  const show = (userId: string | null) => {
    if (userId === signedIn && userId !== null) return
    signedIn = userId
    teardown()
    teardown = userId
      ? renderApp(supabaseBackend, async () => {
          await supabase.auth.signOut()
        })
      : mountAuth(app, supabase, linkError ? `That link didn't work: ${linkError}` : undefined)
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  }

  const { data } = await supabase.auth.getSession()
  show(data.session?.user.id ?? null)
  supabase.auth.onAuthStateChange((_e, session) => show(session?.user.id ?? null))
}

start()

if (import.meta.env.PROD && 'serviceWorker' in navigator && !isDesktop()) {
  addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}))
}
