// A small client for the Halo helper (HALO.md 2b), enough for the Home tab: battery, what is playing, play and pause.
// The helper runs on Liam's laptop at 127.0.0.1:47800 and wants the pairing token in X-Halo-Token. The token sits in
// localStorage once it has been pasted in Settings. Without it, or when the helper is not running (the phone, a laptop
// with the helper off), every call answers null so a tab can show a plain state. Card 24 builds the full client.

export const HELPER_URL = 'http://127.0.0.1:47800'
export const HELPER_TOKEN_KEY = 'halo.helperToken'

export interface Battery { present: boolean; percent: number | null; charging: boolean; minutes_left: number | null }
export interface Media { available: boolean; title: string; artist: string; album: string; source: string; playing: boolean; position: number; duration: number; has_art: boolean }

// Inside the Halo desktop app (card 26) the helper is bundled: the app starts it, picks its port and keeps the pairing
// token in the Windows Credential Manager, then gives both to the page. Nobody pastes a token there.
let connection: { url: string; token: string } | null = null
export function setHelperConnection(c: { url: string; token: string } | null) { connection = c }
export const helperBase = (): string => connection?.url ?? HELPER_URL

export function helperToken(): string | null {
  if (connection) return connection.token
  try { return localStorage.getItem(HELPER_TOKEN_KEY) } catch { return null }
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = helperToken()
  if (!token) return null
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 2000)
  try {
    const res = await fetch(helperBase() + path, { ...init, headers: { 'X-Halo-Token': token, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, signal: ctl.signal })
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

export interface Volume { level: number; muted: boolean }
export async function getVolume(): Promise<Volume | null> {
  const r = await call('/volume')
  return r ? ((await r.json()) as Volume) : null
}
export async function setVolume(level: number): Promise<void> {
  await call('/volume', { method: 'POST', body: JSON.stringify({ level: Math.max(0, Math.min(100, Math.round(level))) }) })
}

// ---- Windows notifications (card 26) ----------------------------------------
/** 'allowed', 'denied' or 'unspecified' (Windows has not been asked yet), or null when there is no helper. */
export async function notificationAccess(): Promise<string | null> {
  const r = await call('/notifications/access')
  return r ? ((await r.json()) as { access: string }).access : null
}
/** Windows shows its own question. Halo reads nothing until Liam says yes there. */
export async function requestNotificationAccess(): Promise<string | null> {
  const r = await call('/notifications/request', { method: 'POST' })
  return r ? ((await r.json()) as { access: string }).access : null
}

// ---- Clipboard history (card 26) --------------------------------------------
export interface ClipItem { id: string; kind: 'text' | 'image'; text?: string; chars?: number; w?: number; h?: number; thumb?: string; at: number }
let clipboardOn = true
/** Card 27: switch the clipboard history on or off. Off, the helper stops keeping copies and forgets the ones it has. */
export function setClipboardOn(on: boolean): void {
  if (on === clipboardOn) return
  clipboardOn = on
  void call('/clipboard/enabled', { method: 'POST', body: JSON.stringify({ on }) })
}
export const clipboardEnabled = (): boolean => clipboardOn
export async function getClipboard(): Promise<{ revision: number; items: ClipItem[] } | null> {
  if (!clipboardOn) return null
  const r = await call('/clipboard')
  return r ? ((await r.json()) as { revision: number; items: ClipItem[] }) : null
}
/** Puts a kept item back on the clipboard. */
export async function copyClipboardItem(id: string): Promise<boolean> {
  return (await call(`/clipboard/${encodeURIComponent(id)}/copy`, { method: 'POST' })) !== null
}

// ---- Card 24: Music, Controls, Audio and Launch ------------------------------
const get = async <T>(path: string): Promise<T | null> => { const r = await call(path); try { return r ? ((await r.json()) as T) : null } catch { return null } }
const post = async <T>(path: string, body?: unknown): Promise<T | null> => { const r = await call(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }); try { return r ? ((await r.json()) as T) : null } catch { return null } }

/** The helper is there and the page has its token. False on the phone, or with the helper off. */
export async function helperUp(): Promise<boolean> { return (await get<{ ok: boolean }>('/status'))?.ok === true }

export const seekMedia = (seconds: number) => post('/media/seek', { seconds })
export const setMuted = (muted?: boolean) => post<Volume>('/mute', muted === undefined ? undefined : { muted })
export const getBrightness = () => get<{ level: number }>('/brightness')
export const setBrightness = (level: number) => post<{ level: number }>('/brightness', { level: Math.round(level) })
export interface Wifi { enabled: boolean; connected: boolean; ssid: string | null }
export interface Bluetooth { enabled: boolean; connected_device: string | null }
export const getWifi = () => get<Wifi>('/wifi')
export const setWifi = (enabled: boolean) => post<Wifi>('/wifi', { enabled })
export const getBluetooth = () => get<Bluetooth>('/bluetooth')
export const setBluetooth = (enabled: boolean) => post<Bluetooth>('/bluetooth', { enabled })
export type PowerMode = 'battery' | 'balanced' | 'performance'
export const getPowerMode = () => get<{ mode: PowerMode }>('/power-mode')
export const setPowerMode = (mode: PowerMode) => post<{ mode: PowerMode }>('/power-mode', { mode })

export interface AppVolume { id: string; name: string; level: number; muted: boolean }
export const getAppVolumes = () => get<{ apps: AppVolume[] }>('/apps/volume')
export const setAppVolume = (id: string, level: number) => post<{ apps: AppVolume[] }>(`/apps/volume/${encodeURIComponent(id)}`, { level: Math.round(level) })
export interface MicState { muted: boolean; level: number }
export const getMic = () => get<MicState>('/mic')
export const setMicMuted = (muted?: boolean) => post<MicState>('/mic/mute', muted === undefined ? undefined : { muted })
export interface Output { id: string; name: string; kind: 'speakers' | 'headphones' | 'monitor'; current: boolean }
export const getOutputs = () => get<{ current: string; outputs: Output[]; can_switch?: boolean }>('/outputs')
/** Make this output the default for apps and media. Null when Windows refused: the page says "Switch in Windows". */
export const setDefaultOutput = (id: string) => post<{ current: string; outputs: Output[]; can_switch?: boolean }>('/outputs/default', { id })

// Launch icons: an app's own icon and a site's favicon, 64 px PNG data URLs from the helper. Kept for the life of the page, misses too.
const iconCache = new Map<string, Promise<string | null>>()
const icon = (key: string, path: string): Promise<string | null> => {
  let p = iconCache.get(key)
  if (!p) { p = get<{ icon: string }>(path).then((r) => r?.icon ?? null); iconCache.set(key, p) }
  return p
}
export const getAppIcon = (id: string) => icon(`app:${id}`, `/launch/icon?id=${encodeURIComponent(id)}`)
export const getFavicon = (url: string) => icon(`site:${url}`, `/launch/favicon?url=${encodeURIComponent(url)}`)
export interface StartApp { id: string; name: string }
export const getStartApps = () => get<{ apps: StartApp[] }>('/launch/apps')
export const launchUrl = async (url: string): Promise<boolean> => (await post('/launch/url', { url })) !== null
export const launchStartApp = async (id: string): Promise<boolean> => (await post('/launch/app', { id })) !== null

// Other parts of the page (the Shelf tab) hear the helper's events too, without opening a second stream.
type Listener = (name: string, data: unknown) => void
const listeners = new Set<Listener>()
export function onHelperEvent(cb: Listener): () => void { listeners.add(cb); return () => listeners.delete(cb) }

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
      const res = await fetch(helperBase() + '/events', { headers: { 'X-Halo-Token': token }, signal: ctl.signal })
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
        for (const m of messages) { listeners.forEach((l) => l(m.event, m.data)); on(m.event, m.data) }
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
