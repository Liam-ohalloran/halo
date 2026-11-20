import '../styles/tokens.css'
import './foundations.css'

// Card 02: /foundations. Specimen, icons and every HALO.md 3.4 component in all 5 states.

const ICONS = ['music-notes', 'clock', 'book-open', 'basketball', 'bell', 'wallet', 'house', 'sliders-horizontal', 'play', 'pause', 'skip-forward', 'skip-back', 'heart', 'speaker-high', 'moon', 'sparkle']
const STATES = ['rest', 'hover', 'pressed', 'focus', 'disabled'] as const
type St = (typeof STATES)[number]
const STATE_LABEL: Record<St, string> = { rest: 'Rest', hover: 'Hover', pressed: 'Pressed', focus: 'Focus visible', disabled: 'Disabled' }

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const base = import.meta.env.BASE_URL

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener)
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, String(v))
  }
  el.append(...kids)
  return el
}

// ---- Icons: inline the copied SVGs from public/icons so they take currentColor
const svgCache = new Map<string, Promise<string>>()
function svgText(name: string): Promise<string> {
  if (!svgCache.has(name)) svgCache.set(name, fetch(`${base}icons/${name}.svg`).then((r) => r.text()))
  return svgCache.get(name)!
}
function icon(name: string, fill = false): HTMLSpanElement {
  const s = h('span', { 'aria-hidden': 'true', style: 'display:contents' })
  svgText(fill ? `${name}-fill` : name).then((t) => (s.innerHTML = t))
  return s
}

// ---- State helper: a component factory rendered once per state
function stateRow(make: (st: St) => HTMLElement, skip: St[] = []): HTMLElement {
  const row = h('div', { class: 'states' })
  for (const st of STATES) {
    if (skip.includes(st)) continue
    row.append(h('div', { class: 'state' }, h('span', { class: 'label' }, STATE_LABEL[st]), make(st)))
  }
  return row
}
const cls = (st: St) => (st === 'hover' ? ' is-hover' : st === 'pressed' ? ' is-pressed' : st === 'focus' ? ' is-focus' : '')

function card(title: string, ...kids: (Node | string)[]) {
  return h('section', { class: 'cmp' }, h('h3', {}, title), ...kids)
}

