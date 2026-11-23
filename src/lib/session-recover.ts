// Pure, dependency free helpers for the sign-in screen's startup, so they can be unit tested.

/** What the sign-in screen should do when getSession() found no session. Pure, so it is tested. */
export function shouldWaitForSession(stored: boolean, tries: number, maxTries = 12): boolean {
  return stored && tries < maxTries
}

/**
 * A stored session that could not be refreshed yet (the laptop woke or started before Wi-Fi) is not a sign out.
 * Returns the session once it can be refreshed, or null when there is none or it really is gone.
 */
export async function recoverSession(
  getSession: () => Promise<{ data: { session: unknown | null } }>,
  hasStored: () => Promise<boolean>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<unknown | null> {
  let { data } = await getSession()
  for (let tries = 0; !data.session && shouldWaitForSession(await hasStored(), tries); tries++) {
    await wait(Math.min(2000 + tries * 1000, 8000))
    ;({ data } = await getSession())
  }
  return data.session
}

/**
 * Card 29: who is signed in, read straight from what is stored, with no network. A session that is a few hours old has an access
 * token that has run out, and asking Supabase about it means a refresh over the network. With the Wi-Fi off that wait is the whole
 * start up. The refresh token inside still works the moment the network is back, so a stored session is a signed in session:
 * Halo opens on it now and Supabase finishes the refresh in the background.
 */
export function parseStoredSession(raw: string | null): { email: string } | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    const s = (v && typeof v.currentSession === 'object' && v.currentSession ? v.currentSession : v) as { refresh_token?: unknown; user?: { email?: unknown } | null }
    if (typeof s.refresh_token !== 'string' || !s.refresh_token || !s.user || typeof s.user !== 'object') return null
    return { email: typeof s.user.email === 'string' ? s.user.email : '' }
  } catch { return null }
}
