// Embedded mode: Halo running inside NotchPixel's web tab. NotchPixel is already the island, so Halo drops
// its own shell, ears, key line and glow and fills the whole viewport instead.
//
// Switched on by ?embed=1 and remembered in localStorage. ?embed=0 turns it off again. A stored flag is
// ignored in an installed home screen app, so the iPhone keeps the normal island.

const KEY = 'halo.embed'
const TOP_KEY = 'halo.embedTop'
export const TOP_MAX = 64
export const TOP_STEP = 4

let cached: boolean | null = null

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v) } catch { /* private mode */ }
}

export function isEmbed(): boolean {
  if (cached !== null) return cached
  const q = new URLSearchParams(location.search).get('embed')
  if (q === '1' || q === 'true') { write(KEY, '1'); cached = true }
  else if (q === '0' || q === 'false') { write(KEY, null); cached = false }
  else {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    cached = read(KEY) === '1' && !standalone
  }
  document.documentElement.classList.toggle('embed', cached)
  return cached
}

const clampTop = (n: number) => Math.min(TOP_MAX, Math.max(0, Math.round(n) || 0))

/** Extra space above the tab bar, in px, in case NotchPixel's own UI overlaps the top. Default 0. */
export function embedTop(): number {
  const q = new URLSearchParams(location.search).get('top')
  if (q !== null && q !== '') write(TOP_KEY, String(clampTop(Number(q))))
  return clampTop(Number(read(TOP_KEY) ?? 0))
}

export function setEmbedTop(n: number): number {
  const v = clampTop(n)
  write(TOP_KEY, String(v))
  document.documentElement.style.setProperty('--embed-top', `${v}px`)
  return v
}
