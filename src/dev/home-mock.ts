// Dev only (stripped from production builds): fixtures for the Home tab's weather, battery and music, so screenshots of
// the filled and the empty tab are repeatable. ?home=full or ?home=empty on the ?demo= preview.
import type { HomeSources } from '../panels/homeTab'

const art = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2fa3"/><stop offset="1" stop-color="#3d5afe"/></linearGradient></defs><rect width="88" height="88" fill="url(#g)"/></svg>')

export function homeMock(mode: string): HomeSources {
  if (mode === 'empty') {
    return { weather: async () => null, battery: async () => null, media: async () => null, art: async () => null, control: async () => {} }
  }
  let playing = true
  return {
    weather: async () => ({ temp: 26, desc: 'Showers', chance: 90, hours: [1, 1, 1, 0.7, 0.4, 0.2] }),
    battery: async () => ({ present: true, percent: 74, charging: false, minutes_left: 97 }),
    media: async () => ({ available: true, title: 'MONTAGEM REBOLA', artist: 'ATLXS', album: '', source: 'Spotify', playing, position: 62, duration: 140, has_art: true }),
    art: async () => art,
    control: async () => { playing = !playing },
  }
}
