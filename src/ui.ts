type Child = Node | string | number | null | undefined | false
type Props = Record<string, unknown>

/** Tiny element builder. `on*` props become listeners, `class` / `style` / data-* set as attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else if (k in el && k !== 'style' && k !== 'class') (el as unknown as Props)[k] = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c))
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'
export function svg(tag: string, attrs: Record<string, string | number> = {}, ...kids: Element[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  el.append(...kids)
  return el
}

/** Small inline icons (stroke-based, inherit currentColor). */
const ICONS: Record<string, string> = {
  shift: 'M4 7h16v12H4zM9 7V5h6v2M4 12h16',
  test: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4',
  pay: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 10v4M18 10v4',
  study: 'M12 6v6l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  retry: 'M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18zM4 4l16 16',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  play: 'M8 5v14l11-7z',
  stop: 'M7 7h10v10H7z',
  spark: 'M12 3l1.8 6.2L20 12l-6.2 1.8L12 21l-1.8-7.2L4 12l6.2-2.8z',
}
export function icon(name: keyof typeof ICONS | string, size = 16): SVGElement {
  const filled = name === 'play' || name === 'stop' || name === 'spark'
  return svg(
    'svg',
    { viewBox: '0 0 24 24', width: size, height: size, class: 'ic', 'aria-hidden': 'true' },
    svg('path', {
      d: ICONS[name] ?? '',
      fill: filled ? 'currentColor' : 'none',
      stroke: filled ? 'none' : 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  )
}

/* ---------- shared states ---------- */

export function skeleton(lines = 3, tall = false): HTMLElement {
  return h(
    'div',
    { class: 'card skel', 'aria-busy': 'true', 'aria-label': 'Loading' },
    h('div', { class: 'sk sk-chip' }),
    tall ? h('div', { class: 'sk sk-big' }) : null,
    ...Array.from({ length: lines }, (_, i) => h('div', { class: 'sk sk-line', style: `width:${88 - i * 18}%` })),
  )
}

export function emptyState(iconName: string, title: string, body: string, action?: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'card empty pop' },
    h('div', { class: 'empty-orb' }, icon(iconName, 20)),
    h('div', { class: 'empty-title' }, title),
    h('div', { class: 'empty-body' }, body),
    action ?? null,
  )
}

export function errorState(message: string, retry: () => void): HTMLElement {
  return h(
    'div',
    { class: 'card error pop', role: 'alert' },
    h('div', { class: 'empty-orb err' }, icon('cloud', 20)),
    h('div', { class: 'empty-title' }, navigator.onLine ? "Couldn't load that" : "You're offline"),
    h('div', { class: 'empty-body' }, navigator.onLine ? friendlyError(message) : 'Halo will catch up when you reconnect.'),
    h('button', { class: 'btn ghost sm', onclick: retry }, icon('retry', 14), 'Try again'),
  )
}

export function friendlyError(msg: string): string {
  if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) return 'Network hiccup. Check your connection.'
  if (/JWT|token|auth/i.test(msg)) return 'Your sign-in expired. Sign in again.'
  if (/rate limit|too many/i.test(msg)) return 'Too many tries. Give it a minute.'
  return msg.length > 90 ? msg.slice(0, 88) + '…' : msg
}

/* ---------- toast ---------- */

let toastEl: HTMLElement | null = null
let toastTimer = 0
export function toast(text: string, kind: 'ok' | 'err' = 'ok'): void {
  toastEl?.remove()
  toastEl = h('div', { class: `toast ${kind}`, role: 'status' }, text)
  document.body.append(toastEl)
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastEl?.classList.add('out')
    setTimeout(() => toastEl?.remove(), 300)
  }, 2600)
}

/* ---------- one shared ticker, paused while hidden ---------- */

const tickers = new Set<(now: number) => void>()
let tickId = 0
function runTick() {
  const now = Date.now()
  tickers.forEach((f) => f(now))
}
function syncTicker() {
  const want = tickers.size > 0 && !document.hidden
  if (want && !tickId) {
    runTick()
    tickId = window.setInterval(runTick, 1000)
  } else if (!want && tickId) {
    clearInterval(tickId)
    tickId = 0
  }
}
document.addEventListener('visibilitychange', syncTicker)
export function onTick(f: (now: number) => void): () => void {
  tickers.add(f)
  f(Date.now())
  syncTicker()
  return () => {
    tickers.delete(f)
    syncTicker()
  }
}

/** Swap text only when it changes, with a quick springy nudge. */
export function setText(el: Element, text: string, bump = false): void {
  if (el.textContent === text) return
  el.textContent = text
  if (bump && !reducedMotion()) {
    el.animate([{ transform: 'translateY(-3px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], {
      duration: 380,
      easing: SPRING,
    })
  }
}

export const SPRING =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24.3%, 1.108 26%, 1.103, 1.085 31.2%, 1.014 38.6%, 0.996 42.6%, 0.988 47.4%, 0.996 58.8%, 1)'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
