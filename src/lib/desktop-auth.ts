import type { SupabaseClient } from '@supabase/supabase-js'
import { parseAuthLink, type AuthLink } from './auth-link'

// Card 25: a halo:// link from the magic link email opens Halo (the app registers the scheme) and signs it in.
// The link can arrive while the page loads (the app was started by the link) or later (the app was running), so the
// page asks for a waiting link once and also listens for new ones.

interface TauriGlobal {
  core: { invoke: <T = unknown>(cmd: string) => Promise<T> }
  event: { listen: <T = unknown>(name: string, cb: (e: { payload: T }) => void) => Promise<() => void> }
}
const tauri = (): TauriGlobal | null => (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null

const EXPIRED = 'That link has expired. Send a new one.'

/** Sign in with whatever the link carries. Returns a sentence for the sign-in screen, or null when it worked. */
export async function signInWithLink(client: SupabaseClient, link: AuthLink): Promise<string | null> {
  if (link.kind === 'error') return /expired|invalid/i.test(link.message) ? EXPIRED : 'That link did not work. Send a new one.'
  const res = link.kind === 'session' ? await client.auth.setSession({ access_token: link.access_token, refresh_token: link.refresh_token })
    : link.kind === 'otp' ? await client.auth.verifyOtp({ token_hash: link.token_hash, type: link.type as 'magiclink' | 'email' })
    : await client.auth.exchangeCodeForSession(link.code)
  return res.error ? EXPIRED : null
}

/** Listen for halo:// sign-in links. `onError` shows a sentence on the sign-in screen. Returns a stop function. */
export function watchAuthLinks(client: SupabaseClient, onError: (msg: string) => void): () => void {
  const t = tauri()
  if (!t) return () => {}
  const handle = async (raw: string | null) => {
    const link = raw ? parseAuthLink(raw) : null
    if (!link) return
    const err = await signInWithLink(client, link)
    if (err) onError(err)
  }
  void t.core.invoke<string | null>('take_auth_url').then(handle).catch(() => {})
  const off = t.event.listen<string>('halo-auth', (e) => void handle(e.payload))
  return () => void off.then((f) => f())
}
