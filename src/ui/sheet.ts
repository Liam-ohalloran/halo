import '../styles/sheet.css'

// A small form sheet that slides over one tab (card 21). Money and Marks use it for manual entry, later tabs can too.
// It lives inside the tab's own root, so the island, the tab bar and the rest of the tab stay exactly where they are.
// Escape closes the sheet only (not the island). While it is open the tab behind it is inert, so Tab stays inside the form.

export interface SheetField {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select'
  value?: string
  options?: string[]
  /** Suggestions for a text field. */
  suggest?: string[]
  step?: string
  min?: string
  max?: string
  placeholder?: string
  /** Columns taken out of 4. Default 1. */
  span?: 1 | 2 | 3 | 4
  /** Shown only while this returns true, given the other values. */
  when?: (v: Record<string, string>) => boolean
}

export interface SheetAside {
  title: string
  rows: { id: string; label: string; value: string; remove: () => Promise<void> }[]
  empty: string
}

export interface SheetOptions {
  title: string
  fields: SheetField[]
  submit: string
  /** Return a plain sentence to show as the problem, or nothing when it worked. The sheet closes on success. */
  onSubmit: (v: Record<string, string>) => Promise<string | void> | string | void
  /** Adds a Remove button (editing an existing row). */
  onRemove?: () => Promise<void>
  removeLabel?: string
  aside?: SheetAside
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
let uid = 0

export function openSheet(root: HTMLElement, o: SheetOptions): () => void {
  const id = `sh${++uid}`
  const opener = document.activeElement as HTMLElement | null
  const el = document.createElement('div')
  el.className = 'sheet'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-label', o.title)
  const field = (f: SheetField) => {
    const common = `id="${id}-${f.key}" name="${f.key}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}`
    const input = f.type === 'select'
      ? `<select ${common}>${(f.options ?? []).map((x) => `<option${x === f.value ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`
      : `<input ${common} type="${f.type}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''} ${f.min ? `min="${f.min}"` : ''} ${f.max ? `max="${f.max}"` : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''} ${f.suggest ? `list="${id}-${f.key}-l"` : ''} autocomplete="off" maxlength="60">${f.suggest ? `<datalist id="${id}-${f.key}-l">${f.suggest.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>` : ''}`
    return `<label class="sf" data-f="${f.key}" style="grid-column:span ${f.span ?? 1}"><span class="caps">${esc(f.label)}</span>${input}</label>`
  }
  el.innerHTML = `<form class="sc${o.aside ? ' has-aside' : ''}" novalidate>
    <div class="sMain">
      <div class="sHead"><b>${esc(o.title)}</b><button type="button" class="sx" data-act="close" aria-label="Close">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'}</button></div>
      <div class="sGrid">${o.fields.map(field).join('')}</div>
      <div class="sFoot"><span class="sErr" role="alert" data-k="err"></span>
        ${o.onRemove ? `<button type="button" class="sBtn rm" data-act="remove">${esc(o.removeLabel ?? 'Remove')}</button>` : ''}
        <button type="submit" class="sBtn go" data-k="go">${esc(o.submit)}</button></div>
    </div>
    ${o.aside ? `<div class="sSide"><span class="caps">${esc(o.aside.title)}</span><div class="sRows" data-k="rows"></div></div>` : ''}
  </form>`
  const form = el.querySelector('form')!
  const err = el.querySelector<HTMLElement>('[data-k="err"]')!
  const go = el.querySelector<HTMLButtonElement>('[data-k="go"]')!
  const input = (k: string) => el.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${k}"]`)!
  const values = () => Object.fromEntries(o.fields.map((f) => [f.key, input(f.key).value.trim()]))
  const sync = () => {
    const v = values()
    for (const f of o.fields) el.querySelector<HTMLElement>(`[data-f="${f.key}"]`)!.hidden = f.when ? !f.when(v) : false
  }
  let busy = false
  let closed = false
  const inertTargets = [...root.children].filter((c) => c instanceof HTMLElement) as HTMLElement[]
  const close = () => {
    if (closed) return
    closed = true
    el.classList.remove('open')
    for (const c of inertTargets) c.removeAttribute('inert')
    setTimeout(() => el.remove(), 220)
    opener?.isConnected && opener.focus?.()
  }
  const paintAside = () => {
    if (!o.aside) return
    const rows = el.querySelector<HTMLElement>('[data-k="rows"]')!
    rows.replaceChildren()
    if (!o.aside.rows.length) { const n = document.createElement('span'); n.className = 'sNone'; n.textContent = o.aside.empty; rows.append(n); return }
    for (const r of o.aside.rows) {
      const d = document.createElement('div')
      d.className = 'sRow'
      d.innerHTML = `<span class="sl" data-ellipsis>${esc(r.label)}</span><b>${esc(r.value)}</b><button type="button" class="sx s" aria-label="Remove ${esc(r.label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>`
      d.querySelector('button')!.addEventListener('click', async (e) => {
        const b = e.currentTarget as HTMLButtonElement
        b.disabled = true
        try { await r.remove(); const i = o.aside!.rows.indexOf(r); if (i >= 0) o.aside!.rows.splice(i, 1); paintAside() } catch { b.disabled = false; err.textContent = "Couldn't remove that. Try again." }
      })
      rows.append(d)
    }
  }
  paintAside()
  form.addEventListener('input', () => { err.textContent = ''; sync() })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (busy) return
    busy = true; go.disabled = true; err.textContent = ''
    try {
      const problem = await o.onSubmit(values())
      if (problem) { err.textContent = problem; return }
      close()
    } catch {
      err.textContent = navigator.onLine ? "Couldn't save that. Try again." : "You're offline. Try again when you're back."
    } finally { busy = false; go.disabled = false }
  })
  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement
    if (t === el || t.closest('[data-act="close"]')) return close()
    if (t.closest('[data-act="remove"]') && o.onRemove) {
      busy = true
      try { await o.onRemove(); close() } catch { err.textContent = "Couldn't remove that. Try again." } finally { busy = false }
    }
  })
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close() } })
  sync()
  root.append(el)
  for (const c of inertTargets) c.setAttribute('inert', '')
  requestAnimationFrame(() => { el.classList.add('open'); el.querySelector<HTMLElement>('input:not([hidden]), select')?.focus() })
  return close
}
