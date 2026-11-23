// Card 24: Music tab rules. Pure, so they can be tested. The wave progress line, the clock text and the plain states.

/** "3:07". Negative and NaN become 0:00. */
export function fmtTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** How far through the song, 0 to 1. Zero when the length is unknown (a live stream). */
export const fraction = (pos: number, dur: number): number => (dur > 0 && Number.isFinite(pos) ? Math.max(0, Math.min(1, pos / dur)) : 0)

/** The wave line: flat to the end, rippling up to the playhead. Flat all over when paused. */
export function wavePath(f: number, playing: boolean, width = 300, mid = 9): string {
  let d = `M0 ${mid}`
  for (let x = 0; x <= width; x += 4) d += ` L${x} ${(mid + (playing && x <= f * width ? Math.sin(x / 7) * 3.2 : 0)).toFixed(2)}`
  return d
}

/**
 * Where the position is now, given the last report from the helper. While it is playing the clock runs on between reports,
 * so the line moves smoothly. It never passes the end.
 */
export function livePosition(pos: number, dur: number, playing: boolean, sinceMs: number): number {
  const p = playing ? pos + sinceMs / 1000 : pos
  return dur > 0 ? Math.min(p, dur) : p
}

export type MusicView =
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'song'; title: string; artist: string; album: string; source: string; playing: boolean; pos: number; dur: number; hasArt: boolean }

export interface MediaLike { available: boolean; title: string; artist: string; album: string; source: string; playing: boolean; position: number; duration: number; has_art: boolean }

/** What the tab shows: the helper is off (null), nothing is playing, or a song. */
export function musicView(m: MediaLike | null): MusicView {
  if (!m) return { kind: 'off' }
  if (!m.available || !m.title) return { kind: 'idle' }
  return { kind: 'song', title: m.title, artist: m.artist, album: m.album, source: m.source || 'Music', playing: m.playing, pos: m.position, dur: m.duration, hasArt: m.has_art }
}

/** "Spotify" from "Spotify.exe", "Chrome" from "chrome.exe" and so on. Anything else is shown as the helper reports it. */
export function sourceName(raw: string): string {
  const s = raw.replace(/\.exe$/i, '').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'Music'
}
