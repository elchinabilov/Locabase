import { useCallback, useEffect, useRef, useState } from 'react'

export interface ActionState {
  /**
   * Run an async action. It never throws: a failure lands in `error` and the
   * call resolves to `undefined`, so a caller can branch on the result instead
   * of wrapping every button in its own try/catch.
   *
   * `label` names which of several buttons is running, for screens that have
   * more than one.
   */
  run: <T>(fn: () => Promise<T>, label?: string) => Promise<T | undefined>
  /** True while an action is in flight — wire it to a button's `loading`. */
  busy: boolean
  error: string | null
  /** For dismissing the note, or clearing it when a form reopens. */
  setError: (message: string | null) => void
  /** The `label` of the action currently running, or `null`. */
  runningLabel: string | null
}

/**
 * The one place an action's busy flag and error message are managed.
 *
 * Fifteen screens each carried their own copy of
 * `setBusy(true); setError(null); try { … } catch { setError(…) } finally { setBusy(false) }`,
 * and eight other call sites skipped it entirely with a bare `void call(...)` —
 * so a failed deploy, restart or upload changed nothing on screen at all.
 * Routing every action through here makes the error state impossible to forget.
 */
export function useAction(): ActionState {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runningLabel, setRunningLabel] = useState<string | null>(null)

  // A component can navigate away while its action is still in flight; without
  // this the settle would setState on an unmounted tree.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const run = useCallback(
    async <T>(fn: () => Promise<T>, label?: string): Promise<T | undefined> => {
      setBusy(true)
      setError(null)
      setRunningLabel(label ?? null)
      try {
        return await fn()
      } catch (err) {
        if (alive.current) setError(err instanceof Error ? err.message : String(err))
        return undefined
      } finally {
        if (alive.current) {
          setBusy(false)
          setRunningLabel(null)
        }
      }
    },
    []
  )

  return { run, busy, error, setError, runningLabel }
}
