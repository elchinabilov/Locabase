/**
 * The interface's memory. Two things are worth holding still here: what reaches
 * React (never an unvalidated value from storage) and how often the disk is
 * touched (once per burst, not once per keystroke).
 *
 * The module reads `localStorage` at import time and keeps the bag in a
 * module-level variable, so every test that starts from a given stored state has
 * to seed storage and then re-import it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { z } from 'zod'
import type * as UiState from '../src/renderer/src/lib/ui-state.js'

const KEY = 'locabase.ui.v1'

/** A fresh module, reading whatever is in storage right now. */
async function load(stored?: unknown): Promise<typeof UiState> {
  localStorage.clear()
  if (stored !== undefined) localStorage.setItem(KEY, JSON.stringify(stored))
  vi.resetModules()
  return import('../src/renderer/src/lib/ui-state.js')
}

/** What is on disk, past the debounce. */
function flushed(): Record<string, unknown> {
  vi.advanceTimersByTime(300)
  return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useUiState', () => {
  it('starts from the initial value when nothing is stored', async () => {
    const { useUiState } = await load()
    const { result } = renderHook(() => useUiState('schema', z.string(), 'public'))
    expect(result.current[0]).toBe('public')
  })

  it('reads a stored value back', async () => {
    const { useUiState } = await load({ schema: 'billing' })
    const { result } = renderHook(() => useUiState('schema', z.string(), 'public'))
    expect(result.current[0]).toBe('billing')
  })

  it('writes what was set, and only after the flush window', async () => {
    const { useUiState } = await load()
    const { result } = renderHook(() => useUiState('schema', z.string(), 'public'))

    act(() => result.current[1]('billing'))
    expect(result.current[0]).toBe('billing')
    // Still nothing on disk: the write is on a trailing timer.
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(flushed()).toEqual({ schema: 'billing' })
  })

  /**
   * The reason the writes are throttled at all. A filter box calls the setter on
   * every keystroke; the disk should see one write for the burst, not thirty.
   */
  it('collapses a burst of writes into a single store', async () => {
    const { useUiState } = await load()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useUiState('search', z.string(), ''))

    for (const term of ['u', 'us', 'use', 'user']) act(() => result.current[1](term))
    expect(setItem).not.toHaveBeenCalled()

    expect(flushed()).toEqual({ search: 'user' })
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  /* ------------------------------------------------------------ validation */

  it('falls back when the stored value fails its schema', async () => {
    const { useUiState } = await load({ tab: 'nonsense' })
    const { result } = renderHook(() =>
      useUiState('tab', z.enum(['rows', 'structure']), 'structure')
    )
    expect(result.current[0]).toBe('structure')
  })

  it('falls back on a value of the wrong type entirely', async () => {
    const { useUiState } = await load({ pageSize: 'lots' })
    const { result } = renderHook(() => useUiState('pageSize', z.number(), 50))
    expect(result.current[0]).toBe(50)
  })

  it('survives a corrupt store', async () => {
    localStorage.setItem(KEY, '{not json')
    vi.resetModules()
    const { useUiState } = await import('../src/renderer/src/lib/ui-state.js')
    const { result } = renderHook(() => useUiState('schema', z.string(), 'public'))
    expect(result.current[0]).toBe('public')
  })

  it('ignores a store holding something that is not an object', async () => {
    const { useUiState } = await load([1, 2, 3])
    const { result } = renderHook(() => useUiState('schema', z.string(), 'public'))
    expect(result.current[0]).toBe('public')
  })

  it('does not let a blocked store break the screen', async () => {
    const { useUiState } = await load()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useUiState('schema', z.string(), 'public'))
    act(() => result.current[1]('billing'))
    expect(() => vi.advanceTimersByTime(300)).not.toThrow()
    // The choice still holds for this session.
    expect(result.current[0]).toBe('billing')
  })

  /**
   * One runaway paste in the SQL editor must not take the rest of the bag with
   * it, so an oversized text is not remembered at all — and the value it would
   * have replaced is dropped rather than left behind as a stale answer.
   */
  it('refuses to remember an oversized text', async () => {
    const { useUiState } = await load({ doc: 'select 1' })
    const { result } = renderHook(() => useUiState('doc', z.string(), ''))
    act(() => result.current[1]('x'.repeat(200_001)))
    expect(flushed()).toEqual({})
    expect(result.current[0]).toHaveLength(200_001)
  })

  /* ------------------------------------------------------------------ keys */

  /**
   * The screens that hold per-project state are not all remounted when the
   * project changes, so a changed key has to re-read rather than carry the
   * previous project's value across.
   */
  it('re-reads when the key changes', async () => {
    const { useUiState } = await load({ 'p.a.schema': 'billing', 'p.b.schema': 'audit' })
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useUiState(`p.${id}.schema`, z.string(), 'public'),
      { initialProps: { id: 'a' } }
    )
    expect(result.current[0]).toBe('billing')

    rerender({ id: 'b' })
    expect(result.current[0]).toBe('audit')

    // A key with nothing behind it falls back instead of keeping 'audit'.
    rerender({ id: 'c' })
    expect(result.current[0]).toBe('public')
  })

  it('keeps the two keys apart when both are written', async () => {
    const { useUiState } = await load()
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useUiState(`p.${id}.schema`, z.string(), 'public'),
      { initialProps: { id: 'a' } }
    )
    act(() => result.current[1]('billing'))
    rerender({ id: 'b' })
    act(() => result.current[1]('audit'))

    expect(flushed()).toEqual({ 'p.a.schema': 'billing', 'p.b.schema': 'audit' })
  })
})

