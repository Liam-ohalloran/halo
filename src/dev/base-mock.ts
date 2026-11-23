// Dev only (stripped from production builds): fixtures for the Base tab and the island's cycle (card 29). ?base=proto uses the exact
// numbers drawn in design/prototype/base-tab.html, so the real tab can be put next to the prototype and compared pixel for pixel.
// ?base=empty has nothing from the helper or the database (every card in its quiet state).
import type { BaseSnapshot } from '../lib/base-data'

const MIN = 60_000
const art = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="68" height="68"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4fb0"/><stop offset=".7" stop-color="#6b3dff"/></linearGradient></defs><rect width="68" height="68" fill="url(#g)"/></svg>')
/** Perth (+08:00) time on Mon 23 Nov 2026 plus `dayOffset` days. */
const perth = (dayOffset: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, 23 + dayOffset, h - 8, m)).toISOString()

export function baseFixture(mode: string): Partial<BaseSnapshot> {
  if (mode === 'empty') {
    return { weather: null, battery: null, media: null, art: null, shift: null, pay: null, test: null, mediaAt: Date.now() }
  }
  return {
    weather: { temp: 24, desc: 'Clear', chance: 0, hours: [0, 0, 0, 0, 0, 0] },
    battery: { present: true, percent: 74, charging: false, minutes_left: 97 },
    media: { available: true, title: 'Montagem Xonada', artist: 'ATLXS', album: '', source: 'Spotify', playing: true, position: 81, duration: 186, has_art: true },
    mediaAt: Date.now(),
    art,
    shift: { id: 'p1', title: 'TUESDAY PI 7:30-12', station: 'PI', starts_at: perth(1, 7, 30), ends_at: perth(1, 12), is_public_holiday: false },
    pay: { gross: 480, hours: 24.8, bars: [55, 0, 70, 0, 85, 100, 60], letters: ['T', 'W', 'T', 'F', 'S', 'S', 'M'] },
    test: { id: 't1', subject: 'Chem', title: 'Unit 1 test', due_at: new Date(Date.parse(perth(0, 8)) + 7 * 24 * 60 * MIN).toISOString() },
  }
}
