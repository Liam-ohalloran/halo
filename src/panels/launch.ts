import '../styles/tokens.css'
import '../styles/proto.css'
import './launch.css'
import type { Backend } from '../types'
import { pvRoot, tip, type PvRoot } from '../ui/charts'
import { getAppIcon, getFavicon, getStartApps, helperToken, launchStartApp, launchUrl, type StartApp } from '../lib/helper'
import { APP_SLOTS, initial, moveItem, pickable, search, siteGroups, tileColours, validateItem, type LaunchItem } from '../lib/launch'

// Launch tab (card 24), glass family. The apps and sites Liam keeps one tap away, saved in Supabase so the phone sees the same
// list (only the laptop can open an app). Search with "/", Edit to remove or drag into order, and an Add sheet that lists the
// Start menu apps through the helper or takes a website's name and link. The helper does not send app icons yet, so an app is
// a coloured tile with its first letter. Built once, a change only touches what changed.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'

const TEMPLATE = `<div class="glassBg" aria-hidden="true"><i style="left:-40px;top:-40px;width:240px;height:170px;background:#3D9BFF"></i><i style="left:220px;top:60px;width:220px;height:150px;background:#ff2fa3;opacity:.5"></i><i style="right:-30px;top:-30px;width:200px;height:160px;background:#5CFF7A;opacity:.45"></i></div>
<div class="laG">
  <div class="glassC pop" style="--i:0">
    <div class="hdr"><label class="laSearch">${SEARCH}<input data-k="q" placeholder="Search apps and sites  ( / )" aria-label="Search apps and sites" autocomplete="off"></label><button type="button" class="laE" data-k="edit" aria-pressed="false">Edit</button></div>
    <div class="apps" data-k="apps"></div>
    <p class="laNone" data-k="none" hidden></p>
  </div>
  <div class="glassC sites pop" style="--i:1"><span class="caps">Sites</span><div data-k="sites"></div></div>
  <div class="picker" data-k="pick" hidden role="dialog" aria-label="Add to Launch">
    <div class="pkH"><span class="caps">Add to Launch</span><button type="button" data-k="pickX" class="pkX">Close</button></div>
    <div class="pkT" role="tablist"><button type="button" role="tab" data-add="app" aria-selected="true">App</button><button type="button" role="tab" data-add="site" aria-selected="false">Website</button></div>
    <div class="pkApp" data-k="pkApp"><input data-k="pq" placeholder="Search your apps" aria-label="Search your apps" autocomplete="off"><div class="pkList" data-k="pkList"></div></div>
    <form class="pkSite" data-k="pkSite" hidden><input name="name" placeholder="Name" maxlength="24" aria-label="Name" autocomplete="off"><input name="url" placeholder="github.com" aria-label="Web address" autocomplete="off"><input name="grp" placeholder="Group (School, Work, Build)" maxlength="16" aria-label="Group" autocomplete="off"><button type="submit" class="pkGo">Add</button></form>
    <p class="pkErr" data-k="pkErr" role="alert"></p>
  </div>
</div>
<div class="laErr" data-k="err" role="alert" hidden><span data-k="errMsg">Can't load Launch.</span><button type="button" data-k="retry">Try again</button></div>`

export interface LaunchPanelHandle extends PvRoot { destroy(): void }

