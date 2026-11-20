import '../styles/tokens.css'
import '../styles/proto.css'
import './alerts.css'
import type { AlertRow } from '../types'
import { ago, alertMeta, buildAlertsView, safeUrl, type AlertFilter, type AlertsStore } from '../lib/alerts'
import { pvRoot, type PvRoot } from '../ui/charts'

// Alerts tab (card 20), the black island family. A shaped glow banner for the most important unread alert, an
// ALL / SCHOOL / WORK / PHONE filter, CLEAR ALL, and the rest as island pills that dismiss on tap.
// Built once. A new, dismissed or cleared alert only touches its own pill, the filter only changes classes, the count is
// a text node. The entrance plays when the tab is switched to, never on a data change or a press.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SHAPE = 'M200 -10 L380 -10 L366 44 Q362 58 348 58 L232 58 Q218 58 214 44 Z'
const FILTERS: [AlertFilter, string][] = [['all', 'ALL'], ['school', 'SCHOOL'], ['work', 'WORK'], ['phone', 'PHONE']]
const GONE_MS = 360 // how long a dismissed pill takes to shrink away
const STAGGER_MS = 70 // CLEAR ALL dismisses them one after another

const TEMPLATE = `<div class="take pop" style="--i:0" data-k="take">
  <svg class="shp" viewBox="0 0 564 78" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="alTg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter></defs>
    <path d="${SHAPE}" fill="none" stroke-width="16" opacity=".5" filter="url(#alTg)" class="glow"/><path d="${SHAPE}" fill="none" stroke-width="3.5" class="line"/></svg>
  <div class="lf">
    <div class="toggle" role="group" aria-label="Filter alerts" data-k="filter">${FILTERS.map(([f, l], i) => `<button type="button" data-f="${f}" class="${i === 0 ? 'on' : ''}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
    <button type="button" class="chipb clr" data-k="clear">CLEAR ALL · <span data-k="n">0</span></button>
  </div>
  <div class="tx" data-k="tx">
    <small data-k="cap">ALL CLEAR</small>
    <button type="button" class="heroBtn" data-k="hero" aria-label="Dismiss alert"><b data-k="title" data-ellipsis>Nothing new</b><span data-k="body" data-ellipsis>You are up to date.</span></button>
    <a class="act" data-k="act" target="_blank" rel="noopener noreferrer" hidden></a>
  </div>
  <div class="txSk" aria-hidden="true"><i class="skel"></i><i class="skel"></i><i class="skel"></i></div>
</div>
<div class="ap" data-k="list"></div>
<div class="alNote"><b>No alerts</b><span>New ones show here the moment they arrive.</span></div>
<div class="alErr" role="alert"><p data-k="errMsg">Can't reach Halo. Check your connection.</p><button type="button" data-k="retry">Try again</button></div>`

export interface AlertsPanelHandle extends PvRoot { destroy(): void }

