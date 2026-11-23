import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DRAG_MS, FALLBACK_POLL_MS, createActions, createCatchUp, createDragSender, createFallbackPoll, stepLevel, type Clock } from '../src/lib/optimistic.ts'
import { audioPatch } from '../src/lib/audio.ts'
import { controlsPatch, tapText } from '../src/lib/controls.ts'
import { createConnectivity, isNetworkError } from '../src/lib/connectivity.ts'
import { PREFIX, cacheKey, clearReadCache, readThrough, withReadCache, type KV } from '../src/lib/offline-cache.ts'
import { parseStoredSession } from '../src/lib/session-recover.ts'

// A clock the test moves by hand, so 50 ms means exactly 50 ms.
function fakeClock() {
  let t = 1000
  let id = 0
  const q: { id: number; at: number; fn: () => void }[] = []
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => { const e = { id: ++id, at: t + ms, fn }; q.push(e); return e.id as unknown as ReturnType<typeof setTimeout> },
    clearTimeout: (h) => { const i = q.findIndex((e) => e.id === (h as unknown as number)); if (i >= 0) q.splice(i, 1) },
  }
  const tick = async (ms: number) => {
    const end = t + ms
    for (;;) {
      q.sort((a, b) => a.at - b.at)
      const next = q[0]
      if (!next || next.at > end) break
      q.shift()
      t = Math.max(t, next.at)
      next.fn()
      await settle()
    }
    t = end
    await settle()
  }
  return { clock, tick }
}
const settle = () => new Promise<void>((r) => setImmediate(r))
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

// ---- drags: one request per 50 ms, last value wins --------------------------------------------------------------------

test('the first value of a drag goes out at once, the rest wait for the next 50 ms slot and only the last one is sent', async () => {
  const { clock, tick } = fakeClock()
  const sent: [number, number][] = []
  const s = createDragSender<number, number>({ clock, send: async (v) => { sent.push([clock.now(), v]); return v } })
  s.push(10)
  await settle()
  assert.deepEqual(sent.map(([, v]) => v), [10])
  for (const v of [11, 12, 13, 14, 15]) { s.push(v); await tick(5) }
  assert.deepEqual(sent.map(([, v]) => v), [10], 'nothing more inside the 50 ms')
  await tick(DRAG_MS)
  assert.deepEqual(sent.map(([, v]) => v), [10, 15], 'the newest value, once')
  assert.ok(sent[1][0] - sent[0][0] >= DRAG_MS, 'at least 50 ms apart')
})

test('a hundred pushes in a second make about twenty requests, never overlapping', async () => {
  const { clock, tick } = fakeClock()
  let inFlight = 0, worst = 0, count = 0
  const s = createDragSender<number, number>({ clock, send: async (v) => { count++; inFlight++; worst = Math.max(worst, inFlight); await new Promise((r) => setImmediate(r)); inFlight--; return v } })
  for (let i = 0; i < 100; i++) { s.push(i); await tick(10) }
  await tick(200)
  assert.ok(count <= 21 && count >= 15, `${count} requests`)
  assert.equal(worst, 1)
})

test('a slow answer holds the next request, and the newest value goes out when it arrives', async () => {
  const { clock, tick } = fakeClock()
  const gates: { v: number; d: ReturnType<typeof deferred<number>> }[] = []
  const s = createDragSender<number, number>({ clock, send: (v) => { const d = deferred<number>(); gates.push({ v, d }); return d.promise } })
  s.push(1)
  await tick(200)
  s.push(2); s.push(3)
  await tick(500)
  assert.equal(gates.length, 1, 'the first request has not been answered, so nothing else is sent')
  assert.equal(s.busy, true)
  gates[0].d.resolve(1)
  await tick(60)
  assert.deepEqual(gates.map((g) => g.v), [1, 3])
})

test('flush sends what is waiting now, and an old answer does not pull the control back', async () => {
  const { clock, tick } = fakeClock()
  const replies: number[] = []
  const sent: number[] = []
  const s = createDragSender<number, number>({ clock, send: async (v) => { sent.push(v); return v }, onReply: (r) => replies.push(r) })
  s.push(1) // out and not answered yet
  s.push(2); s.push(3)
  s.flush()
  await tick(0)
  assert.deepEqual(sent, [1, 3])
  assert.deepEqual(replies, [3], 'the reply to 1 arrived while 3 was waiting, so it was dropped')
  assert.equal(s.busy, false)
})

test('a failed send says which value failed', async () => {
  const { clock, tick } = fakeClock()
  const failed: number[] = []
  const s = createDragSender<number, number>({ clock, send: async () => null, onFail: (v) => failed.push(v) })
  s.push(42)
  await tick(0)
  assert.deepEqual(failed, [42])
  assert.equal(s.busy, false)
})

