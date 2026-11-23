import '../styles/tokens.css'
import '../styles/proto.css'
import './shelf.css'
import type { Backend } from '../types'
import { SHELF_MAX, badge, clipToItem, classifyText, itemColour, itemMeta, pageOf, safeUrl, shelfProblem, tileName, type ShelfItem } from '../lib/shelf'
import { pvRoot, tip, type PvRoot } from '../ui/charts'
import { openSheet } from '../ui/sheet'
import { copyClipboardItem, getClipboard, onHelperEvent } from '../lib/helper'

// Shelf tab (card 22), the glass family. Drop files, links or notes. Files go in the private `shelf` bucket, everything is
// owner only, so the laptop and the phone see the same Shelf. Tiles: the three around the selection, then Phone (a one hour
// link), Copy, Open and Remove (tap twice). Built once, a change only touches the tiles that changed.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ICON = {
  up: '<path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  open: '<path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  rm: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
}
const ACTS: [string, string, string, string][] = [['phone', 'Phone', '#3D9BFF', ICON.phone], ['copy', 'Copy', '#FFC23D', ICON.copy], ['open', 'Open', '#5CFF7A', ICON.open], ['rm', 'Remove', '#FF453A', ICON.rm]]

const TEMPLATE = `<div class="glassBg" aria-hidden="true"><i style="left:-40px;top:-30px;width:220px;height:160px;background:#3D9BFF"></i><i style="left:200px;top:40px;width:200px;height:140px;background:#BF5AF2"></i><i style="right:-30px;top:-40px;width:200px;height:160px;background:#FF453A"></i><i style="left:120px;bottom:-60px;width:260px;height:120px;background:#5CFF7A;opacity:.45"></i></div>
<div class="shG">
  <div data-k="tiles" style="display:contents"></div>
  <button type="button" class="lg add pop" style="--i:3;--c:rgba(255,255,255,.4)" data-k="drop" aria-label="Add a file. You can also drop or paste here."><svg viewBox="0 0 24 24" aria-hidden="true">${ICON.up}</svg><span>Drop or pick</span><input type="file" multiple data-k="file" hidden tabindex="-1"></button>
  <div class="acts">
    <div class="selBox pop" style="--i:4"><div class="sbh"><small data-k="count">SELECTED</small><button type="button" class="chipb note" data-act="note" aria-label="Add a link or note" title="Add a link or note">+</button><button type="button" class="chipb clipmode" data-act="mode" aria-pressed="false" aria-label="Show clipboard history" title="Clipboard history">Clip</button></div><button type="button" class="sbn" data-k="sel" data-act="next" aria-label="Next item"><b data-k="selName" data-ellipsis>Nothing selected</b></button><div class="mt"><i data-k="meter"></i></div></div>
    ${ACTS.map(([a, l, c, ic], i) => `<button type="button" class="lqb pop" data-a="${a}" style="--i:${i + 5};--c:${c}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${l}</span></button>`).join('')}
  </div>
</div>
<div class="shErr" role="alert"><span data-k="errMsg">Can't load your Shelf.</span><button type="button" data-k="retry">Try again</button></div>`

export interface ShelfPanelHandle extends PvRoot { destroy(): void }

