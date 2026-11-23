// Card 29: "Base background". Liam can pick his own photo for the Base tab. It is stored on this device only (localStorage as a
// small JPEG), never sent anywhere. A picked photo is scaled down to 1400 px wide first so it fits and stays quick to paint.

const KEY = 'halo.basePhoto'
/** The photo that ships with Halo (public/base/night.jpg). */
export const defaultPhotoUrl = (): string => `${import.meta.env.BASE_URL}base/night.jpg`

type Listener = () => void
const subs = new Set<Listener>()
export const onPhotoChange = (cb: Listener): (() => void) => { subs.add(cb); return () => subs.delete(cb) }

/** The saved photo as a data URL, or null for the one that ships with Halo. */
export function savedPhoto(): string | null {
  try {
    const v = localStorage.getItem(KEY)
    return v && v.startsWith('data:image/') ? v : null
  } catch {
    return null
  }
}

/** What the tab paints: the saved photo, or the shipped one. */
export const photoUrl = (): string => savedPhoto() ?? defaultPhotoUrl()

export function clearPhoto(): void {
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
  subs.forEach((f) => f())
}

/** Largest width kept. The prototype's own photo is 1400 px wide. */
export const MAX_W = 1400

/** Scale a size down so the width is at most MAX_W, keeping the shape. Pure, so it can be tested. */
export function fitSize(w: number, h: number, maxW = MAX_W): { w: number; h: number } {
  if (w <= maxW) return { w, h }
  return { w: maxW, h: Math.max(1, Math.round((h * maxW) / w)) }
}

/**
 * Save a picked image file. Resolves to a sentence when it could not be saved, or null when it worked.
 * Needs a browser (canvas), so it is not unit tested.
 */
export async function setPhotoFromFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return 'That is not a picture. Pick a JPEG or PNG.'
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch { return "Halo couldn't open that picture. Try another one." }
  const { w, h } = fitSize(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) { bmp.close(); return "Halo couldn't use that picture. Try another one." }
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  let url = c.toDataURL('image/jpeg', 0.82)
  if (url.length > 1_800_000) url = c.toDataURL('image/jpeg', 0.6)
  try { localStorage.setItem(KEY, url) } catch { return 'That picture is too big to keep on this device. Try a smaller one.' }
  subs.forEach((f) => f())
  return null
}