describe('useRecentUiState', () => {
  const VIEW = z.object({ sort: z.string().nullable() })
  const NONE = { sort: null }

  it('remembers a value per slot', async () => {
    const { useRecentUiState } = await load()
    const { result, rerender } = renderHook(
      ({ slot }: { slot: string }) => useRecentUiState('rowView', slot, VIEW, NONE),
      { initialProps: { slot: 'public.orders' } }
    )
    act(() => result.current[1]({ sort: 'created_at' }))

    rerender({ slot: 'public.users' })
    expect(result.current[0]).toEqual(NONE)
    act(() => result.current[1]({ sort: 'email' }))

    rerender({ slot: 'public.orders' })
    expect(result.current[0]).toEqual({ sort: 'created_at' })
  })

  /** A database has thousands of tables; the bag must not grow with all of them. */
  it('keeps only the most recently used slots', async () => {
    const { useRecentUiState } = await load()
    const { result, rerender } = renderHook(
      ({ slot }: { slot: string }) => useRecentUiState('rowView', slot, VIEW, NONE, 2),
      { initialProps: { slot: 'one' } }
    )
    for (const slot of ['one', 'two', 'three']) {
      rerender({ slot })
      act(() => result.current[1]({ sort: slot }))
    }

    expect(flushed()).toEqual({
      rowView: [
        ['three', { sort: 'three' }],
        ['two', { sort: 'two' }]
      ]
    })
  })

  it('moves a slot back to the front when it is used again', async () => {
    const { useRecentUiState } = await load({
      rowView: [
        ['two', { sort: 'two' }],
        ['one', { sort: 'one' }]
      ]
    })
    const { result } = renderHook(() => useRecentUiState('rowView', 'one', VIEW, NONE, 2))
    act(() => result.current[1]({ sort: 'again' }))

    expect(flushed()).toEqual({
      rowView: [
        ['one', { sort: 'again' }],
        ['two', { sort: 'two' }]
      ]
    })
  })

  it('ignores junk among the slots instead of failing on it', async () => {
    const { useRecentUiState } = await load({
      rowView: ['not a pair', ['orders'], [1, 2], ['public.orders', { sort: 'id' }]]
    })
    const { result } = renderHook(() => useRecentUiState('rowView', 'public.orders', VIEW, NONE, 2))
    expect(result.current[0]).toEqual({ sort: 'id' })
  })

  it('validates a slot value like any other', async () => {
    const { useRecentUiState } = await load({ rowView: [['public.orders', { sort: 7 }]] })
    const { result } = renderHook(() => useRecentUiState('rowView', 'public.orders', VIEW, NONE))
    expect(result.current[0]).toEqual(NONE)
  })

  it('starts over when the key holds something that is not a list', async () => {
    const { useRecentUiState } = await load({ rowView: { 'public.orders': { sort: 'id' } } })
    const { result } = renderHook(() => useRecentUiState('rowView', 'public.orders', VIEW, NONE))
    expect(result.current[0]).toEqual(NONE)
  })
})

describe('pruneUiState', () => {
  it('forgets the projects that are gone and keeps the rest', async () => {
    const { pruneUiState } = await load({
      route: 'tables',
      'p.alive.tables.schema': 'public',
      'p.dead.tables.schema': 'audit',
      'p.dead.sql.doc': 'select 1',
      'p.': 'malformed'
    })
    pruneUiState(['alive'])

    expect(flushed()).toEqual({
      route: 'tables',
      'p.alive.tables.schema': 'public',
      'p.': 'malformed'
    })
  })

  it('writes nothing when there is nothing to forget', async () => {
    const { pruneUiState } = await load({ 'p.alive.tables.schema': 'public' })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    pruneUiState(['alive'])
    vi.advanceTimersByTime(300)
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('projectKey', () => {
  it('scopes a name to one project', async () => {
    const { projectKey } = await load()
    expect(projectKey('abc', 'tables.schema')).toBe('p.abc.tables.schema')
  })
})