test('a send that throws counts as a failure', async () => {
  const { clock, tick } = fakeClock()
  const failed: number[] = []
  const s = createDragSender<number, number>({ clock, send: () => Promise.reject(new Error('down')), onFail: (v) => failed.push(v) })
  s.push(7)
  await tick(0)
  assert.deepEqual(failed, [7])
})

test('stepLevel stays between 0 and 100', () => {
  assert.equal(stepLevel(98, 5), 100)
  assert.equal(stepLevel(3, -5), 0)
  assert.equal(stepLevel(50, 5), 55)
})

// ---- taps: drawn first, rolled back on a no -----------------------------------------------------------------------------

test('a tap is drawn before the helper answers, and settled by the answer', async () => {
  const { clock } = fakeClock()
  const a = createActions(clock)
  const log: string[] = []
  const d = deferred<{ on: boolean; ssid: string }>()
  const done = a.run('wifi', { prev: 'off', next: 'on', apply: (v) => log.push(`draw ${v}`), send: () => d.promise, reconcile: (r) => log.push(`helper says ${r.ssid}`), fail: () => log.push('shake') })
  assert.deepEqual(log, ['draw on'], 'on screen before any answer')
  assert.equal(a.settling('wifi'), true)
  d.resolve({ on: true, ssid: 'Home' })
  assert.equal(await done, true)
  assert.deepEqual(log, ['draw on', 'helper says Home'])
})

test('a no puts the control back and shakes it', async () => {
  const { clock } = fakeClock()
  const a = createActions(clock)
  const log: string[] = []
  const ok = await a.run('mute', { prev: false, next: true, apply: (v) => log.push(`draw ${v}`), send: async () => null, fail: () => log.push('shake') })
  assert.equal(ok, false)
  assert.deepEqual(log, ['draw true', 'draw false', 'shake'])
})

test('only the newest tap rolls back, so a second tap is not undone by the first one failing', async () => {
  const { clock } = fakeClock()
  const a = createActions(clock)
  const log: string[] = []
  const first = deferred<null>()
  const p1 = a.run('bt', { prev: 'off', next: 'on', apply: (v) => log.push(`draw ${v}`), send: () => first.promise, fail: () => log.push('shake1') })
  const p2 = a.run('bt', { prev: 'on', next: 'off', apply: (v) => log.push(`draw ${v}`), send: async () => ({ ok: true }), fail: () => log.push('shake2') })
  first.resolve(null)
  await Promise.all([p1, p2])
  assert.deepEqual(log, ['draw on', 'draw off'], 'no rollback and no shake from the stale tap')
})

test('pushed values for a control wait while its tap is out and for a moment after, then flow again', async () => {
  const { clock, tick } = fakeClock()
  const a = createActions(clock, 900)
  const d = deferred<{ ok: true }>()
  const p = a.run('wifi', { prev: 0, next: 1, apply: () => {}, send: () => d.promise })
  assert.equal(a.settling('wifi'), true)
  d.resolve({ ok: true })
  await p
  assert.equal(a.settling('wifi'), true, 'an older event may still be on its way')
  await tick(899)
  assert.equal(a.settling('wifi'), true)
  await tick(2)
  assert.equal(a.settling('wifi'), false)
  assert.equal(a.settling('bt'), false, 'other controls are not held')
})

// ---- the 10 second fallback poll ----------------------------------------------------------------------------------------

test('polling only happens while the panel is on screen and the stream is down, every 10 seconds', async () => {
  const { clock, tick } = fakeClock()
  let polls = 0
  let up = true
  let visible = true
  const p = createFallbackPoll({ clock, refresh: () => { polls++ }, onScreen: () => visible, streamUp: () => up })
  await tick(FALLBACK_POLL_MS * 3)
  assert.equal(polls, 0, 'the stream is up: no polling at all')
  up = false
  await tick(FALLBACK_POLL_MS)
  assert.equal(polls, 1)
  visible = false
  await tick(FALLBACK_POLL_MS * 2)
  assert.equal(polls, 1, 'hidden panels do not poll')
  visible = true
  await tick(FALLBACK_POLL_MS)
  assert.equal(polls, 2)
  p.stop()
  await tick(FALLBACK_POLL_MS * 3)
  assert.equal(polls, 2)
  assert.equal(FALLBACK_POLL_MS, 10_000)
})

// ---- pushed events ------------------------------------------------------------------------------------------------------

