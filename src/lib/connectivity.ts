// Card 29: is Halo online? The "Offline" pill in the open window follows this. Offline means the laptop says so (Wi-Fi off, no
// adapter) or Halo's own requests to the server have just failed. Nothing waits on it: the app opens and works either way.

export interface ConnectivityEnv {
  online(): boolean
  /** Call back when the browser says it went online or offline. Returns a function that stops listening. */
  listen(cb: () => void): () => void
}

export interface Connectivity {
  offline(): boolean
  /** A request to the server worked (true) or failed the way a missing network fails (false). */
  report(reached: boolean): void
  subscribe(cb: (offline: boolean) => void): () => void
}

/** Errors that mean "no network", as opposed to the server saying no. */
export const isNetworkError = (e: unknown): boolean =>
  /failed to fetch|networkerror|network request failed|load failed|timed out|timeout|err_internet|err_name_not_resolved|err_network/i.test(String((e as { message?: unknown })?.message ?? e))

export function createConnectivity(env: ConnectivityEnv): Connectivity {
  let unreachable = false
  const subs = new Set<(offline: boolean) => void>()
  let last = !env.online()
  const offline = () => !env.online() || unreachable
  const emit = () => {
    const now = offline()
    if (now === last) return
    last = now
    subs.forEach((cb) => cb(now))
  }
  env.listen(() => {
    if (env.online()) unreachable = false // the network is back: believe it until a request says otherwise
    emit()
  })
  return {
    offline,
    report(reached) { unreachable = !reached; emit() },
    subscribe(cb) { subs.add(cb); cb(offline()); return () => subs.delete(cb) },
  }
}

const browserEnv: ConnectivityEnv = {
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  listen: (cb) => {
    if (typeof addEventListener !== 'function') return () => {}
    addEventListener('online', cb)
    addEventListener('offline', cb)
    return () => { removeEventListener('online', cb); removeEventListener('offline', cb) }
  },
}

export const connectivity: Connectivity = createConnectivity(browserEnv)
