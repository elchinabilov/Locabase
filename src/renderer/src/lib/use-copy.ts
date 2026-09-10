import { useCallback, useEffect, useRef, useState } from 'react'

const FLASH_MS = 1200

/**
 * Copy to the clipboard and flash a confirmation for a moment.
 *
 * Three screens each wrote this with a bare `setTimeout` and no cleanup, so
 * navigating away inside the flash window set state on an unmounted tree. The
 * `key` is which item was copied, for lists where several rows share one flag.
 */
export function useCopy(): {
  copied: string | null
  copy: (value: string, key?: string) => void
} {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback((value: string, key = 'default') => {
    void navigator.clipboard.writeText(value)
    setCopied(key)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied((c) => (c === key ? null : c)), FLASH_MS)
  }, [])

  return { copied, copy }
}
