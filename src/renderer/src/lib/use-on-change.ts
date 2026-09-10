import { useEffect, useRef } from 'react'

/**
 * Run `effect` when `value` changes — but **not** for the value the component
 * mounted with.
 *
 * A plain `useEffect(fn, [value])` also fires on mount, which is invisible while
 * every screen starts from a default and fatal once a screen starts restored:
 * "the environment changed, so forget the selected table" would run against the
 * very selection that had just been read back, and clear it before the first
 * paint. Comparing against the previous value is the difference between
 * *changed* and *set*.
 */
export function useOnChange<T>(value: T, effect: (value: T) => void): void {
  const previous = useRef(value)
  const latest = useRef(effect)
  latest.current = effect

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    latest.current(value)
  }, [value])
}
