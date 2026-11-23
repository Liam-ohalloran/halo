// Card 28: what the Settings row for updates says and does. Pure, so the wording and the steps can be tested.

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'available'; version: string }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string }

export interface UpdateRow { label: string; sub: string; button: string | null; busy: boolean }

/** The row: the version line, a short status and the one button that makes sense now. */
export function updateRow(current: string, s: UpdateState): UpdateRow {
  const label = current ? `Halo ${current}` : 'Halo'
  switch (s.kind) {
    case 'idle': return { label, sub: 'Checks for updates when it starts', button: 'Check for updates', busy: false }
    case 'checking': return { label, sub: 'Looking for an update', button: null, busy: true }
    case 'latest': return { label, sub: 'You have the newest Halo', button: 'Check again', busy: false }
    case 'available': return { label, sub: `Halo ${s.version} is ready`, button: 'Install and restart', busy: false }
    case 'installing': return { label, sub: `Installing Halo ${s.version}, then restarting`, button: null, busy: true }
    case 'error': return { label, sub: s.message, button: 'Try again', busy: false }
  }
}

/** True when `a` is a newer version than `b` ("0.10.0" is newer than "0.9.0"). Anything that is not numbers is never newer. */
export function isNewer(a: string, b: string): boolean {
  const p = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10))
  const x = p(a), y = p(b)
  if (x.some(Number.isNaN) || y.some(Number.isNaN)) return false
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

/** "v0.2.0" (a release tag) to "0.2.0". Null for a tag that is not a plain version, so a stray tag never builds a release. */
export function versionFromTag(tag: string): string | null {
  const m = /^v(\d+\.\d+\.\d+)$/.exec(tag.trim())
  return m ? m[1] : null
}
