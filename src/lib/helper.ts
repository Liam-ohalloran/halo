// A small client for the Halo helper (HALO.md 2b), enough for the Home tab: battery, what is playing, play and pause.
// The helper runs on Liam's laptop at 127.0.0.1:47800 and wants the pairing token in X-Halo-Token. The token sits in
// localStorage once it has been pasted in Settings. Without it, or when the helper is not running (the phone, a laptop
// with the helper off), every call answers null so a tab can show a plain state. Card 24 builds the full client.

export const HELPER_URL = 'http://127.0.0.1:47800'
export const HELPER_TOKEN_KEY = 'halo.helperToken'

export interface Battery { present: boolean; percent: number | null; charging: boolean; minutes_left: number | null }
export interface Media { available: boolean; title: string; artist: string; album: string; source: string; playing: boolean; position: number; duration: number; has_art: boolean }

export function helperToken(): string | null {
  try { return localStorage.getItem(HELPER_TOKEN_KEY) } catch { return null }
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = helperToken()
  if (!token) return null
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 2000)
  try {
    const res = await fetch(HELPER_URL + path, { ...init, headers: { 'X-Halo-Token': token }, signal: ctl.signal })
    return res.ok ? res : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function getBattery(): Promise<Battery | null> {
  const r = await call('/battery')
  return r ? ((await r.json()) as Battery) : null
}

export async function getMedia(): Promise<Media | null> {
  const r = await call('/media')
  return r ? ((await r.json()) as Media) : null
}

export async function mediaControl(action: 'toggle' | 'next' | 'previous'): Promise<void> {
  await call(`/media/${action}`, { method: 'POST' })
}

/** The album art as an object URL, or null. The caller owns the URL and should revoke it when it changes. */
export async function getArtUrl(): Promise<string | null> {
  const r = await call('/media/art')
  if (!r) return null
  try { return URL.createObjectURL(await r.blob()) } catch { return null }
}

// ---- Events (card 17) -------------------------------------------------------
// The helper streams what changes on the laptop over /events (server sent events). EventSource can't send the token
// header, so this reads the stream with fetch. It reconnects on its own and stops while the page is hidden.

export interface SseMessage { event: string; data: unknown }

/** Splits a chunk of an event stream into whole messages. Whatever is left over is a half message, keep it for next time. */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = parts.pop() ?? ''
  const messages: SseMessage[] = []
  for (const block of parts) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith(':') || !line) continue
      const i = line.indexOf(':')
      const field = i < 0 ? line : line.slice(0, i)
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (!data.length) continue
    try { messages.push({ event, data: JSON.parse(data.join('\n')) }) } catch { /* not ours */ }
  }
  return { messages, rest }
}

export type HelperEventHandler = (name: string, data: unknown) => void

/**
 * Listens to the helper. Returns a stop function. `onConnection` says whether the stream is up, so the island can
 * hide the music and charging states when the helper isn't running. Without a pairing token it just waits.
 */
export function subscribeEvents(on: HelperEventHandler, onConnection?: (up: boolean) => void): () => void {
  let stopped = false
  let ctl: AbortController | null = null
  let timer = 0
  let wait = 2000
  let up = false
  let busy = false
  const setUp = (v: boolean) => { if (v !== up) { up = v; onConnection?.(v) } }

  async function run() {
    window.clearTimeout(timer)
    if (stopped || document.hidden) return
    const token = helperToken()
    if (!token) { timer = window.setTimeout(run, 30_000); return }
    ctl = new AbortController()
    busy = true
    try {
      const res = await fetch(HELPER_URL + '/events', { headers: { 'X-Halo-Token': token }, signal: ctl.signal })
      if (!res.ok || !res.body) throw new Error('no stream')
      setUp(true)
      wait = 2000
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const { messages, rest } = parseSse(buf)
        buf = rest
        for (const m of messages) on(m.event, m.data)
      }
    } catch { /* closed, refused or aborted: fall through and retry */ }
    busy = false
    setUp(false)
    if (stopped || document.hidden) return
    timer = window.setTimeout(run, wait)
    wait = Math.min(wait * 2, 30_000)
  }
  const onVisible = () => { if (document.hidden) ctl?.abort(); else if (!up && !busy) { wait = 2000; void run() } }
  document.addEventListener('visibilitychange', onVisible)
  void run()
  return () => { stopped = true; window.clearTimeout(timer); ctl?.abort(); document.removeEventListener('visibilitychange', onVisible) }
}
