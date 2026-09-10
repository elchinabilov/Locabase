import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useQuery } from '../src/renderer/src/lib/ipc.js'

/** The preload bridge, stubbed at the same shape the real one exposes. */
const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue({ ok: true, data: 'first' })
  // Only the bridge is stubbed — replacing `window` itself would take the
  // document with it.
  ;(window as unknown as { api: unknown }).api = {
    invoke,
    on: () => () => undefined,
    platform: 'darwin'
  }
})

afterEach(() => vi.restoreAllMocks())

describe('useQuery', () => {
  it('calls the channel once on mount', async () => {
    const { result } = renderHook(() => useQuery('projects:list', undefined))
    await waitFor(() => expect(result.current.data).toBe('first'))
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('projects:list', undefined)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a failed call as an error string', async () => {
    invoke.mockResolvedValue({ ok: false, error: 'nope' })
    const { result } = renderHook(() => useQuery('projects:list', undefined))
    await waitFor(() => expect(result.current.error).toBe('nope'))
    expect(result.current.data).toBeNull()
  })

  /**
   * The point of deriving the dependency from the request: a field that changed
   * has to trigger a refetch, and previously only a hand-maintained `deps` array
   * did that — so a field missing from it silently changed the *next* fetch.
   */
  it('refetches when any field of the request changes', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useQuery('stack:status', { id }),
      { initialProps: { id: 'a' } }
    )
    await waitFor(() => expect(result.current.data).toBe('first'))
    expect(invoke).toHaveBeenCalledTimes(1)

    rerender({ id: 'b' })
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
    expect(invoke).toHaveBeenLastCalledWith('stack:status', { id: 'b' })
  })

  it('does not refetch when an equal request is rebuilt', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useQuery('stack:status', { id }),
      { initialProps: { id: 'a' } }
    )
    await waitFor(() => expect(result.current.data).toBe('first'))
    // A fresh object literal every render, same contents.
    rerender({ id: 'a' })
    rerender({ id: 'a' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('treats key order as irrelevant', async () => {
    const { rerender } = renderHook(
      ({ req }: { req: Record<string, unknown> }) =>
        useQuery('stack:status', req as { id: string; withStats?: boolean }),
      { initialProps: { req: { id: 'a', withStats: true } } }
    )
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    rerender({ req: { withStats: true, id: 'a' } })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('clears stale data when the request changes', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useQuery('stack:status', { id }),
      { initialProps: { id: 'a' } }
    )
    await waitFor(() => expect(result.current.data).toBe('first'))

    let release: ((v: unknown) => void) | undefined
    invoke.mockReturnValue(new Promise((resolve) => (release = resolve)))
    rerender({ id: 'b' })
    // The old project's answer must not sit under the new project's skeleton.
    await waitFor(() => expect(result.current.data).toBeNull())
    await act(async () => {
      release!({ ok: true, data: 'second' })
    })
    await waitFor(() => expect(result.current.data).toBe('second'))
  })

  it('keeps the previous data when asked to', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useQuery('stack:status', { id }, { keepPreviousData: true }),
      { initialProps: { id: 'a' } }
    )
    await waitFor(() => expect(result.current.data).toBe('first'))
    invoke.mockReturnValue(new Promise(() => undefined))
    rerender({ id: 'b' })
    expect(result.current.data).toBe('first')
  })

  it('refetches on refresh without clearing what is on screen', async () => {
    const { result } = renderHook(() => useQuery('projects:list', undefined))
    await waitFor(() => expect(result.current.data).toBe('first'))
    invoke.mockResolvedValue({ ok: true, data: 'again' })
    act(() => result.current.refresh())
    expect(result.current.data).toBe('first')
    await waitFor(() => expect(result.current.data).toBe('again'))
  })

  it('does not call at all when disabled', async () => {
    const { result } = renderHook(() => useQuery('projects:list', undefined, { enabled: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(invoke).not.toHaveBeenCalled()
  })

  /** Switching project mid-flight must not let the slower answer win. */
  it('ignores a response that arrives after the request changed', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    invoke.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useQuery('stack:status', { id }),
      { initialProps: { id: 'a' } }
    )
    rerender({ id: 'b' })
    await waitFor(() => expect(resolvers).toHaveLength(2))

    await act(async () => {
      resolvers[1]!({ ok: true, data: 'for-b' })
      resolvers[0]!({ ok: true, data: 'for-a' })
    })
    expect(result.current.data).toBe('for-b')
  })
})
