import { useEffect, useState } from 'react'
import type { StackStatus } from '@shared/types'
import { call } from './ipc'

/**
 * One `stack:status` poll per project, however many screens are watching.
 *
 * Three places wanted this at once — the sidebar dot, the Overview screen and
 * the database gate on Tables/SQL/Users — so a single selected project was
 * being inspected three times every eight seconds, and each inspection walks
 * every container on the host. They now share one subscription per project.
 *
 * `withStats` (per-container RAM) costs an extra `docker stats` call per running
 * container, so it is only requested while a subscriber actually wants it.
 */

const POLL_MS = 8000

interface Entry {
  subscribers: Set<(state: StackStatusState) => void>
  /** How many current subscribers asked for RAM figures. */
  statsWanted: number
  timer: ReturnType<typeof setInterval> | null
  inFlight: boolean
  state: StackStatusState
}

export interface StackStatusState {
  data: StackStatus | null
  error: string | null
  loading: boolean
}

const EMPTY: StackStatusState = { data: null, error: null, loading: true }
const entries = new Map<string, Entry>()

function emit(entry: Entry, next: StackStatusState): void {
  entry.state = next
  for (const notify of entry.subscribers) notify(next)
}

async function fetchOnce(projectId: string): Promise<void> {
  const entry = entries.get(projectId)
  if (!entry || entry.inFlight) return
  entry.inFlight = true
  try {
    const data = await call('stack:status', {
      id: projectId,
      withStats: entry.statsWanted > 0
    })
    // The last subscriber may have left while the call was in flight.
    if (entries.get(projectId) === entry) emit(entry, { data, error: null, loading: false })
  } catch (err) {
    if (entries.get(projectId) === entry) {
      // The previous reading is kept: a transient Docker hiccup should not blank
      // a screen that was showing a healthy stack a moment ago.
      emit(entry, { ...entry.state, error: (err as Error).message, loading: false })
    }
  } finally {
    entry.inFlight = false
  }
}

function subscribe(
  projectId: string,
  wantsStats: boolean,
  notify: (state: StackStatusState) => void
): () => void {
  let entry = entries.get(projectId)
  if (!entry) {
    entry = { subscribers: new Set(), statsWanted: 0, timer: null, inFlight: false, state: EMPTY }
    entries.set(projectId, entry)
  }
  const current = entry
  current.subscribers.add(notify)
  if (wantsStats) current.statsWanted += 1

  if (current.timer === null) {
    current.timer = setInterval(() => void fetchOnce(projectId), POLL_MS)
  }
  void fetchOnce(projectId)

  return () => {
    current.subscribers.delete(notify)
    if (wantsStats) current.statsWanted -= 1
    if (current.subscribers.size === 0) {
      if (current.timer !== null) clearInterval(current.timer)
      entries.delete(projectId)
    }
  }
}

/** Force a re-read now — after a start, stop, restart or reset. */
export function refreshStackStatus(projectId: string): void {
  void fetchOnce(projectId)
}

export function useStackStatus(
  projectId: string,
  options: { withStats?: boolean } = {}
): StackStatusState & { refresh: () => void } {
  const wantsStats = options.withStats ?? false
  const [state, setState] = useState<StackStatusState>(() => entries.get(projectId)?.state ?? EMPTY)

  useEffect(() => {
    setState(entries.get(projectId)?.state ?? EMPTY)
    return subscribe(projectId, wantsStats, setState)
  }, [projectId, wantsStats])

  return { ...state, refresh: () => refreshStackStatus(projectId) }
}