// ---- Components
function button(label: string, kind: string, st: St, size = '', iconName?: string) {
  const b = h('button', { class: `btn ${kind} ${size}${cls(st)}`, type: 'button', disabled: st === 'disabled', style: kind === 'tinted' ? '--c:var(--shift)' : '' })
  if (iconName) b.append(icon(iconName, true))
  b.append(label)
  return b
}
function iconButton(name: string, st: St, label: string) {
  return h('button', { class: `ibtn${cls(st)}`, type: 'button', 'aria-label': label, disabled: st === 'disabled' }, icon(name, true))
}
function toggle(on: boolean, st: St) {
  const t = h('button', { class: `tgl${cls(st)}`, type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': 'Toggle', disabled: st === 'disabled' })
  t.addEventListener('click', () => t.setAttribute('aria-checked', String(t.getAttribute('aria-checked') !== 'true')))
  return t
}
function slider(value: number, st: St, onInput?: (v: number) => void) {
  const s = h('input', { class: `sld${cls(st)}`, type: 'range', min: 0, max: 100, value, 'aria-label': 'Slider', disabled: st === 'disabled' })
  const paint = () => s.style.setProperty('--v', `${s.value}%`)
  paint()
  s.addEventListener('input', () => { paint(); onInput?.(Number(s.value)) })
  return s
}
function segmented(options: string[], selected: number, st: St, onChange?: (i: number) => void) {
  const wrap = h('div', { class: 'seg', role: 'tablist' })
  const ind = h('span', { class: 'seg-ind', 'aria-hidden': 'true' })
  const btns = options.map((o, i) => h('button', { type: 'button', role: 'tab', class: i === selected && st !== 'rest' && st !== 'disabled' ? '' : '', disabled: st === 'disabled' }, o))
  wrap.append(ind, ...btns)
  let cur = selected
  const place = () => {
    btns.forEach((b, i) => b.setAttribute('aria-selected', String(i === cur)))
    const b = btns[cur]
    ind.style.width = `${b.offsetWidth}px`
    ind.style.transform = `translateX(${b.offsetLeft}px)`
  }
  btns.forEach((b, i) => b.addEventListener('click', () => { cur = i; place(); onChange?.(i) }))
  // forced states land on an unselected segment so the state is visible
  const target = btns[selected === 0 ? 1 : 0]
  if (st !== 'rest' && st !== 'disabled') target.classList.add(st === 'hover' ? 'is-hover' : st === 'pressed' ? 'is-pressed' : 'is-focus')
  requestAnimationFrame(place)
  document.fonts?.ready.then(place)
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      cur = (cur + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length
      place(); btns[cur].focus(); onChange?.(cur)
    }
  })
  return wrap
}
function chip(label: string, subject: string, pressed: boolean, st: St) {
  const c = h('button', { class: `chip ${subject}${cls(st)}`, type: 'button', 'aria-pressed': String(pressed), disabled: st === 'disabled' }, label)
  c.addEventListener('click', () => c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true')))
  return c
}
function ring(value: number, size = 64, stroke = 6, colour = 'var(--shift)', text = '') {
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  const mk = (c: string) => {
    const e = document.createElementNS(NS, 'circle')
    e.setAttribute('cx', String(size / 2)); e.setAttribute('cy', String(size / 2)); e.setAttribute('r', String(r))
    e.setAttribute('fill', 'none'); e.setAttribute('stroke-width', String(stroke)); e.setAttribute('class', c)
    return e
  }
  const fg = mk('ring-fg')
  fg.setAttribute('stroke-dasharray', String(C))
  const set = (v: number) => fg.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0, Math.min(1, v)))))
  set(0)
  svg.append(mk('ring-bg'), fg)
  const label = h('span', { class: 'ring-txt' }, text)
  const el = h('div', { class: 'ring', style: `--c:${colour}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(value * 100) }, svg, label)
  requestAnimationFrame(() => requestAnimationFrame(() => set(value)))
  return Object.assign(el, { setValue: (v: number, t?: string) => { set(v); el.setAttribute('aria-valuenow', String(Math.round(v * 100))); if (t != null) label.textContent = t } })
}
function numberRoll(initial: string, big = false) {
  const root = h('span', { class: `roll${big ? ' big' : ''}`, 'aria-live': 'polite' })
  let shown = ''
  const render = (text: string) => {
    if (text.length !== shown.length) {
      root.replaceChildren(...[...text].map((ch) => {
        if (/\d/.test(ch)) {
          const strip = h('span', { class: 'roll-strip' }, ...Array.from({ length: 10 }, (_, i) => h('span', {}, String(i))))
          return h('span', { class: 'roll-col', 'data-d': '1' }, strip)
        }
        return h('span', { class: 'roll-ch' }, ch)
      }))
    }
    ;[...text].forEach((ch, i) => {
      const col = root.children[i] as HTMLElement
      if (col.dataset.d) (col.firstElementChild as HTMLElement).style.transform = `translateY(${-Number(ch)}em)`
      else col.textContent = ch
    })
    shown = text
    root.setAttribute('aria-label', text)
  }
  render(initial)
  return Object.assign(root, { set: render })
}

// Island shell
const ISLAND = {
  resting: { w: 200, h: 34, r: 17, label: 'Resting' },
  compact: { w: 300, h: 40, r: 20, label: 'Compact' },
  wide: { w: 400, h: 40, r: 20, label: 'Live game' },
  alert: { w: 520, h: 84, r: 34, label: 'Alert' },
  expanded: { w: 660, h: 200, r: 48, label: 'Expanded' },
} as const
type IslandKey = keyof typeof ISLAND
function island() {
  const isl = h('div', { class: 'isl', role: 'img', 'aria-label': 'Island preview' })
  const inner = h('div', { class: 'isl-in' })
  isl.append(inner)
  const wrap = h('div', { class: 'isl-wrap' },
    h('div', { class: 'isl-glow', 'aria-hidden': 'true' }),
    h('div', { class: 'isl-ear l', 'aria-hidden': 'true' }), h('div', { class: 'isl-ear r', 'aria-hidden': 'true' }),
    isl,
    h('div', { class: 'isl-key', 'aria-hidden': 'true' }))
  const stage = h('div', { class: 'isl-stage' }, wrap)
  const content: Record<IslandKey, () => Node[]> = {
    resting: () => [],
    compact: () => [h('span', {}, 'PA shift'), h('i', {}, '1:42')],
    wide: () => [h('span', { style: 'color:var(--sixers)' }, 'PHI 98'), h('small', {}, 'Q4 3:12'), h('span', { style: 'color:#007A33' }, '94 BOS')],
    alert: () => [h('div', {}, h('span', {}, 'Leave by 5:05'), h('small', {}, 'Your shift starts at 5:30')), h('i', {}, '1:42')],
    expanded: () => [h('div', {}, h('span', { class: 'label' }, 'NEXT SHIFT'), h('div', { style: 'font-size:var(--fs-21);margin-top:4px' }, 'SATURDAY PA 5:30-9'), h('small', { style: 'margin-top:4px' }, 'Leave by 5:05')), h('i', { style: 'font-size:var(--fs-28)' }, '1:42')],
  }
  const set = (k: IslandKey) => {
    const s = ISLAND[k]
    wrap.style.width = `${s.w}px`
    wrap.style.height = `${s.h}px`
    wrap.style.borderRadius = `0 0 ${s.r}px ${s.r}px`
    isl.classList.toggle('expanded', k === 'expanded')
    isl.classList.toggle('alert', k === 'alert')
    inner.style.opacity = '0'
    setTimeout(() => { inner.replaceChildren(...content[k]()); inner.style.opacity = '1' }, reduced() ? 0 : 160)
  }
  set('compact')
  return Object.assign(stage, { set })
}

// ---- Sections
function typeSection() {
  const specimen = h('div', { class: 'spill-wrap' },
    h('div', { class: 'spill', 'aria-hidden': 'true' }),
    h('div', { class: 'specimen' },
      h('div', { class: 'sp-row' }, h('span', { class: 'label' }, 'Title 21 / 700'), h('div', { class: 'sp-title' }, 'MONTAGEM REBOLA')),
      h('div', { class: 'sp-row' }, h('span', { class: 'label' }, 'Secondary 15 / 500'), h('div', { class: 'sp-sec' }, 'ATLXS')),
      h('div', { class: 'sp-row' }, h('span', { class: 'label' }, 'Compact pill row'), h('div', { class: 'sp-pill' }, h('b', {}, 'PA shift'), h('i', { class: 'num' }, '1:42'))),
      h('div', { class: 'sp-row' }, h('span', { class: 'label' }, 'Numbers 28 / 700 tabular'), h('div', { class: 'sp-numbers' }, h('span', {}, '16:48'), h('span', {}, '$187.85'), h('span', {}, '98–94'))),
      h('div', { class: 'sp-row' }, h('span', { class: 'label' }, 'Label 11 / 700'), h('div', { class: 'label', style: 'color:var(--text-1)' }, 'NEXT SHIFT')),
      h('div', { class: 'sp-row' }, h('span', { class: 'label' }, 'Body 15 / 400'), h('div', { class: 'sp-body' }, 'Your next shift starts in 1 hour 42 minutes. Leave by 5:05.')),
    ),
  )
  return h('section', { class: 'f-sec' }, h('h2', {}, 'Type'), h('p', { class: 'f-note' }, 'Inter Tight and Geist Mono, self-hosted. The glow is the light spill from HALO.md 3.1b, amber for a shift.'), specimen)
}

function iconSection() {
  const grid = (fill: boolean) => h('div', { class: 'icon-grid' }, ...ICONS.map((n) => h('div', { class: 'icon-cell' }, icon(n, fill), h('span', { class: 'icon-name' }, fill ? `${n}-fill` : n))))
  return h('section', { class: 'f-sec' },
    h('h2', {}, 'Icons'),
    h('p', { class: 'f-note' }, 'Phosphor. Regular is inactive, fill is active. 24 px.'),
    h('div', { class: 'label icon-title' }, 'Regular'), grid(false),
    h('div', { class: 'label icon-title' }, 'Fill'), grid(true),
  )
}

function componentSection() {
  const sec = h('section', { class: 'f-sec' }, h('h2', {}, 'Components'), h('p', { class: 'f-note' }, 'Each one in all five states. The forced states match the real hover, pressed and keyboard focus styles.'))

  sec.append(
    card('Button', h('div', { class: 'label', style: 'margin-bottom:8px' }, 'Primary, 36'), stateRow((st) => button('Start', 'primary', st)),
      h('div', { class: 'label', style: 'margin:16px 0 8px' }, 'Secondary, 36'), stateRow((st) => button('Cancel', 'secondary', st)),
      h('div', { class: 'label', style: 'margin:16px 0 8px' }, 'Tinted, 44'), stateRow((st) => button('Shift', 'tinted', st, 'lg', 'clock'))),
    card('IconButton, 44 hit area, 22 icon', stateRow((st) => iconButton('play', st, 'Play'))),
    card('Toggle, 51 by 31', h('div', { class: 'label', style: 'margin-bottom:8px' }, 'Off'), stateRow((st) => toggle(false, st)), h('div', { class: 'label', style: 'margin:16px 0 8px' }, 'On'), stateRow((st) => toggle(true, st))),
    card('Slider, track 6, thumb 22 (26 dragging)', stateRow((st) => slider(40, st))),
    card('Segmented control', stateRow((st) => segmented(['Day', 'Week'], 0, st))),
    card('Chip', h('div', { class: 'label', style: 'margin-bottom:8px' }, 'Unselected'), stateRow((st) => chip('Human Bio', 'hb', false, st)),
      h('div', { class: 'label', style: 'margin:16px 0 8px' }, 'Selected'), stateRow((st) => chip('Methods', 'meth', true, st)),
      h('div', { class: 'label', style: 'margin:16px 0 8px' }, 'All subjects'),
      h('div', { class: 'inset' }, chip('Human Bio', 'hb', true, 'rest'), chip('Chemistry', 'chem', true, 'rest'), chip('Methods', 'meth', true, 'rest'), chip('Specialist', 'spec', true, 'rest'), chip('English', 'english', true, 'rest'), chip('Religion', 'religion', true, 'rest'))),
    card('RingProgress', h('p', { class: 'cmp-note' }, 'Not interactive. Shown at four values and two colours.'),
      h('div', { class: 'inset' }, ring(0.1, 64, 6, 'var(--shift)', '10'), ring(0.35, 64, 6, 'var(--shift)', '35'), ring(0.72, 64, 6, 'var(--study)', '72'), ring(1, 64, 6, 'var(--pay)', '100'))),
    card('NumberRoll', h('p', { class: 'cmp-note' }, 'Not interactive. Digits roll one by one when the number changes.'),
      h('div', { class: 'inset' }, numberRoll('16:48', true), numberRoll('$187.85', true), numberRoll('98', true))),
    card('Island shell', h('p', { class: 'cmp-note' }, 'All five sizes from HALO.md 3.3. Pick one to watch it morph.'), (() => {
      const stage = island()
      const seg = segmented(Object.values(ISLAND).map((s) => s.label), 1, 'rest', (i) => stage.set(Object.keys(ISLAND)[i] as IslandKey))
      seg.style.maxWidth = '100%'; seg.style.overflowX = 'auto'
      return h('div', { style: 'display:grid;gap:12px' }, stage, seg)
    })()),
  )
  return sec
}

function liveSection() {
  const sec = h('section', { class: 'f-sec' }, h('h2', {}, 'Live row'), h('p', { class: 'f-note' }, 'The same parts, actually working. Try them with the mouse and the keyboard.'))
  const out = h('div', { class: 'num', style: 'font-size:var(--fs-13);font-weight:500;color:var(--text-2)' }, 'Volume 40')
  const r = ring(0.4, 72, 7, 'var(--study)', '40')
  const roll = numberRoll('187.85', true)
  let cents = 18785
  const fmt = () => (cents / 100).toFixed(2)
  const bump = (d: number) => { cents = Math.max(0, cents + d); roll.set(fmt()) }
  const stage = island()
  const wrap = h('div', { class: 'cmp' },
    h('div', { class: 'inset', style: 'margin-bottom:16px' },
      h('button', { class: 'btn primary lg', type: 'button', onclick: () => bump(1250) }, 'Add $12.50'),
      h('button', { class: 'btn secondary', type: 'button', onclick: () => bump(-1250) }, 'Take off'),
      h('span', { style: 'font-size:var(--fs-28)' }, h('span', { class: 'num', style: 'font-weight:700' }, '$'), roll),
    ),
    h('div', { class: 'inset', style: 'margin-bottom:16px' },
      iconButton('skip-back', 'rest', 'Previous'), (() => { const pp = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Play', 'aria-pressed': 'false' }, icon('play', true)); pp.addEventListener('click', () => { const on = pp.getAttribute('aria-pressed') !== 'true'; pp.setAttribute('aria-pressed', String(on)); pp.setAttribute('aria-label', on ? 'Pause' : 'Play'); pp.replaceChildren(icon(on ? 'pause' : 'play', true)) }); return pp })(), iconButton('skip-forward', 'rest', 'Next'),
      toggle(true, 'rest'),
      h('div', { style: 'display:grid;gap:4px;min-width:160px' }, slider(40, 'rest', (v) => { out.textContent = `Volume ${v}`; r.setValue(v / 100, String(v)) }), out),
      r,
    ),
    h('div', { class: 'inset', style: 'margin-bottom:16px' }, segmented(['Now', 'Pay', 'Study'], 0, 'rest'), chip('Human Bio', 'hb', true, 'rest'), chip('Chemistry', 'chem', false, 'rest'), chip('Methods', 'meth', false, 'rest')),
    stage,
    segmented(Object.values(ISLAND).map((s) => s.label), 1, 'rest', (i) => stage.set(Object.keys(ISLAND)[i] as IslandKey)),
  )
  wrap.lastElementChild!.setAttribute('style', 'margin-top:12px;max-width:100%;overflow-x:auto')
  sec.append(wrap)
  return sec
}

const app = document.getElementById('app')!
app.append(
  h('div', { class: 'f-page' },
    h('header', { class: 'f-head' }, h('h1', {}, 'Foundations'), h('p', {}, 'Type, icons and components for approval. Card 02.')),
    typeSection(), iconSection(), componentSection(), liveSection(),
  ),
)

// Pause glow and animation while hidden (HALO.md 3.8)
const sync = () => document.documentElement.classList.toggle('paused', document.hidden)
document.addEventListener('visibilitychange', sync)
sync()
