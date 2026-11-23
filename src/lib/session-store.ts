// Where Supabase keeps the session.
//
// Web and phone: Supabase's own localStorage (persistSession and autoRefreshToken stay on).
// Desktop app: the Windows Credential Manager, through the app's secret_* commands. localStorage in the app belongs to one
// web origin (tauri.localhost for the installed app, localhost:<port> for `desktop:dev`), so a rebuild or a different dev
// port started with an empty session and asked to sign in again. The credential store is the same for every build.
// A session already in localStorage moves over the first time it is read, so nobody is signed out by this change.

import type { SupportedStorage } from '@supabase/supabase-js'
import { isDesktop } from './desktop'
export { recoverSession, shouldWaitForSession } from './session-recover'

interface TauriGlobal { core: { invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T> } }
const tauri = (): TauriGlobal | null => (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null

const ls = {
  get: (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* private mode */ } },
}

/** True when this page is the desktop app and the secure store is reachable. */
const secure = (): TauriGlobal | null => (isDesktop() ? tauri() : null)

export const sessionStorageAdapter: SupportedStorage = {
  async getItem(key) {
    const t = secure()
    if (!t) return ls.get(key)
    try {
      const v = await t.core.invoke<string | null>('secret_get', { key })
      if (v) return v
      const old = ls.get(key) // an older build kept the session here
      if (old) {
        await t.core.invoke('secret_set', { key, value: old })
        ls.del(key)
      }
      return old
    } catch {
      return ls.get(key) // the store could not be read: never turn that into a sign out
    }
  },
  async setItem(key, value) {
    const t = secure()
    if (!t) return ls.set(key, value)
    try {
      await t.core.invoke('secret_set', { key, value })
      ls.del(key)
    } catch {
      ls.set(key, value) // better a session in localStorage than none
    }
  },
  async removeItem(key) {
    const t = secure()
    ls.del(key)
    if (t) { try { await t.core.invoke('secret_delete', { key }) } catch { /* nothing stored */ } }
  },
}

/** Is a session stored for this key? (Supabase removes it itself when the server says the token is dead.) */
export async function hasStoredSession(key: string): Promise<boolean> {
  try { return Boolean(await sessionStorageAdapter.getItem(key)) } catch { return false }
}