export function ShelfPanel(api: Backend): ShelfPanelHandle {
  const root = pvRoot('shelf-pv is-loading') as ShelfPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Shelf')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  const actBtn = (a: string) => root.querySelector<HTMLButtonElement>(`[data-a="${a}"]`)!
  const fileIn = $<HTMLInputElement>('file')
  let alive = true
  let seq = 0
  let loaded = false
  let items: ShelfItem[] = []
  let sel: string | null = null
  let offset = 0
  let working = 0 // uploads in flight
  let armed = 0 // Remove was tapped once
  // Card 26: with the helper (the desktop app) the Shelf can also show the last 25 things copied. Nothing here is saved.
  let mode: 'shelf' | 'clip' = 'shelf'
  let clips: ShelfItem[] = []
  let clipOk = false
  const list = () => (mode === 'clip' ? clips : items)

  const shown: Record<string, string> = {}
  const put = (k: string, html: string) => { if (shown[k] !== html) { shown[k] = html; $(k).innerHTML = html } }
  const putText = (k: string, text: string) => { if (shown[k] !== text) { shown[k] = text; $(k).textContent = text } }
  const selected = () => list().find((i) => i.id === sel) ?? null

  function paint() {
    if (!loaded) return
    root.classList.remove('is-loading', 'is-err')
    root.classList.toggle('has-clip', clipOk)
    root.classList.toggle('is-clip', mode === 'clip')
    root.querySelector('[data-act="mode"]')?.setAttribute('aria-pressed', String(mode === 'clip'))
    const L = list()
    if (!selected()) { sel = L[0]?.id ?? null; offset = 0 }
    const page = pageOf(L, offset)
    // Tiles are rebuilt only when what they show changes: the item, its colour, its selection.
    put('tiles', page.map((it, i) => `<button type="button" class="lg file pop${it.id === sel ? ' sel' : ''}" style="--i:${i};--c:${itemColour(it)}" data-id="${esc(it.id)}" aria-label="${esc(it.name)}, ${badge(it)}" aria-pressed="${it.id === sel}"><span class="fx">${esc(badge(it))}</span><span class="doc"></span><span class="nm" data-ellipsis>${esc(tileName(it))}</span><span class="sz">${esc(itemMeta(it))}</span></button>`).join('')
      + Array.from({ length: 3 - page.length }, (_, i) => `<div class="lg pop blank" style="--i:${page.length + i};--c:rgba(255,255,255,.2)" aria-hidden="true"></div>`).join(''))
    const s = selected()
    putText('count', mode === 'clip' ? `${L.length}/25 COPIED` : working ? 'UPLOADING' : `${items.length}/${SHELF_MAX} SHELF`)
    putText('selName', s ? s.name : 'Nothing selected')
    $('meter').style.width = mode === 'clip' ? `${L.length / 25 * 100}%` : `${Math.min(items.length, SHELF_MAX) / SHELF_MAX * 100}%`
    $('meter').classList.toggle('busy', working > 0)
    for (const a of ['phone', 'copy', 'open', 'rm']) actBtn(a).disabled = !s || (mode === 'clip' && (a === 'phone' || a === 'rm' || (a === 'open' && s.kind !== 'link'))) || (a === 'phone' && s.kind !== 'file') || (a === 'open' && s.kind === 'text')
    $('drop').setAttribute('aria-disabled', String(mode === 'clip' || items.length >= SHELF_MAX))
    root.classList.toggle('is-empty', L.length === 0 && mode === 'shelf')
  }

  async function load(first = false) {
    const my = ++seq
    try {
      const r = await api.shelfItems()
      if (!alive || my !== seq) return
      items = r
      loaded = true
      paint()
    } catch {
      if (!alive || my !== seq) return
      if (first || !loaded) { root.classList.remove('is-loading'); root.classList.add('is-err'); $('errMsg').textContent = navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Reconnect and try again." }
    }
  }

  async function loadClips() {
    const r = await getClipboard()
    if (!alive) return
    clipOk = r !== null
    clips = r ? r.items.map(clipToItem) : []
    if (!clipOk && mode === 'clip') { mode = 'shelf'; sel = null }
    paint()
  }

  // ---- Adding
  async function addFiles(files: File[]) {
    for (const f of files) {
      const problem = shelfProblem(items.length, f.size)
      if (problem) { tip(root, problem); continue }
      working++; paint()
      try { await api.addShelfFile(f); await load() } catch { tip(root, navigator.onLine ? `Couldn't add ${f.name}. Try again.` : "You're offline. Try again when you're back.") } finally { working--; paint() }
    }
    const last = items[0]
    if (last) { sel = last.id; offset = 0; paint() }
  }
  async function addText(text: string) {
    const c = classifyText(text)
    if (!c) return
    const problem = shelfProblem(items.length)
    if (problem) return tip(root, problem)
    try { await api.addShelfText(c); await load(); if (items[0]) { sel = items[0].id; offset = 0; paint() } } catch { tip(root, "Couldn't add that. Try again.") }
  }
  function noteSheet() {
    const problem = shelfProblem(items.length)
    if (problem) return tip(root, problem)
    openSheet(root, {
      title: 'Add to the Shelf', submit: 'Add',
      fields: [{ key: 'text', label: 'A link or a note', type: 'text', span: 4, placeholder: 'https://… or a quick note' }],
      onSubmit: async (v) => { if (!v.text) return 'Type a link or a note.'; await addText(v.text) },
    })
  }

  // ---- Actions
  async function act(a: string) {
    const s = selected()
    if (!s) return
    if (a !== 'rm') armed = 0
    try {
      if (a === 'copy' && mode === 'clip') {
        if (!(await copyClipboardItem(s.id))) throw new Error('copy')
        tip(root, 'Copied again.')
      } else if (a === 'copy') {
        await navigator.clipboard.writeText(s.kind === 'file' ? s.name : s.content)
        tip(root, s.kind === 'file' ? 'File name copied.' : s.kind === 'link' ? 'Link copied.' : 'Note copied.')
      } else if (a === 'phone') {
        const url = await api.shelfUrl(s, 3600)
        await navigator.clipboard.writeText(url)
        tip(root, 'Link copied. It works for an hour.')
      } else if (a === 'open') {
        const url = s.kind === 'file' ? await api.shelfUrl(s, 300) : safeUrl(s.content)
        if (!url) return tip(root, "That link can't be opened.")
        window.open(url, '_blank', 'noopener,noreferrer')
      } else if (a === 'rm') {
        const b = actBtn('rm')
        if (!armed) {
          armed = window.setTimeout(() => { armed = 0; b.querySelector('span')!.textContent = 'Remove' }, 2500)
          b.querySelector('span')!.textContent = 'Sure?'
          return
        }
        clearTimeout(armed); armed = 0
        b.querySelector('span')!.textContent = 'Remove'
        const idx = items.findIndex((i) => i.id === s.id)
        await api.removeShelfItem(s)
        sel = items[idx + 1]?.id ?? items[idx - 1]?.id ?? null
        await load()
      }
    } catch { tip(root, a === 'copy' || a === 'phone' ? "Couldn't copy that. Try again." : "Couldn't do that. Try again.") }
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const tile = t.closest<HTMLElement>('.lg[data-id]')
    if (tile) { sel = tile.dataset.id!; armed = 0; return paint() }
    if (t.closest('[data-k="drop"]')) { if (mode === 'clip') return; if (items.length >= SHELF_MAX) tip(root, shelfProblem(items.length)!); else fileIn.click(); return }
    if (t.closest('[data-act="note"]')) return noteSheet()
    if (t.closest('[data-act="mode"]')) { mode = mode === 'clip' ? 'shelf' : 'clip'; sel = null; offset = 0; armed = 0; if (mode === 'clip') void loadClips(); return paint() }
    if (t.closest('[data-act="next"]')) { const L = list(); if (L.length > 3) { const i = L.findIndex((x) => x.id === sel); sel = L[(i + 1) % L.length].id; offset = L.findIndex((x) => x.id === sel); paint() } return }
    const a = t.closest<HTMLElement>('[data-a]')
    if (a) void act(a.dataset.a!)
  })
  fileIn.addEventListener('change', () => { const f = [...(fileIn.files ?? [])]; fileIn.value = ''; void addFiles(f) })
  root.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('over') })
  root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget as Node)) $('drop').classList.remove('over') })
  root.addEventListener('drop', (e) => {
    e.preventDefault()
    $('drop').classList.remove('over')
    const files = [...(e.dataTransfer?.files ?? [])]
    if (files.length) return void addFiles(files)
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || ''
    if (text) void addText(text)
  })
  // Paste a link, a note or a file while the tab is on screen.
  const onPaste = (e: ClipboardEvent) => {
    if (!alive || !root.isConnected || root.offsetParent === null || (e.target as HTMLElement | null)?.closest?.('input, textarea')) return
    const files = [...(e.clipboardData?.files ?? [])]
    if (files.length) { e.preventDefault(); return void addFiles(files) }
    const text = e.clipboardData?.getData('text/plain')
    if (text?.trim()) { e.preventDefault(); void addText(text) }
  }
  document.addEventListener('paste', onPaste)
  $('retry').addEventListener('click', () => { root.classList.remove('is-err'); root.classList.add('is-loading'); void load(true) })

  const off = api.onShelfChange(() => void load())
  const offClip = onHelperEvent((name) => { if (name === 'clipboard') void loadClips() })
  const baseEnter = root.enter
  root.enter = () => { baseEnter(); void load(!loaded); void loadClips() }
  root.destroy = () => { alive = false; off(); offClip(); document.removeEventListener('paste', onPaste); clearTimeout(armed) }
  return root
}
