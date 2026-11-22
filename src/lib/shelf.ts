// Shelf (card 22). The pure model for the Shelf tab: what can go on it, how an item is named and coloured, and the rules.
// Files live in the private `shelf` bucket, links and notes live in the row itself. Nothing here talks to Supabase.

import type { ClipItem } from './helper'

export interface ShelfItem {
  id: string
  kind: 'file' | 'link' | 'text'
  name: string
  /** A link's address, or a note's text. Empty for a file. */
  content: string
  storage_path: string | null
  size_bytes: number | null
  mime: string | null
  created_at: string
}

/** The Shelf holds eight things. Remove one to add another. */
export const SHELF_MAX = 8
/** Matches the bucket's 20 MB limit. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

const COLOURS: Record<string, string> = { pdf: '#FF453A', png: '#3D9BFF', jpg: '#3D9BFF', jpeg: '#3D9BFF', gif: '#3D9BFF', webp: '#3D9BFF', zip: '#FFC23D', docx: '#6e8cff', doc: '#6e8cff', xlsx: '#5CFF7A', csv: '#5CFF7A', pptx: '#FF8A1E', md: '#BF5AF2', txt: '#AEB6C2', mp3: '#FF2FA3', mp4: '#FF2FA3', mov: '#FF2FA3' }

export const fileExt = (name: string): string => {
  const i = name.lastIndexOf('.')
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase().slice(0, 5) : ''
}

/** The small caps badge on a tile: the extension, LINK or NOTE. */
export const badge = (it: Pick<ShelfItem, 'kind' | 'name'>): string => (it.kind === 'link' ? 'LINK' : it.kind === 'text' ? 'NOTE' : (fileExt(it.name) || 'FILE').toUpperCase())
export const itemColour = (it: Pick<ShelfItem, 'kind' | 'name'>): string => (it.kind === 'link' ? '#3D9BFF' : it.kind === 'text' ? '#FFC23D' : COLOURS[fileExt(it.name)] ?? '#AEB6C2')
/** The name shown on a tile, without the extension for files. */
export const tileName = (it: Pick<ShelfItem, 'kind' | 'name'>): string => (it.kind === 'file' && fileExt(it.name) ? it.name.slice(0, it.name.lastIndexOf('.')) : it.name)

export function formatSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** The small grey line on a tile: a file's size, a link's host or the first words of a note. */
export function itemMeta(it: ShelfItem): string {
  if (it.kind === 'file') return formatSize(it.size_bytes)
  if (it.kind === 'link') { try { return new URL(it.content).host.replace(/^www\./, '') } catch { return 'link' } }
  return `${it.content.length} chars`
}

/** Only web links open. Anything else (javascript:, data:, a bare path) is ignored. */
export const safeUrl = (u: string): string | null => (/^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : null)

/** Pasted or dropped text becomes a link when it is only an address, otherwise a note. */
export function classifyText(text: string): { kind: 'link' | 'text'; name: string; content: string } | null {
  const t = text.trim()
  if (!t) return null
  const url = safeUrl(t)
  if (url) { let host = url; try { host = new URL(url).host.replace(/^www\./, '') } catch { /* keep the address */ } return { kind: 'link', name: host, content: url } }
  return { kind: 'text', name: t.split(/\r?\n/)[0].slice(0, 60), content: t.slice(0, 4000) }
}

/** A file name that is safe inside a storage path: no slashes, no control characters, never empty. */
export function safeFileName(name: string): string {
  const n = name.replace(/[\\/\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 100)
  return n || 'file'
}

/** A plain sentence when a new item can't go on the Shelf, or null when it can. */
export function shelfProblem(count: number, sizeBytes = 0): string | null {
  if (count >= SHELF_MAX) return 'The Shelf is full. Remove something first.'
  if (sizeBytes > MAX_FILE_BYTES) return 'That file is over 20 MB.'
  return null
}

/** The three tiles to show, starting at `offset`, wrapping round. */
export function pageOf<T>(items: readonly T[], offset: number, size = 3): T[] {
  if (items.length <= size) return [...items]
  return Array.from({ length: size }, (_, i) => items[(offset + i) % items.length])
}

/** A clipboard entry from the helper, shaped like a Shelf item so the same tiles show it (card 26). */
export function clipToItem(c: ClipItem): ShelfItem {
  const base = { storage_path: null, size_bytes: null, mime: null, created_at: new Date(c.at * 1000).toISOString() }
  if (c.kind === 'image') return { ...base, id: c.id, kind: 'file', name: `Image ${c.w} × ${c.h}`, content: '', mime: 'image/png' }
  const text = c.text ?? ''
  const link = safeUrl(text)
  const first = text.trim().split(/\r?\n/)[0].slice(0, 60) || 'Empty'
  return { ...base, id: c.id, kind: link ? 'link' : 'text', name: link ?? first, content: text }
}
