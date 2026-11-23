// Card 29: Halo opens and works with Wi-Fi off. Every read from the server is kept on this laptop as it succeeds. When the
// network is down the last copy is shown at once (no waiting for a timeout), and when it is up the fresh answer replaces it.
// Writes are never cached: a save that cannot reach the server fails plainly, as before.

import { isNetworkError } from './connectivity.ts'

export interface KV {
  get(k: string): string | null
  set(k: string, v: string): void
  keys(): string[]
  remove(k: string): void
}

export const PREFIX = 'halo.cache.v1:'

export const localKV: KV = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode, or full: the cache is a nicety */ } },
  keys: () => { try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '') } catch { return [] } },
  remove: (k) => { try { localStorage.removeItem(k) } catch { /* nothing */ } },
}

/** The reads worth keeping. Everything else on the backend changes something, and is passed straight through. */
export const READ_METHODS = [
  'nextShift', 'nextTest', 'shiftsBetween', 'settings', 'activeSession', 'sessionsSince', 'upcomingTests', 'testsBetween', 'subjects',
  'unreadAlerts', 'goals', 'moneyItems', 'marks', 'taskRuns', 'shelfItems', 'countdowns', 'launchItems', 'uiPrefs', 'uiSettings',
] as const

/** These take "now", which is different every call, so they are kept under one key. */
const NOW_ARG = new Set(['nextShift', 'nextTest', 'upcomingTests'])

export const cacheKey = (method: string, args: unknown[]): string => PREFIX + method + (NOW_ARG.has(method) || !args.length ? '' : ':' + JSON.stringify(args))

export interface ReadThroughOptions {
  kv?: KV
  /** What the browser says. Offline with a copy kept: the copy is returned without asking the network. */
  online?: () => boolean
  /** A server that does not answer is as good as no network. */
  timeoutMs?: number
  report?: (reached: boolean) => void
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

export async function readThrough<T>(key: string, load: () => Promise<T>, o: ReadThroughOptions = {}): Promise<T> {
  const kv = o.kv ?? localKV
  const raw = kv.get(key)
  let hit: { data: T } | null = null
  if (raw) { try { hit = JSON.parse(raw) as { data: T } } catch { hit = null } }
  if (hit && o.online && !o.online()) return hit.data // offline: show what we have, now
  try {
    const v = await withTimeout(load(), o.timeoutMs ?? 8000)
    if (v !== undefined) kv.set(key, JSON.stringify({ at: Date.now(), data: v }))
    o.report?.(true)
    return v
  } catch (e) {
    if (isNetworkError(e)) o.report?.(false)
    if (hit) return hit.data
    throw e
  }
}

/** The same backend with its reads kept. Methods not in `methods` are untouched. */
export function withReadCache<B extends object>(backend: B, methods: readonly string[] = READ_METHODS, o: ReadThroughOptions = {}): B {
  const out: Record<string, unknown> = { ...(backend as Record<string, unknown>) }
  for (const m of methods) {
    const orig = (backend as Record<string, unknown>)[m]
    if (typeof orig !== 'function') continue
    out[m] = (...args: unknown[]) => readThrough(cacheKey(m, args), () => (orig as (...a: unknown[]) => Promise<unknown>).apply(backend, args), o)
  }
  return out as B
}

/** Signed out: forget what was kept. */
export function clearReadCache(kv: KV = localKV): void {
  for (const k of kv.keys()) if (k.startsWith(PREFIX)) kv.remove(k)
}