test('every state the helper pushes reaches the Controls tab', () => {
  assert.deepEqual(controlsPatch('volume', { level: 30, muted: true }), { kind: 'volume', value: { level: 30, muted: true } })
  assert.deepEqual(controlsPatch('brightness', { level: 61 }), { kind: 'brightness', level: 61 })
  assert.deepEqual(controlsPatch('wifi', { enabled: true, connected: true, ssid: 'Home' }), { kind: 'wifi', value: { enabled: true, connected: true, ssid: 'Home' } })
  assert.deepEqual(controlsPatch('bluetooth', { enabled: false, connected_device: null }), { kind: 'bluetooth', value: { enabled: false, connected_device: null } })
  assert.deepEqual(controlsPatch('battery', { present: true, percent: 80, charging: true, minutes_left: null }), { kind: 'battery', value: { present: true, percent: 80, charging: true, minutes_left: null } })
  assert.deepEqual(controlsPatch('power', { mode: 'performance' }), { kind: 'power', mode: 'performance' })
  assert.deepEqual(controlsPatch('output', { name: 'Speakers', kind: 'speakers' }), { kind: 'output', name: 'Speakers' })
  assert.deepEqual(controlsPatch('night', { on: true }), { kind: 'night', on: true })
  assert.equal(controlsPatch('power', { mode: 'turbo' }), null, 'a mode Halo has no button for is ignored')
  assert.equal(controlsPatch('volume', 'x'), null)
  assert.equal(controlsPatch('media', { title: 'x' }), null)
})

test('every state the helper pushes reaches the Audio tab, the mic meter included', () => {
  assert.deepEqual(audioPatch('volume', { level: 10, muted: false }), { kind: 'volume', value: { level: 10, muted: false } })
  assert.deepEqual(audioPatch('mic', { muted: true }), { kind: 'mic', muted: true })
  assert.deepEqual(audioPatch('mic_level', { level: 0.5 }), { kind: 'mic_level', level: 0.5 })
  assert.deepEqual(audioPatch('mic_level', { level: 3 }), { kind: 'mic_level', level: 1 }, 'kept between 0 and 1')
  assert.deepEqual(audioPatch('output', { name: 'x', kind: 'speakers' }), { kind: 'output' })
  const apps = [{ id: 'spotify', name: 'Spotify', level: 80, muted: false }]
  assert.deepEqual(audioPatch('apps', { apps: [...apps, { nope: 1 }] }), { kind: 'apps', apps })
  assert.equal(audioPatch('brightness', { level: 1 }), null)
})

test('a tapped tile says what it will say before the helper answers', () => {
  assert.equal(tapText('wifi', true), 'On')
  assert.equal(tapText('bt', false), 'Off')
  assert.equal(tapText('mute', true), 'Silenced')
})

// ---- offline ------------------------------------------------------------------------------------------------------------

const memory = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), keys: () => [...data.keys()], remove: (k) => void data.delete(k) }
}

test('with the network off, the last copy comes back at once and the server is never asked', async () => {
  const kv = memory()
  await readThrough('k', async () => ({ rows: [1, 2] }), { kv, online: () => true })
  let asked = 0
  const got = await readThrough('k', async () => { asked++; return { rows: [] } }, { kv, online: () => false })
  assert.deepEqual(got, { rows: [1, 2] })
  assert.equal(asked, 0)
})

test('online, the fresh answer wins and is kept', async () => {
  const kv = memory()
  await readThrough('k', async () => 'old', { kv, online: () => true })
  assert.equal(await readThrough('k', async () => 'new', { kv, online: () => true }), 'new')
  assert.equal(await readThrough('k', async () => { throw new Error('Failed to fetch') }, { kv, online: () => true }), 'new', 'and if the server fails, the newest copy is what is shown')
})

test('a failed request with a kept copy shows the copy and reports the network as gone; with no copy it still fails', async () => {
  const kv = memory()
  const reports: boolean[] = []
  await readThrough('k', async () => 5, { kv, report: (r) => reports.push(r) })
  assert.equal(await readThrough('k', async () => { throw new TypeError('Failed to fetch') }, { kv, report: (r) => reports.push(r) }), 5)
  await assert.rejects(readThrough('none', async () => { throw new TypeError('Failed to fetch') }, { kv }), /Failed to fetch/)
  assert.deepEqual(reports, [true, false])
})

test('a server that says no is not the network being gone', async () => {
  const reports: boolean[] = []
  await assert.rejects(readThrough('k', async () => { throw new Error('permission denied for table shifts') }, { kv: memory(), report: (r) => reports.push(r) }))
  assert.deepEqual(reports, [])
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true)
  assert.equal(isNetworkError(new Error('timeout')), true)
  assert.equal(isNetworkError(new Error('permission denied')), false)
})

test('a server that never answers is treated as no network after the timeout', async () => {
  const kv = memory()
  await readThrough('k', async () => 'kept', { kv })
  const t0 = Date.now()
  const got = await readThrough('k', () => new Promise<string>(() => {}), { kv, timeoutMs: 30 })
  assert.equal(got, 'kept')
  assert.ok(Date.now() - t0 < 500)
})

