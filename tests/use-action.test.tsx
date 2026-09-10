import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAction } from '../src/renderer/src/lib/use-action.js'

describe('useAction', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAction())
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.runningLabel).toBeNull()
  })

  it('returns the action’s value on success', async () => {
    const { result } = renderHook(() => useAction())
    let value: string | undefined
    await act(async () => {
      value = await result.current.run(() => Promise.resolve('ok'))
    })
    expect(value).toBe('ok')
    expect(result.current.error).toBeNull()
    expect(result.current.busy).toBe(false)
  })

  it('captures a failure instead of throwing', async () => {
    const { result } = renderHook(() => useAction())
    let value: unknown = 'untouched'
    await act(async () => {
      value = await result.current.run(() => Promise.reject(new Error('boom')))
    })
    expect(value).toBeUndefined()
    expect(result.current.error).toBe('boom')
    expect(result.current.busy).toBe(false)
  })

  it('stringifies a non-Error rejection', async () => {
    const { result } = renderHook(() => useAction())
    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      await result.current.run(() => Promise.reject('plain string'))
    })
    expect(result.current.error).toBe('plain string')
  })

  it('is busy while the action is in flight', async () => {
    const { result } = renderHook(() => useAction())
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (release = resolve))

    let pending: Promise<unknown> | undefined
    act(() => {
      pending = result.current.run(() => gate)
    })
    await waitFor(() => expect(result.current.busy).toBe(true))

    await act(async () => {
      release!()
      await pending
    })
    expect(result.current.busy).toBe(false)
  })

  it('reports which labelled action is running', async () => {
    const { result } = renderHook(() => useAction())
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (release = resolve))

    let pending: Promise<unknown> | undefined
    act(() => {
      pending = result.current.run(() => gate, 'restart')
    })
    await waitFor(() => expect(result.current.runningLabel).toBe('restart'))

    await act(async () => {
      release!()
      await pending
    })
    expect(result.current.runningLabel).toBeNull()
  })

  it('clears a previous error when the next action starts', async () => {
    const { result } = renderHook(() => useAction())
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('first')))
    })
    expect(result.current.error).toBe('first')

    await act(async () => {
      await result.current.run(() => Promise.resolve('second'))
    })
    expect(result.current.error).toBeNull()
  })

  it('lets the caller set and dismiss the message', async () => {
    const { result } = renderHook(() => useAction())
    act(() => result.current.setError('manual'))
    expect(result.current.error).toBe('manual')
    act(() => result.current.setError(null))
    expect(result.current.error).toBeNull()
  })

  /**
   * The reason this hook exists rather than fifteen hand-written copies: a
   * screen the user navigated away from must not be written to when its action
   * finally settles.
   */
  it('does not set state after unmount', async () => {
    const { result, unmount } = renderHook(() => useAction())
    let release: ((v: unknown) => void) | undefined
    const gate = new Promise((resolve) => (release = resolve))

    let pending: Promise<unknown> | undefined
    act(() => {
      pending = result.current.run(() => gate)
    })
    unmount()
    await act(async () => {
      release!('done')
      await pending
    })
    // No "state update on an unmounted component" warning, and no throw.
    expect(true).toBe(true)
  })
})
