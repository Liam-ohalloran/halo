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