test('only reads are kept, writes pass straight through, and the same read with other arguments is kept apart', async () => {
  const kv = memory()
  let saves = 0
  const backend = {
    async goals() { return [{ id: 'g' }] },
    async sessionsSince(from: Date) { return [{ from: from.toISOString() }] },
    async nextShift(_now: Date) { return { id: 's' } },
    async saveGoal(_g: unknown) { saves++ },
  }
  const cached = withReadCache(backend, ['goals', 'sessionsSince', 'nextShift'], { kv, online: () => true })
  await cached.goals()
  await cached.sessionsSince(new Date('2026-11-23T00:00:00Z'))
  await cached.sessionsSince(new Date('2026-11-24T00:00:00Z'))
  await cached.nextShift(new Date('2026-11-23T01:00:00Z'))
  await cached.nextShift(new Date('2026-11-23T02:00:00Z'))
  await cached.saveGoal({})
  assert.equal(saves, 1)
  const keys = [...kv.data.keys()].sort()
  assert.equal(keys.filter((k) => k.includes('saveGoal')).length, 0)
  assert.equal(keys.filter((k) => k.includes('sessionsSince')).length, 2)
  assert.equal(keys.filter((k) => k.includes('nextShift')).length, 1, 'now is not part of the key')
  assert.equal(cacheKey('goals', []), PREFIX + 'goals')
  clearReadCache(kv)
  assert.equal(kv.data.size, 0, 'signing out forgets it')
})

test('the Offline pill follows the browser and the server, and a returning network clears a guess', () => {
  let online = true
  let fire = () => {}
  const c = createConnectivity({ online: () => online, listen: (cb) => { fire = cb; return () => {} } })
  const seen: boolean[] = []
  c.subscribe((o) => seen.push(o))
  assert.deepEqual(seen, [false])
  online = false; fire()
  assert.deepEqual(seen, [false, true])
  online = true; fire()
  assert.deepEqual(seen, [false, true, false])
  c.report(false) // connected, but the server does not answer
  assert.equal(c.offline(), true)
  c.report(true)
  assert.equal(c.offline(), false)
  c.report(false)
  fire() // the browser says the network came back: believe it until a request says otherwise
  assert.equal(c.offline(), false)
})

test('a stored session opens Halo without a network: who is signed in is read from the store', () => {
  const stored = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', expires_at: 1, token_type: 'bearer', user: { id: 'u', email: 'liam@example.com' } })
  assert.deepEqual(parseStoredSession(stored), { email: 'liam@example.com' }, 'even with an access token that has run out')
  assert.deepEqual(parseStoredSession(JSON.stringify({ currentSession: JSON.parse(stored) })), { email: 'liam@example.com' })
  assert.equal(parseStoredSession(null), null)
  assert.equal(parseStoredSession('not json'), null)
  assert.equal(parseStoredSession(JSON.stringify({ access_token: 'x' })), null, 'no refresh token: not a session')
  assert.deepEqual(parseStoredSession(JSON.stringify({ refresh_token: 'r', user: {} })), { email: '' })
})

test('an event held back while a tap settles is not lost: one read follows when the settling is over', async () => {
  const { clock, tick } = fakeClock()
  const a = createActions(clock, 900)
  const reads: number[] = []
  const c = createCatchUp(clock)
  const p = a.run('mute', { prev: 0, next: 1, apply: () => {}, send: async () => ({ ok: true }) })
  await p
  assert.ok(a.settleLeft('mute') > 0 && a.settleLeft('mute') <= 900)
  // two events land inside the window: still one read, after it
  c.later('mute', () => a.settleLeft('mute'), () => reads.push(clock.now()))
  c.later('mute', () => a.settleLeft('mute'), () => reads.push(clock.now()))
  await tick(500)
  assert.deepEqual(reads, [], 'not while it is settling')
  await tick(500)
  assert.equal(reads.length, 1)
  assert.equal(a.settleLeft('mute'), 0)
})

test('a second tap while an event is held makes the read wait for that tap too', async () => {
  const { clock, tick } = fakeClock()
  const a = createActions(clock, 900)
  const reads: number[] = []
  const c = createCatchUp(clock)
  await a.run('wifi', { prev: 0, next: 1, apply: () => {}, send: async () => ({ ok: true }) })
  c.later('wifi', () => a.settleLeft('wifi'), () => reads.push(clock.now()))
  await tick(600)
  await a.run('wifi', { prev: 1, next: 0, apply: () => {}, send: async () => ({ ok: true }) })
  await tick(500)
  assert.deepEqual(reads, [], 'the new tap has not settled yet')
  await tick(600)
  assert.equal(reads.length, 1)
  c.stop()
})
