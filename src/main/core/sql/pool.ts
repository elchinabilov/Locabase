/**
 * One `pg` pool per project.
 *
 * Why a pool rather than a `Client` per call: a single load of the Tables screen
 * makes ~4 round trips, and `max: 4` protects the local stack's `max_connections`
 * (GoTrue, PostgREST and Realtime share the same database).
 *
 * NOTE: `pool.on('error')` is MANDATORY. `supabase stop` gives idle connections
 * an ECONNRESET; an EventEmitter `'error'` event with no listener crashes the
 * Electron main process.
 */
import { Pool } from 'pg'
import { connectionString } from '../localdb.js'
import { get as getProject } from '../projects.js'
import { logBus } from '../log.js'

interface Entry {
  pool: Pool
  /** The connection string the pool was built from — if `db.port` changed, the pool is stale. */
  conn: string
  /** `pg_type` oid → typname; filled lazily. */
  oids: Map<number, string> | null
}

const cache = new Map<string, Entry>()

function entryFor(projectId: string): Entry {
  const conn = connectionString(getProject(projectId))
  const hit = cache.get(projectId)
  // If the port changed, the old pool is looking at a different database
  if (hit && hit.conn !== conn) invalidate(projectId)
  const live = cache.get(projectId)
  if (live) return live

  const pool = new Pool({
    connectionString: conn,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 4_000,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
    application_name: 'locabase'
  })
  pool.on('error', (err) => {
    logBus.push('sql', 'warn', `pool connection dropped: ${err.message}`)
    invalidate(projectId)
  })

  const entry: Entry = { pool, conn, oids: null }
  cache.set(projectId, entry)
  return entry
}

export function poolFor(projectId: string): Pool {
  return entryFor(projectId).pool
}

/** The `pg_type` map — for the type names of result columns. */
export async function oidNames(projectId: string): Promise<Map<number, string>> {
  const entry = entryFor(projectId)
  if (entry.oids) return entry.oids
  const res = await entry.pool.query<{ oid: number; typname: string }>(
    'select oid::int4 as oid, typname from pg_catalog.pg_type'
  )
  const map = new Map<number, string>()
  for (const row of res.rows) map.set(Number(row.oid), row.typname)
  entry.oids = map
  return map
}

export function invalidate(projectId: string): void {
  const hit = cache.get(projectId)
  if (!hit) return
  cache.delete(projectId)
  void hit.pool.end().catch(() => undefined)
}

export function closeAll(): void {
  for (const id of [...cache.keys()]) invalidate(id)
}