export function AlertsPanel(store: AlertsStore, clock: () => Date = () => new Date()): AlertsPanelHandle {
  const root = pvRoot('alerts-pv is-loading') as AlertsPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Alerts')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  const take = $('take'), list = $('list'), cap = $('cap'), titleEl = $('title'), bodyEl = $('body'), act = $<HTMLAnchorElement>('act'), countEl = $('n')

  let filter: AlertFilter = 'all'
  let heroId: string | null = null
  let alive = true
  let entering = 0
  let tick = 0
  const pills = new Map<string, HTMLButtonElement>() // by alert id
  const moreCell = document.createElement('div')
  moreCell.className = 'ip more'
  moreCell.hidden = true
  moreCell.innerHTML = '<span class="mc" data-k="more">+0</span><div class="t2"><b>more alerts</b><span>Clear one to see the next</span></div>'
  list.append(moreCell)

  const pillHtml = (r: AlertRow, now: Date) => {
    const m = alertMeta(r.type)
    return `<span class="ai" style="background:${m.bg}"><svg viewBox="0 0 24 24" aria-hidden="true">${m.icon}</svg></span><div class="t2"><b data-ellipsis>${esc(r.title)}</b><span data-ellipsis>${esc(r.body)}</span></div><span class="w" data-w>${ago(now, r.created_at)}</span>`
  }
  const makePill = (r: AlertRow, now: Date): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ip'
    b.dataset.id = r.id
    b.dataset.cat = alertMeta(r.type).cat
    b.style.setProperty('--c', alertMeta(r.type).colour)
    b.setAttribute('aria-label', `Dismiss: ${r.title}`)
    b.innerHTML = pillHtml(r, now)
    return b
  }

  /** The banner. Only rewritten when the top alert changes, with a short crossfade. */
  function paintHero(hero: AlertRow | null, now: Date) {
    const id = hero?.id ?? null
    const m = hero ? alertMeta(hero.type) : null
    take.style.setProperty('--g', m?.colour ?? '#8E8E93')
    take.classList.toggle('idle', !hero)
    if (hero) cap.textContent = `${m!.label.toUpperCase()} · ${ago(now, hero.created_at).toUpperCase()}`
    if (id === heroId) return
    heroId = id
    titleEl.textContent = hero?.title ?? 'Nothing new'
    bodyEl.textContent = hero?.body ?? 'You are up to date.'
    if (!hero) cap.textContent = 'ALL CLEAR'
    const url = safeUrl(hero?.action_url ?? null)
    if (hero && url && hero.action_label) { act.textContent = hero.action_label; act.href = url; act.hidden = false } else { act.hidden = true; act.removeAttribute('href') }
    $<HTMLButtonElement>('hero').disabled = !hero
    $('hero').setAttribute('aria-label', hero ? `Dismiss: ${hero.title}` : 'No alerts')
    const tx = $('tx')
    tx.classList.remove('swap')
    void tx.offsetWidth
    tx.classList.add('swap')
  }

  function applyFilter() {
    $('filter').querySelectorAll<HTMLElement>('button').forEach((b) => { const on = b.dataset.f === filter; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)) })
    for (const p of pills.values()) p.classList.toggle('dim', !(filter === 'all' || p.dataset.cat === filter))
  }

  /** Bring the DOM in line with the store. Existing pills are kept, only the difference is added or removed. */
  function paint(entrance = false) {
    const st = store.status()
    root.classList.toggle('is-loading', st === 'loading')
    if (st === 'error' && !store.rows().length) {
      root.classList.add('is-err')
      $('errMsg').textContent = navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Reconnect and try again."
      return
    }
    root.classList.remove('is-err')
    if (st === 'loading') return
    const now = clock()
    const view = buildAlertsView(store.rows())
    paintHero(view.hero, now)
    if (countEl.textContent !== String(view.unread)) countEl.textContent = String(view.unread)
    $<HTMLButtonElement>('clear').disabled = view.unread === 0
    root.classList.toggle('is-empty', view.unread === 0)

    const want = new Set(view.pills.map((r) => r.id))
    let out = 0
    for (const [id, el] of pills) {
      if (want.has(id)) continue
      pills.delete(id)
      el.disabled = true
      el.style.transitionDelay = `${out++ * STAGGER_MS}ms`
      el.classList.add('gone')
      setTimeout(() => el.remove(), out * STAGGER_MS + GONE_MS)
    }
    let ref: Element | null = list.firstElementChild
    while (ref && ref.classList.contains('gone')) ref = ref.nextElementSibling
    view.pills.forEach((r, i) => {
      let el = pills.get(r.id)
      if (!el) {
        el = makePill(r, now)
        pills.set(r.id, el)
        if (!entrance && root.classList.contains('on')) el.classList.add('fresh')
        el.style.setProperty('--i', String(i))
      }
      const w = el.querySelector('[data-w]')!
      const age = ago(now, r.created_at)
      if (w.textContent !== age) w.textContent = age
      // keep DOM order equal to the view order without touching pills that are already in place
      while (ref && ref.classList.contains('gone')) ref = ref.nextElementSibling
      if (ref === el) ref = ref.nextElementSibling
      else list.insertBefore(el, ref === moreCell || !ref ? moreCell : ref)
    })
    moreCell.hidden = view.more === 0
    if (view.more) $('more').textContent = `+${view.more}`
    applyFilter()
    if (entrance) {
      clearTimeout(entering)
      root.classList.remove('al-in')
      void root.offsetWidth
      root.classList.add('al-in')
      entering = window.setTimeout(() => root.classList.remove('al-in'), 1200)
    }
  }

  // One listener: a pill dismisses itself, the banner dismisses the top alert (or opens its action), the chips filter or clear.
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-k="act"]')) { const id = heroId; if (id) void store.markRead([id]); return } // the link opens itself
    const f = t.closest<HTMLElement>('[data-f]')
    if (f) { filter = f.dataset.f as AlertFilter; applyFilter(); return }
    if (t.closest('[data-k="clear"]')) {
      const ids = store.rows().filter((r) => !r.read_at).map((r) => r.id)
      if (ids.length) void store.markRead(ids)
      return
    }
    if (t.closest('[data-k="hero"]')) { if (heroId) void store.markRead([heroId]); return }
    const p = t.closest<HTMLElement>('.ip[data-id]')
    if (p && !p.classList.contains('gone')) void store.markRead([p.dataset.id!])
  })
  $('retry').addEventListener('click', () => { root.classList.add('is-loading'); void store.load() })

  let shown = false // the entrance has played with real data, so later changes go straight in
  const off = store.subscribe(() => {
    if (!alive) return
    if (!shown && store.status() === 'ok' && root.classList.contains('on')) { shown = true; paint(true) } else paint(false)
  })
  // Ages move on while the tab is open, so the small "4m" stays honest without any rebuild.
  tick = window.setInterval(() => { if (alive && !document.hidden && store.status() === 'ok') paint(false) }, 30_000)

  // The entrance replays each time the tab is switched to.
  const baseEnter = root.enter
  root.enter = () => {
    baseEnter()
    if (store.status() === 'ok') { shown = true; paint(true) }
  }
  paint(false)
  root.destroy = () => { alive = false; clearTimeout(entering); clearInterval(tick); off() }
  return root
}
