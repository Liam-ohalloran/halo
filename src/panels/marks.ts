import '../styles/tokens.css'
import '../styles/proto.css'
import './money.css'
import type { Backend } from '../types'
import { KNOWN_SUBJECTS, abbrSubject, buildMarksView, markProblem, percent, shortSubject, subjectTile, type Mark, type MarksView } from '../lib/marks'
import { perthDate } from '../lib/money'
import { animateIn, countUp, pvRoot, reducedMotion, ring, spark, type PvRoot } from '../ui/charts'
import { openSheet } from '../ui/sheet'

// Marks tab (card 21), colour tiles. An average ring, a tile per subject with a sparkline, best and most improved.
// Marks are typed in by hand. Nothing is scraped from SEQTA. Built once, a change rewrites only the tile that changed.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SUBJECT_SLOTS = 6
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString()

const TEMPLATE = `<div class="grid">
  <div class="t gold s2 r2 atar pop" style="--i:0"><span class="caps">Average mark</span><div class="row"><div class="rg" data-k="ring"></div><div class="side" data-k="side"></div></div></div>
  ${Array.from({ length: SUBJECT_SLOTS }, (_, i) => `<div data-k="s${i}" class="slot" style="display:contents"></div>`).join('')}
  <div data-k="best" style="display:contents"></div>
  <div data-k="impr" style="display:contents"></div>
</div>
<div class="mErr" role="alert"><span data-k="errMsg">Can't load your marks.</span><button type="button" data-k="retry">Try again</button></div>`

export interface MarksPanelHandle extends PvRoot { destroy(): void }

