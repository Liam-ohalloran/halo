// Card 24: the two accent colours of an album cover. Pure (it takes pixels), so it can be tested without a browser.
// The Music tab tints the blurred background and the wave progress with them. The prototype's rule: ignore near black, near white
// and grey pixels, bucket the rest by hue, take the two biggest buckets that are far enough apart, and lift them to a bright, saturated colour.

export interface Rgb { r: number; g: number; b: number }
export const FALLBACK: [string, string] = ['#ff2fa3', '#8b5cff']

function hsl({ r, g, b }: Rgb): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255)
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** `data` is RGBA bytes, as from canvas getImageData. Returns two hex colours, bright and saturated enough to glow on black. */
export function accentsFromPixels(data: ArrayLike<number>): [string, string] {
  interface Bucket { weight: number; px: number; r: number; g: number; b: number }
  const buckets = new Map<number, Bucket>()
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const px = { r: data[i], g: data[i + 1], b: data[i + 2] }
    const [h, s, l] = hsl(px)
    if (l < 0.12 || l > 0.92 || s < 0.25) continue
    const key = Math.floor(h / 20)
    const b = buckets.get(key) ?? { weight: 0, px: 0, r: 0, g: 0, b: 0 }
    b.weight += s * (1 - Math.abs(l - 0.5)) // vivid, mid light pixels count for more
    b.px++; b.r += px.r; b.g += px.g; b.b += px.b
    buckets.set(key, b)
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1].weight - a[1].weight)
  if (!ranked.length) return FALLBACK
  const colour = (v: Bucket) => {
    const [h, s] = hsl({ r: v.r / v.px, g: v.g / v.px, b: v.b / v.px })
    return fromHsl(h, Math.max(0.7, Math.min(1, s * 1.15)), 0.58)
  }
  const first = ranked[0]
  const farEnough = (k: number) => { const d = Math.abs(k - first[0]); return Math.min(d, 18 - d) >= 2 }
  const second = ranked.find(([k]) => k !== first[0] && farEnough(k)) ?? ranked[1]
  const a = colour(first[1])
  if (!second) return [a, fromHsl((hsl(hexToRgb(a))[0] + 40) % 360, 0.85, 0.6)]
  return [a, colour(second[1])]
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Reads the cover in the browser (a small canvas) and returns its accents. The fallback when the image can't be read. */
export async function accentsFromUrl(url: string): Promise<[string, string]> {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = 40
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return FALLBACK
    ctx.drawImage(img, 0, 0, 40, 40)
    return accentsFromPixels(ctx.getImageData(0, 0, 40, 40).data)
  } catch {
    return FALLBACK
  }
}
