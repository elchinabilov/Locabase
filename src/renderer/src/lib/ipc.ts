import { useCallback, useEffect, useRef, useState } from 'react'
import type { IpcChannel, IpcContract, IpcEventName, IpcEvents } from '@shared/ipc'

export class IpcError extends Error {}

/** A typed call. An exception on the main side surfaces here as `IpcError`. */
export async function call<C extends IpcChannel>(
  channel: C,
  req?: IpcContract[C]['req']
): Promise<IpcContract[C]['res']> {
  const res = await window.api.invoke<IpcContract[C]['res']>(channel, req)
  if (!res.ok) throw new IpcError(res.error ?? 'Unknown error')
  return res.data as IpcContract[C]['res']
}

export interface QueryState<T> {
  data: T | null
  error: string | null
  loading: boolean
  refresh: () => void
}

export interface QueryOptions {
  enabled?: boolean
  pollMs?: number
  /**
   * Keep the previous result on screen while the next one loads, instead of
   * clearing it. For polling, where a blank flash every few seconds is worse
   * than a slightly stale number.
   */
  keepPreviousData?: boolean
}

/**
 * A simple query hook: it calls on mount and whenever the request changes, and
 * reloads through `refresh()`. This app doesn't need all of TanStack Query —
 * every screen works with a handful of queries.
 *
 * The request is its own dependency. A hand-maintained `deps` array was the
 * previous design and it had two failure modes: a field present in `req` but
 * missing from `deps` silently changed the *next* fetch's payload without
 * triggering one, and an array whose length varied between renders is a React
 * error. Serializing the request removes both — `req` is plain JSON by
 * construction, since it has to cross the IPC bridge.
 */
export function useQuery<C extends IpcChannel>(
  channel: C,
  req: IpcContract[C]['req'],
  options: QueryOptions = {}
): QueryState<IpcContract[C]['res']> {
  const { enabled = true, pollMs, keepPreviousData = false } = options
  const [data, setData] = useState<IpcContract[C]['res'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [tick, setTick] = useState(0)

  const key = stableKey(req)
  const reqRef = useRef(req)
  reqRef.current = req
  /** The key the data on screen belongs to — `null` before the first fetch. */
  const dataKey = useRef<string | null>(null)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    // A *different* request means the data on screen answers a different
    // question; showing it under a skeleton reads as though it were the answer.
    // A refresh or a poll tick is the same question, so the previous result
    // stays put and nothing flashes.
    if (dataKey.current !== key && !keepPreviousData) setData(null)
    setLoading(true)

    call(channel, reqRef.current)
      .then((d) => {
        if (cancelled) return
        dataKey.current = key
        setData(d)
        setError(null)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      // Guards against an out-of-order response when the project or the
      // environment changes while a call is still in flight.
      cancelled = true
    }
  }, [channel, enabled, keepPreviousData, key, tick])

  useEffect(() => {
    if (!pollMs || !enabled) return
    const t = setInterval(refresh, pollMs)
    return () => clearInterval(t)
  }, [pollMs, enabled, refresh])

  return { data, error, loading, refresh }
}

/**
 * A request is only ever plain JSON — it has to survive the structured clone
 * across the bridge — so serializing it is a complete identity. Key order is
 * normalized so that two spellings of the same request are one dependency.
 */
function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v
  ) ?? 'undefined'
}

export function useEvent<E extends IpcEventName>(
  event: E,
  cb: (payload: IpcEvents[E]) => void
): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => window.api.on(event, (p) => ref.current(p)), [event])
}
