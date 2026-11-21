// Card 25: what a sign-in link can carry, and what to do with it. Pure, so it can be unit tested.
// A magic link has three shapes, depending on where it was clicked:
//  - halo://auth#access_token=...&refresh_token=...   the browser followed the email link and Supabase redirected to Halo
//  - https://<project>.supabase.co/auth/v1/verify?token=...&type=magiclink   the link as it sits in the email (pasted)
//  - ...?code=...                                   a PKCE code
// Errors come back as error_description in the query or the hash.

const OTP_TYPES = ['magiclink', 'email', 'signup', 'recovery', 'invite', 'email_change'] as const
export type OtpType = (typeof OTP_TYPES)[number]

export type AuthLink =
  | { kind: 'session'; access_token: string; refresh_token: string }
  | { kind: 'otp'; token_hash: string; type: OtpType }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }

export function parseAuthLink(raw: string): AuthLink | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  const q = u.searchParams
  const h = new URLSearchParams(u.hash.replace(/^#/, ''))
  const get = (k: string) => h.get(k) ?? q.get(k)
  const err = get('error_description') ?? get('error')
  if (err) return { kind: 'error', message: err.replace(/\+/g, ' ') }
  const at = get('access_token'), rt = get('refresh_token')
  if (at && rt) return { kind: 'session', access_token: at, refresh_token: rt }
  const code = get('code')
  if (code) return { kind: 'code', code }
  const hash = get('token_hash') ?? get('token')
  const type = get('type') ?? 'magiclink'
  if (hash && (OTP_TYPES as readonly string[]).includes(type)) return { kind: 'otp', token_hash: hash, type: type as OtpType }
  return null
}

/** Only halo:// links are taken from the app's own link handler. */
export const isHaloLink = (raw: string): boolean => /^halo:\/\//i.test(raw.trim())