export function MarksPanel(api: Backend, clock: () => Date = () => new Date()): MarksPanelHandle {
  const root = pvRoot('marks-pv is-loading') as MarksPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Marks')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  let alive = true
  let seq = 0
  let loaded = false
  let marks: Mark[] = []
  let view: MarksView = buildMarksView([])
  let stopCount: (() => void)[] = []
  let counting = false
  let instant = false

  const shown: Record<string, string> = {}
  let pops = 1 // tile entrance order for the tiles drawn by put()
  const put = (k: string, html: string) => {
    if (shown[k] === html) return
    shown[k] = html
    const el = $(k)
    el.innerHTML = html
    animateIn(el, instant || reducedMotion())
  }

  const tile = (i: number, cls: string, attrs: string, inner: string) => `<button type="button" class="t tile ${cls} pop" style="--i:${i}" ${attrs}>${inner}</button>`

  function paint() {
    if (!loaded) return
    view = buildMarksView(marks)
    root.classList.remove('is-loading', 'is-err')
    const v = view
    const ov = v.overall

    // Average ring. The number counts up while the entrance plays.
    const ringHtml = ring('#FFC23D', ov === null ? 0 : Math.min(1, ov / 100), 110, 9)
    const centre = ov === null ? '<b class="num nil">0<small>%</small></b><span class="caps">No marks yet</span>' : `<b class="num" data-k="avg">${fmt1(ov)}<small>%</small></b><span class="caps">${v.count} ${v.count === 1 ? 'mark' : 'marks'}</span>`
    put('ring', `${ringHtml}<div>${centre}</div>`)
    if (ov !== null && counting) { const el = root.querySelector<HTMLElement>('[data-k="avg"]'); if (el) stopCount.push(countUp(ov, (n) => { el.innerHTML = `${fmt1(n)}<small>%</small>` })) }
    put('side', ov === null
      ? '<b>Add your first mark</b>Your average shows here.<br><button type="button" class="chipb addb" data-act="add">+ ADD MARK</button>'
      : `<b>${v.stats.length} ${v.stats.length === 1 ? 'subject' : 'subjects'}</b>${v.stats.length > SUBJECT_SLOTS ? `${v.stats.length - SUBJECT_SLOTS} more not shown<br>` : 'Weighted by each task<br>'}<button type="button" class="chipb addb" data-act="add">+ ADD MARK</button>`)

    for (let i = 0; i < SUBJECT_SLOTS; i++) {
      const s = v.stats[i]
      if (!s) { put(`s${i}`, tile(i + 1, 'dark', 'data-act="add" aria-label="Add a mark"', '<span class="caps">Subject</span><div class="big num nil">+</div><div class="sub">Add a mark</div>')); continue }
      const up = s.delta !== null && s.delta >= 0
      const delta = s.delta === null ? 'first mark' : `<span style="color:${up ? 'var(--green)' : '#ff7a8f'}">${up ? '▲' : '▼'} ${fmt1(Math.abs(s.delta))}</span> since last`
      put(`s${i}`, tile(i + 1, subjectTile(s.subject), `data-subject="${esc(s.subject)}" aria-label="${esc(s.subject)}, average ${fmt1(s.avg)} percent. Add or edit marks"`,
        `<span class="caps" data-ellipsis>${esc(shortSubject(s.subject))}</span><div class="big num">${Math.round(s.avg)}<small>%</small></div><div class="sub">${delta}</div><div class="spk">${s.last.length > 1 ? spark(s.colour, s.last) : ''}</div>`))
    }
    put('best', v.best
      ? tile(7, 'mag', `data-subject="${esc(v.best.subject)}"`, `<span class="caps">Best</span><div class="big num" style="font-size:16px">${esc(abbrSubject(v.best.subject))} ${Math.round(v.best.avg)}</div><div class="sub">top subject</div>`)
      : tile(7, 'dark', 'data-act="add" aria-label="Add a mark"', '<span class="caps">Best</span><div class="big num nil" style="font-size:16px">None yet</div><div class="sub">needs a mark</div>'))
    put('impr', v.improved
      ? tile(8, 'purple', `data-subject="${esc(v.improved.subject)}"`, `<span class="caps">Most improved</span><div class="big num" style="font-size:16px">${esc(abbrSubject(v.improved.subject))} +${fmt1(v.improved.delta ?? 0)}</div><div class="sub">since last</div>`)
      : tile(8, 'dark', 'data-act="add" aria-label="Add a mark"', `<span class="caps">Most improved</span><div class="big num nil" style="font-size:16px">${v.count ? 'No rise yet' : 'None yet'}</div><div class="sub">${v.count ? 'needs two marks' : 'needs two marks'}</div>`))
    pops++
  }

  async function load(first = false) {
    const my = ++seq
    try {
      const m = await api.marks()
      if (!alive || my !== seq) return
      marks = m
      const firstPaint = !loaded
      loaded = true
      if (firstPaint && root.classList.contains('on')) { counting = !reducedMotion(); setTimeout(() => { counting = false; instant = true }, 1200) }
      paint()
      if (firstPaint && root.classList.contains('on')) animateIn(root, reducedMotion())
    } catch {
      if (!alive || my !== seq) return
      if (first || !loaded) {
        root.classList.remove('is-loading')
        root.classList.add('is-err')
        $('errMsg').textContent = navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Reconnect and try again."
      }
    }
  }

  function markSheet(subject = '') {
    const names = [...new Set([...KNOWN_SUBJECTS, ...marks.map((m) => m.subject)])]
    const own = subject ? marks.filter((m) => m.subject === subject).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5) : []
    openSheet(root, {
      title: subject ? `${subject} marks` : 'Add a mark',
      submit: 'Add mark',
      fields: [
        { key: 'subject', label: 'Subject', type: 'text', value: subject, suggest: names, span: 2, placeholder: 'Chemistry' },
        { key: 'assessment', label: 'Assessment', type: 'text', value: '', span: 2, placeholder: 'Organic test' },
        { key: 'score', label: 'Score', type: 'number', step: '0.5', min: '0', value: '' },
        { key: 'out_of', label: 'Out of', type: 'number', step: '0.5', min: '1', value: '100' },
        { key: 'weighting', label: 'Weighting %', type: 'number', step: '1', min: '0', max: '100', value: '', placeholder: 'Optional' },
        { key: 'date', label: 'Date', type: 'date', value: perthDate(clock()) },
      ],
      aside: subject ? {
        title: 'Recent',
        empty: 'No marks yet.',
        rows: own.map((m) => ({ id: m.id, label: m.assessment, value: `${Math.round(percent(m))}%`, remove: async () => { await api.deleteMark(m.id); await load() } })),
      } : undefined,
      onSubmit: async (v) => {
        const row = { subject: v.subject, assessment: v.assessment, score: Number(v.score), out_of: Number(v.out_of), weighting: v.weighting === '' ? null : Number(v.weighting), date: v.date }
        if (v.score === '' || v.out_of === '') return 'Add the score and what it was out of.'
        const problem = markProblem(row)
        if (problem) return problem
        await api.addMark(row)
        await load()
      },
    })
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-act="add"]')) return markSheet()
    const s = t.closest<HTMLElement>('[data-subject]')
    if (s) markSheet(s.dataset.subject)
  })
  $('retry').addEventListener('click', () => { root.classList.remove('is-err'); root.classList.add('is-loading'); void load(true) })

  const baseEnter = root.enter
  root.enter = () => {
    stopCount.forEach((f) => f()); stopCount = []
    instant = false
    for (const k of Object.keys(shown)) delete shown[k]
    counting = loaded && !reducedMotion()
    baseEnter()
    if (loaded) { paint(); setTimeout(() => { counting = false; instant = true }, 1200); void load() } else void load(true)
  }
  root.destroy = () => { alive = false; stopCount.forEach((f) => f()) }
  return root
}
