/**
 * Where the interface remembers itself.
 *
 * Every screen holds state that is a *place* rather than data: the environment
 * you picked, the schema you were in, the filters you set, the query you were
 * halfway through writing. A route unmounts the moment you leave it, so without
 * somewhere to keep that, walking through the sidebar and back costs the same
 * three clicks every time — and a restart costs all of them.
 *
 * One `localStorage` entry holds the lot, for the same reason the theme, the
 * fonts and the pane sizes live there: the read has to be **synchronous**. A
 * screen must mount with its state already in place; an IPC round-trip would
 * mean rendering a default first and jumping a frame later, which is worse than
 * not restoring at all.
 *
 * The cost model is what keeps it out of the way:
 *
 *  - **one** read, parsed once at module load, then served from memory;
 *  - a write updates that memory copy and schedules a flush on a trailing
 *    250 ms timer, so a keystroke in a filter box costs a property assignment —
 *    the bag is serialized at most four times a second no matter how many
 *    values changed;
 *  - the pending flush is forced on `pagehide`, so closing the window keeps
 *    whatever the last quarter-second changed.
 *
 * Everything read back is validated against a Zod schema before it reaches
 * React. This is a file the user can edit and a format that changes between
 * releases: a stale `{schema, table}`, a filter on a column that has since been
 * dropped, a hand-typed `"pageSize": "lots"` — each has to fall back to the
 * default, not crash the screen behind it.
 *
 * Deliberately NOT remembered, each at its call site:
 *
 *  - SQL's **read-only** switch, which resets on every open by design;
 *  - **unsaved drafts** (`config.toml` fields, `.env` edits): restoring an edit
 *    the user never saved, against a file that may have changed underneath it,
 *    is worse than losing it;
 *  - **"reveal secrets"**, which starts masked every time;
 *  - dialogs, in-flight work, query results and row selections — none of them
 *    outlive the data they refer to.
 */
import { useCallback, useState } from 'react'
import type { ZodType } from 'zod'

const STORAGE_KEY = 'locabase.ui.v1'

/** Trailing, not leading: typing is a burst, and only where it stopped matters. */
const FLUSH_MS = 250

/**
 * A single text value big enough to threaten the quota is not remembered at all.
 * The SQL buffer is the only value here with no natural bound, and one runaway
 * paste must not take the rest of the bag down with it.
 */
const MAX_TEXT = 200_000

/** How many per-slot values a `useRecentUiState` key keeps before the oldest go. */
const DEFAULT_SLOTS = 20

const PROJECT_PREFIX = 'p.'

type Bag = Record<string, unknown>

const bag: Bag = load()
let timer: ReturnType<typeof setTimeout> | null = null

function load(): Bag {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    // An array or a scalar under our key is not ours; start over rather than
    // spend every read defending against it.
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Bag)
      : {}
  } catch {
    // unreadable, blocked or corrupt — the defaults are always a valid answer
    return {}
  }
}

function flush(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bag))
  } catch {
    // quota or a blocked store: this session still behaves, it just is not
    // remembered. None of it is worth an error in front of the user.
  }
}

function schedule(): void {
  // Throttle, not debounce: continuous typing must still reach the disk, and it
  // does — every 250 ms — instead of waiting for a pause that may never come.
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    flush()
  }, FLUSH_MS)
}

if (typeof window !== 'undefined') {
  // `pagehide` covers the window closing and a reload; `beforeunload` is what
  // Electron gives us on quit. Either way the timer may still be armed.
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
}

/* ---------------------------------------------------------------- the bag */

/** Oversized text is dropped rather than truncated — half a query is not a query. */
function storable(value: unknown): boolean {
  return !(typeof value === 'string' && value.length > MAX_TEXT)
}

function write(key: string, value: unknown): void {
  if (storable(value)) bag[key] = value
  else delete bag[key]
  schedule()
}

/**
 * The entries under a slotted key, junk filtered out. Most recent first — the
 * order *is* the recency, which is what bounds the key to `limit` entries.
 */
function slots(key: string): Array<[string, unknown]> {
  const raw = bag[key]
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (entry): entry is [string, unknown] =>
      Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'
  )
}

function writeSlot(key: string, slot: string, value: unknown, limit: number): void {
  const rest = slots(key).filter(([name]) => name !== slot)
  const head: Array<[string, unknown]> = storable(value) ? [[slot, value]] : []
  bag[key] = [...head, ...rest].slice(0, limit)
  schedule()
}

function read(key: string, slot: string | null): unknown {
  if (slot === null) return bag[key]
  return slots(key).find(([name]) => name === slot)?.[1]
}

function revive<T>(key: string, slot: string | null, schema: ZodType<T>, fallback: T): T {
  const raw = read(key, slot)
  if (raw === undefined) return fallback
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : fallback
}

/* -------------------------------------------------------------- the hooks */

function useRemembered<T>(
  key: string,
  slot: string | null,
  schema: ZodType<T>,
  initial: T,
  limit: number
): [T, (next: T) => void] {
  const identity = slot === null ? key : `${key} ${slot}`
  const [held, setHeld] = useState<{ identity: string; value: T }>(() => ({
    identity,
    value: revive(key, slot, schema, initial)
  }))

  // A changed key means a different project, or a different table — its own
  // remembered value, not the last one's. Not every screen is keyed by project,
  // so this cannot be left to a remount. Setting state during render is how
  // React derives state from props; the discarded render never reaches the DOM.
  const value = held.identity === identity ? held.value : revive(key, slot, schema, initial)
  if (held.identity !== identity) setHeld({ identity, value })

  const set = useCallback(
    (next: T) => {
      setHeld({ identity, value: next })
      if (slot === null) write(key, next)
      else writeSlot(key, slot, next, limit)
    },
    [identity, key, slot, limit]
  )

  return [value, set]
}

/**
 * A piece of interface state that survives leaving the screen and closing the
 * app. The same shape as `useState`, minus the updater-function form — a
 * remembered value is always set to something already known.
 *
 * `key` is a stable name; use `projectKey()` for anything that belongs to one
 * project rather than to the window.
 */
export function useUiState<T>(key: string, schema: ZodType<T>, initial: T): [T, (next: T) => void] {
  return useRemembered(key, null, schema, initial, DEFAULT_SLOTS)
}

/**
 * The same, but remembered **per slot**, keeping only the most recent `limit`
 * slots — for state that belongs to a thing there can be thousands of, like the
 * sort and the filters of one table. Without the bound, browsing a large
 * database would grow the bag forever.
 */
export function useRecentUiState<T>(
  key: string,
  slot: string,
  schema: ZodType<T>,
  initial: T,
  limit: number = DEFAULT_SLOTS
): [T, (next: T) => void] {
  return useRemembered(key, slot, schema, initial, limit)
}

/* ------------------------------------------------------------ bookkeeping */

/** The key under which `name` is remembered for one project only. */
export function projectKey(projectId: string, name: string): string {
  return `${PROJECT_PREFIX}${projectId}.${name}`
}

/**
 * Forget the projects that are gone. A removed project would otherwise keep its
 * schema, its filters and its editor buffer in the bag for the life of the
 * install.
 */
export function pruneUiState(liveProjectIds: readonly string[]): void {
  const live = new Set(liveProjectIds)
  let dropped = false
  for (const key of Object.keys(bag)) {
    if (!key.startsWith(PROJECT_PREFIX)) continue
    const rest = key.slice(PROJECT_PREFIX.length)
    const dot = rest.indexOf('.')
    if (dot <= 0 || live.has(rest.slice(0, dot))) continue
    delete bag[key]
    dropped = true
  }
  if (dropped) schedule()
}
