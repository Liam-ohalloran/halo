// Card 24: a pretend Halo helper for the browser checks. Answers the helper's endpoints from Playwright, so the Music, Controls,
// Audio and Launch tabs can be checked with the helper "on" without Windows. Records every change the page sends.
import { deflateSync } from 'node:zlib'

/** A small PNG (a pink to blue diagonal), made here so no image file has to be kept. */
export function coverPng(w = 96, h = 96) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h), o = y * (w * 4 + 1) + 1 + x * 4
      raw[o] = Math.round(255 * (1 - t) + 40 * t); raw[o + 1] = Math.round(47 * (1 - t) + 90 * t); raw[o + 2] = Math.round(163 * (1 - t) + 255 * t); raw[o + 3] = 255
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** A small coloured PNG as a data URL, a different colour for each name, standing in for a real icon. */
const iconCache = new Map()
export function iconUrl(key) {
  if (!iconCache.has(key)) iconCache.set(key, 'data:image/png;base64,' + coverPng(48, 48).toString('base64'))
  return iconCache.get(key)
}

export const defaultState = () => ({
  media: { available: true, title: 'MONTAGEM XONADA', artist: 'ATLXS', album: 'MONTAGEM XONADA', source: 'Spotify', playing: true, position: 81, duration: 187, has_art: true },
  volume: { level: 42, muted: false }, brightness: { level: 68 },
  wifi: { enabled: true, connected: true, ssid: 'Newman-Home' }, bluetooth: { enabled: true, connected_device: 'WH-CH720N' },
  battery: { present: true, percent: 74, charging: false, minutes_left: 97 }, power: { mode: 'balanced' },
  mic: { muted: false, level: 0.22 },
  outputs: { current: 'Speakers (Realtek)', can_switch: true, outputs: [{ id: 'o1', name: 'Speakers (Realtek)', kind: 'speakers', current: true }, { id: 'o2', name: 'WH-CH720N', kind: 'headphones', current: false }, { id: 'o3', name: 'LG monitor', kind: 'monitor', current: false }] },
  /** App names that have no icon, so the letter tile shows. */
  noIcon: ['Notepad'],
  switchFails: false,
  apps: [{ id: 'spotify', name: 'Spotify', level: 80, muted: false }, { id: 'chrome', name: 'Chrome', level: 55, muted: false }, { id: 'discord', name: 'Discord', level: 35, muted: false }, { id: 'teams', name: 'Teams', level: 60, muted: false }],
  startApps: ['Spotify', 'Chrome', 'Claude', 'Terminal', 'Obsidian', 'TickTick', 'Teams', 'OneNote', 'Outlook', 'Canva', 'Figma', 'Notepad', 'Paint', 'Calculator'].map((n) => ({ id: `${n}.lnk`, name: n })),
})

/**
 * Install the pretend helper on a page. `state` is changed by the page's own POSTs (so a slider stays where it was dragged) and
 * `log` collects them as [path, body]. Pass `up: false` for the "helper off" look: no token, so the page never asks.
 */
export async function mockHelper(page, { state = defaultState(), up = true } = {}) {
  const log = []
  if (!up) return { state, log }
  await page.addInitScript(() => { try { localStorage.setItem('halo.helperToken', 'test-token') } catch { /* ignore */ } })
  await page.route('http://127.0.0.1:47800/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const body = req.postData() ? JSON.parse(req.postData()) : undefined
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-private-network': 'true' }
    const json = (o) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': '*' } })
    if (req.method() === 'POST') log.push([path, body])
    switch (true) {
      case path === '/status': return json({ ok: true, not_supported: ['focus'] })
      case path === '/media': return json(state.media)
      case path === '/media/art': return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: coverPng() })
      case path === '/media/toggle': state.media.playing = !state.media.playing; return json({ ok: true })
      case path.startsWith('/media/'): return json({ ok: true })
      case path === '/volume': if (body) state.volume.level = body.level; return json(state.volume)
      case path === '/mute': state.volume.muted = body?.muted ?? !state.volume.muted; return json(state.volume)
      case path === '/brightness': if (body) state.brightness.level = body.level; return json(state.brightness)
      case path === '/wifi': if (body) state.wifi.enabled = body.enabled; return json(state.wifi)
      case path === '/bluetooth': if (body) state.bluetooth.enabled = body.enabled; return json(state.bluetooth)
      case path === '/battery': return json(state.battery)
      case path === '/power-mode': if (body) state.power.mode = body.mode; return json(state.power)
      case path === '/mic': return json(state.mic)
      case path === '/mic/mute': state.mic.muted = body?.muted ?? !state.mic.muted; return json(state.mic)
      case path === '/outputs': return json(state.outputs)
      case path === '/outputs/default': {
        if (state.switchFails) return route.fulfill({ status: 503, headers: cors, body: '{"detail":"Switch in Windows."}' })
        for (const o of state.outputs.outputs) o.current = o.id === body.id
        state.outputs.current = state.outputs.outputs.find((o) => o.current).name
        state.outputs.outputs.sort((a, b) => Number(b.current) - Number(a.current))
        return json(state.outputs)
      }
      case path === '/launch/icon': { const id = new URL(req.url()).searchParams.get('id') ?? ''; if (state.noIcon.some((n) => id.startsWith(n))) return route.fulfill({ status: 503, headers: cors, body: '{}' }); return json({ icon: iconUrl(id) }) }
      case path === '/launch/favicon': return json({ icon: iconUrl(new URL(req.url()).searchParams.get('url') ?? '') })
      case path === '/apps/volume': return json({ apps: state.apps })
      case path.startsWith('/apps/volume/'): { const a = state.apps.find((x) => x.id === decodeURIComponent(path.split('/').pop())); if (a) a.level = body.level; return json({ apps: state.apps }) }
      case path === '/launch/apps': return json({ apps: state.startApps })
      case path === '/launch/app' || path === '/launch/url': return json({ ok: true })
      case path === '/events': return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: '' })
      default: return route.fulfill({ status: 404, headers: cors, body: '{}' })
    }
  })
  return { state, log }
}
