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

/**
 * A simple query hook: it calls on mount and whenever `deps` change, and reloads
 * through `refresh()`. This app doesn't need all of TanStack Query — every screen
 * works with a handful of queries.
 */
export function useQuery<C extends IpcChannel>(
  channel: C,
  req: IpcContract[C]['req'],
  deps: unknown[] = [],
  options: { enabled?: boolean; pollMs?: number } = {}
): QueryState<IpcContract[C]['res']> {
  const enabled = options.enabled ?? true
  const [data, setData] = useState<IpcContract[C]['res'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [tick, setTick] = useState(0)
  const reqRef = useRef(req)
  reqRef.current = req

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    call(channel, reqRef.current)
      .then((d) => {
        if (cancelled) return
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
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, enabled, tick, ...deps])

  useEffect(() => {
    if (!options.pollMs || !enabled) return
    const t = setInterval(refresh, options.pollMs)
    return () => clearInterval(t)
  }, [options.pollMs, enabled, refresh])

  return { data, error, loading, refresh }
}

export function useEvent<E extends IpcEventName>(
  event: E,
  cb: (payload: IpcEvents[E]) => void
): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => window.api.on(event, (p) => ref.current(p)), [event])
}
