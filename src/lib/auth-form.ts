// Sign-in form rules and wording. Pure, so they can be unit tested. Nothing here reads, logs or stores a password.

export const MIN_PASSWORD = 8
export const EMAIL_KEY = 'halo.email'

/** A sentence when the password is not acceptable, or null when it is. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  return null
}

/** Plain words for whatever Supabase said, never the raw message. */
export function signInError(message: string): string {
  if (/invalid login|invalid credentials/i.test(message)) return 'Wrong email or password. No password yet? Email me a link.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first. Use the link instead.'
  if (/rate|too many|seconds/i.test(message)) return 'Too many tries. Wait a minute, then try again.'
  if (/fetch|network/i.test(message)) return "Can't reach Halo. Check your connection and try again."
  if (/expired|invalid/i.test(message)) return 'That link has expired. Send a new one.'
  return 'Something went wrong. Try again.'
}

export function passwordSaveError(message: string): string {
  if (/same|different from the old/i.test(message)) return 'That is already your password. Pick a new one.'
  if (/weak|short|characters/i.test(message)) return `Use at least ${MIN_PASSWORD} characters.`
  if (/rate|too many|seconds/i.test(message)) return 'Too many tries. Wait a minute, then try again.'
  if (/fetch|network/i.test(message)) return "Can't reach Halo. Check your connection and try again."
  if (/session|jwt|not authenticated/i.test(message)) return 'Sign in again, then try once more.'
  return 'Could not save that. Try again.'
}

/** The last email used, so the next sign-in starts filled in. Only the email is ever kept. */
export function savedEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? '' } catch { return '' }
}
export function rememberEmail(email: string): void {
  try { if (email) localStorage.setItem(EMAIL_KEY, email) } catch { /* private mode */ }
}
