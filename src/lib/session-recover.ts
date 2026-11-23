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
