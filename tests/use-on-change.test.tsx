/**
 * The distinction the hook exists for: a value that was *set* at mount has not
 * *changed*. Screens now mount with their environment, schema and selection read
 * back from storage, and a "the environment changed, so drop the selection"
 * effect firing on that first render would undo the restore before the first
 * paint.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOnChange } from '../src/renderer/src/lib/use-on-change.js'

describe('useOnChange', () => {
  it('does not run for the value it mounted with', () => {
    const effect = vi.fn()
    renderHook(() => useOnChange('prod', effect))
    expect(effect).not.toHaveBeenCalled()
  })

  it('runs once per change, with the new value', () => {
    const effect = vi.fn()
    const { rerender } = renderHook(({ env }: { env: string }) => useOnChange(env, effect), {
      initialProps: { env: 'local' }
    })

    rerender({ env: 'prod' })
    expect(effect).toHaveBeenCalledExactlyOnceWith('prod')

    // A re-render with the same value is not a change.
    rerender({ env: 'prod' })
    expect(effect).toHaveBeenCalledTimes(1)

    rerender({ env: 'local' })
    expect(effect).toHaveBeenCalledTimes(2)
    expect(effect).toHaveBeenLastCalledWith('local')
  })

  it('calls the latest callback, not the one from the render that changed', () => {
    const stale = vi.fn()
    const fresh = vi.fn()
    const { rerender } = renderHook(
      ({ env, effect }: { env: string; effect: () => void }) => useOnChange(env, effect),
      { initialProps: { env: 'local', effect: stale } }
    )

    rerender({ env: 'prod', effect: fresh })
    expect(stale).not.toHaveBeenCalled()
    expect(fresh).toHaveBeenCalledTimes(1)
  })
})