export function LaunchPanel(api: Backend): LaunchPanelHandle {
  const root = pvRoot('launch-pv is-loading') as LaunchPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Launch')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  let alive = true
  let items: LaunchItem[] = []
  let editing = false
  let query = ''
  let startApps: StartApp[] | null = null
  let picking: 'app' | 'site' = 'app'
  let seq = 0
  let dragging = false
  let dragEnd = 0
  const shown: Record<string, string> = {}
  const html = (k: string, v: string) => { if (shown[k] !== v) { shown[k] = v; $(k).innerHTML = v } }

  const onScreen = () => alive && root.isConnected && root.offsetParent !== null && !root.classList.contains('h-off')

  function paint() {
    if (dragging) return
    const hit = search(items, query)
    const apps = hit.filter((i) => i.kind === 'app')
    const slots = apps.slice(0, APP_SLOTS)
    root.classList.toggle('editing', editing)
    $('edit').textContent = editing ? 'Done'
      : 'Edit'
    $('edit').setAttribute('aria-pressed', String(editing))
    html('apps', slots.map((a) => { const [c1, c2] = tileColours(a.name); return `<div class="app" data-id="${a.id}" data-ic="${esc(a.target)}" role="button" tabindex="0" aria-label="${editing ? `Remove ${esc(a.name)}` : `Open ${esc(a.name)}`}"><span class="ico" style="background:linear-gradient(160deg,${c1},${c2});--g:${c1}"><b>${esc(initial(a.name))}</b>${editing ? '<span class="x" aria-hidden="true">×</span>' : ''}</span><span class="nm">${esc(a.name)}</span></div>` }).join('')
      + (apps.length > slots.length ? `<div class="app more"><span class="ico"><b>+${apps.length - slots.length}</b></span><span class="nm">more</span></div>` : '')
      + (query ? '' : `<div class="app add" data-add-open role="button" tabindex="0" aria-label="Add an app or website"><span class="ico">${PLUS}</span><span class="nm">Add</span></div>`))
    const groups = siteGroups(hit)
    html('sites', groups.map((g) => (g.name ? `<span class="grp">${esc(g.name)}</span>` : '') + g.sites.map((s) => `<a class="site" data-id="${s.id}" data-site="${esc(s.target)}" role="button" tabindex="0" aria-label="${editing ? `Remove ${esc(s.name)}` : `Open ${esc(s.name)}`}"><span class="fav" style="background:${tileColours(s.name)[0]}">${esc(initial(s.name))}</span><b>${esc(s.name)}</b>${editing ? '<span class="rm" aria-hidden="true">×</span>' : ''}</a>`).join('')).join('') || '<p class="laNoSites">No sites yet.</p>')
    hydrateIcons()
    const none = $('none')
    const empty = !hit.length
    none.hidden = !empty || (!query && !!items.length)
    none.textContent = query ? `Nothing matches "${query}".` : ''
  }

  // Real icons from the helper: the app's own icon, and a site's favicon. The letter tile stays if the helper has none (or is off).
  function putIcon(host: Element | null, url: string | null, sel: string | null) {
    if (!host || !url || host.querySelector('img')) return
    const img = document.createElement('img')
    img.src = url; img.alt = ''; img.decoding = 'async'; img.draggable = false
    host.classList.add('real')
    const old = sel ? host.querySelector(sel) : null
    if (old) old.replaceWith(img); else host.replaceChildren(img)
  }
  function hydrateIcons() {
    if (!helperToken()) return
    $('apps').querySelectorAll<HTMLElement>('.app[data-ic]').forEach((el) => { void getAppIcon(el.dataset.ic!).then((u) => { if (alive && el.isConnected) putIcon(el.querySelector('.ico'), u, 'b') }) })
    $('sites').querySelectorAll<HTMLElement>('.site[data-site]').forEach((el) => { void getFavicon(el.dataset.site!).then((u) => { if (alive && el.isConnected) putIcon(el.querySelector('.fav'), u, null) }) })
  }

  async function load() {
    const my = ++seq
    $('err').hidden = true
    try {
      const list = await api.launchItems()
      if (!alive || my !== seq) return
      items = list
      root.classList.remove('is-loading')
      paint()
    } catch {
      if (!alive || my !== seq) return
      root.classList.remove('is-loading')
      $('err').hidden = false
    }
  }

  // ---- Opening things
  async function open(it: LaunchItem) {
    if (it.kind === 'app') {
      if (!helperToken()) return tip(root, 'Open Halo on your laptop to launch apps.')
      const ok = await launchStartApp(it.target)
      tip(root, ok ? `Opening ${it.name}` : 'Start Halo helper to launch apps.')
      return
    }
    if (helperToken() && (await launchUrl(it.target))) return tip(root, `Opening ${it.name}`)
    const a = document.createElement('a')
    a.href = it.target; a.target = '_blank'; a.rel = 'noopener noreferrer'
    a.click()
  }
  async function remove(it: LaunchItem) {
    const before = items
    items = items.filter((i) => i.id !== it.id)
    paint()
    try { await api.removeLaunchItem(it.id) } catch { items = before; paint(); tip(root, "Couldn't remove it. Try again.") }
  }
  const pressItem = (id: string) => {
    const it = items.find((i) => i.id === id)
    if (!it) return
    if (editing) void remove(it); else void open(it)
  }
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (dragging || Date.now() - dragEnd < 250) return // the click that ends a drag is not a press
    const el = t.closest<HTMLElement>('.app[data-id], .site[data-id]')
    if (el) return pressItem(el.dataset.id!)
    if (t.closest('[data-add-open]')) return openPicker()
    if (t.closest('[data-k="retry"]')) return void load()
  })
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('.app, .site')) { e.preventDefault(); if (t.dataset.id) pressItem(t.dataset.id); else if (t.hasAttribute('data-add-open')) openPicker() }
    if (e.key === 'Escape' && !$('pick').hidden) { e.preventDefault(); e.stopPropagation(); closePicker() }
  })
  $('edit').addEventListener('click', () => { editing = !editing; paint() })
  $<HTMLInputElement>('q').addEventListener('input', (e) => { query = (e.target as HTMLInputElement).value; paint() })
  // "/" jumps to the search box while this tab is showing.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== '/' || !onScreen() || e.metaKey || e.ctrlKey || e.altKey) return
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
    e.preventDefault()
    $<HTMLInputElement>('q').focus()
  }
  document.addEventListener('keydown', onKey)

  // ---- Drag to reorder (Edit mode), apps among apps
  $('apps').addEventListener('pointerdown', (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('.app[data-id]')
    if (!tile || !editing || (e as PointerEvent).button !== 0) return
    const id = tile.dataset.id!
    const tiles = [...$('apps').querySelectorAll<HTMLElement>('.app[data-id]')]
    const rects = tiles.map((t) => t.getBoundingClientRect())
    const from = tiles.indexOf(tile)
    const sx = e.clientX, sy = e.clientY
    let to = from
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      if (!moved) { moved = true; dragging = true; tile.classList.add('drag'); tile.setPointerCapture(e.pointerId) }
      tile.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy}px)`
      let best = from, bd = Infinity
      rects.forEach((r, i) => { const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)); if (d < bd) { bd = d; best = i } })
      to = best
      tiles.forEach((t, i) => t.classList.toggle('drop', i === to && to !== from))
    }
    const up = () => {
      tile.removeEventListener('pointermove', move); tile.removeEventListener('pointerup', up); tile.removeEventListener('pointercancel', up)
      if (!moved) return
      tile.classList.remove('drag'); tile.style.transform = ''
      tiles.forEach((t) => t.classList.remove('drop'))
      dragging = false
      dragEnd = Date.now()
      if (to === from) return paint()
      const target = search(items, query).filter((i) => i.kind === 'app')[to]
      const sameKind = items.filter((i) => i.kind === 'app')
      const next = moveItem(items, id, sameKind.indexOf(target ?? sameKind[to]))
      items = next
      paint()
      void api.saveLaunchOrder(next).catch(() => tip(root, "Couldn't save the order. Try again."))
    }
    tile.addEventListener('pointermove', move); tile.addEventListener('pointerup', up); tile.addEventListener('pointercancel', up)
  })

  // ---- Add sheet
  function pickerList() {
    const q = $<HTMLInputElement>('pq').value
    if (startApps === null) { html('pkList', '<p class="pkNote">Looking at your Start menu…</p>'); return }
    if (!startApps.length) { html('pkList', `<p class="pkNote">${helperToken() ? 'No apps found.' : 'Open Halo on your laptop to pick from your apps.'}</p>`); return }
    const list = pickable(startApps, items, q)
    queueMicrotask(() => $('pkList').querySelectorAll<HTMLElement>('.pkItem[data-ic]').forEach((el) => { void getAppIcon(el.dataset.ic!).then((u) => { if (alive && el.isConnected) putIcon(el.querySelector('.ico'), u, 'b') }) }))
    html('pkList', list.length ? list.map((a) => { const [c1, c2] = tileColours(a.name); return `<button type="button" class="pkItem" data-app="${esc(a.id)}" data-name="${esc(a.name)}" data-ic="${esc(a.id)}"><span class="ico" style="background:linear-gradient(160deg,${c1},${c2})"><b>${esc(initial(a.name))}</b></span><span>${esc(a.name)}</span></button>` }).join('') : '<p class="pkNote">Nothing else matches.</p>')
  }
  function openPicker() {
    $('pick').hidden = false
    $('pkErr').textContent = ''
    setKind('app')
    if (startApps === null) void getStartApps().then((r) => { startApps = r?.apps ?? []; if (alive) pickerList() })
    pickerList()
    $<HTMLInputElement>('pq').focus()
  }
  function closePicker() { $('pick').hidden = true }
  function setKind(k: 'app' | 'site') {
    picking = k
    root.querySelectorAll<HTMLElement>('[data-add]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.add === k)))
    $('pkApp').hidden = k !== 'app'
    $('pkSite').hidden = k !== 'site'
    $('pkErr').textContent = ''
  }
  async function add(i: { kind: string; name: string; target: string; grp?: string }) {
    const v = validateItem(i)
    if (!v.ok) { $('pkErr').textContent = v.error; return }
    try {
      const saved = await api.addLaunchItem(v.item)
      items = [...items, saved]
      closePicker()
      paint()
    } catch { $('pkErr').textContent = "Couldn't save that. Try again." }
  }
  $('pickX').addEventListener('click', closePicker)
  root.querySelectorAll<HTMLElement>('[data-add]').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.add as 'app' | 'site')))
  $<HTMLInputElement>('pq').addEventListener('input', pickerList)
  $('pkList').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-app]'); if (b) void add({ kind: 'app', name: b.dataset.name!, target: b.dataset.app! }) })
  $<HTMLFormElement>('pkSite').addEventListener('submit', (e) => {
    e.preventDefault()
    const f = new FormData(e.target as HTMLFormElement)
    void add({ kind: 'site', name: String(f.get('name') ?? ''), target: String(f.get('url') ?? ''), grp: String(f.get('grp') ?? '') })
  })

  root.onEnter = () => { void load() }
  void load()
  void picking
  root.destroy = () => { alive = false; document.removeEventListener('keydown', onKey) }
  return root
}
