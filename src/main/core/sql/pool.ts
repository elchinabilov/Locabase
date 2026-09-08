/**
 * Layihə başına bir `pg` hovuzu.
 *
 * Niyə hovuz, per-call `Client` deyil: cədvəl ekranının bir yüklənməsi ~4
 * gediş-gəliş edir, `max: 4` isə lokal stack-in `max_connections`-unu qoruyur
 * (GoTrue, PostgREST və Realtime eyni bazanı paylaşır).
 *
 * DİQQƏT: `pool.on('error')` MÜTLƏQDİR. `supabase stop` boşdakı bağlantılara
 * ECONNRESET verir; dinləyicisi olmayan EventEmitter `'error'` hadisəsi
 * Electron main prosesini çökdürür.
 */
import { Pool } from 'pg'
import { connectionString } from '../localdb.js'
import { get as getProject } from '../projects.js'
import { logBus } from '../log.js'

interface Entry {
  pool: Pool
  /** Hovuzun qurulduğu bağlantı sətri — `db.port` dəyişibsə hovuz köhnəlir. */
  conn: string
  /** `pg_type` oid → typname; tənbəl doldurulur. */
  oids: Map<number, string> | null
}

const cache = new Map<string, Entry>()

function entryFor(projectId: string): Entry {
  const conn = connectionString(getProject(projectId))
  const hit = cache.get(projectId)
  // Port dəyişibsə köhnə hovuz artıq başqa bazaya baxır
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
    logBus.push('sql', 'warn', `hovuz bağlantısı düşdü: ${err.message}`)
    invalidate(projectId)
  })

  const entry: Entry = { pool, conn, oids: null }
  cache.set(projectId, entry)
  return entry
}

export function poolFor(projectId: string): Pool {
  return entryFor(projectId).pool
}

/** `pg_type` xəritəsi — nəticə sütunlarının tip adları üçün. */
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
