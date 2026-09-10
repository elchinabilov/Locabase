/**
 * SQL execution and row CRUD.
 *
 * Error handling: `execute()` DOES NOT THROW on a SQL error — since the router
 * only returns `string`, `position`/`hint`/`detail` would be lost. The error
 * travels inside a successful response, in `SqlRun.error` (`TaskResult` style).
 */
import type {
  DbCells,
  DbColumn,
  DbFilter,
  DbOrder,
  DbRow,
  DbRowsPage,
  SqlResult,
  SqlRun
} from '@shared/types.js'
import { oidNames, poolFor } from './pool.js'
import {
  buildCount,
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
  clampInt,
  pkColumns,
  TEXT_TYPES,
  toResult,
  toSqlError
} from './build.js'
import * as introspect from './introspect.js'
import { inlineParams } from './ident.js'
import { rowsOf, targetFor, type Target } from './target.js'

export { invalidate, closeAll, poolFor } from './pool.js'
export { introspect }

export interface ExecuteOpts {
  readOnly: boolean
  maxRows: number
  timeoutMs: number
  /** A random token from the renderer, used for cancellation. Local only. */
  token?: string
  /** null = the local Postgres; otherwise one of the project's remote environments */
  envId?: string | null
}

/** token → pid of the backend running the query */
const inflight = new Map<string, { id: string; pid: number }>()

export async function execute(id: string, sql: string, opts: ExecuteOpts): Promise<SqlRun> {
  const maxRows = clampInt(opts.maxRows, 1, 5000)
  const timeoutMs = clampInt(opts.timeoutMs, 1_000, 600_000)
  const readOnly = opts.readOnly !== false
  const started = Date.now()

  // Remote environment: the transport lives in the adapter (Management API / psql).
  // Cancellation, multiple result blocks and `position` don't exist there — the
  const envId = opts.envId ?? null
  if (envId) {
    const target = targetFor(id, envId)
    if (!target.adapter) throw new Error(`Environment not found: ${envId}`)
    try {
      return await target.adapter.runSql(sql, { readOnly, maxRows, timeoutMs })
    } catch (err) {
      return {
        ok: false,
        results: [],
        durationMs: Date.now() - started,
        readOnly,
        error: toSqlError(err)
      }
    }
  }

  let client
  try {
    client = await poolFor(id).connect()
  } catch (err) {
    return {
      ok: false,
      results: [],
      durationMs: Date.now() - started,
      readOnly,
      error: toSqlError(err)
    }
  }

  try {
    if (opts.token) {
      const pidRes = await client.query<{ pid: number }>('select pg_backend_pid()::int4 as pid')
      const pid = pidRes.rows[0]?.pid
      if (typeof pid === 'number') inflight.set(opts.token, { id, pid })
    }

    // SET cannot be parameterized — so the value is clamped to an integer
    await client.query(`set statement_timeout = ${timeoutMs}`)
    if (readOnly) await client.query('begin read only')

    const raw = await client.query({ text: sql, rowMode: 'array', types: TEXT_TYPES })
    const names = await oidNames(id)
    // For a multi-statement script pg returns an array — ALL of them are shown,
    // not just the last one (so the rowCount of `insert…; select…` isn't lost)
    const list = (Array.isArray(raw) ? raw : [raw]) as unknown[]
    const results: SqlResult[] = list.map((r) => toResult(r as never, names, maxRows))

    // Inside a read-only transaction, commit and rollback are the same thing
    if (readOnly) await client.query('rollback')

    return { ok: true, results, durationMs: Date.now() - started, readOnly, error: null }
  } catch (err) {
    if (readOnly) await client.query('rollback').catch(() => undefined)
    return {
      ok: false,
      results: [],
      durationMs: Date.now() - started,
      readOnly,
      error: toSqlError(err)
    }
  } finally {
    if (opts.token) inflight.delete(opts.token)
    await client.query('set statement_timeout to default').catch(() => undefined)
    client.release()
  }
}

/**
 * Cancel a running query. NOT `pg_terminate_backend` — `cancel` keeps the
 * connection alive, the query returns cleanly with `57014`, and the client goes
 */
export async function cancel(id: string, token: string): Promise<{ cancelled: boolean }> {
  const hit = inflight.get(token)
  if (!hit || hit.id !== id) return { cancelled: false }
  // From a separate connection — the executing client is blocked
  const res = await poolFor(id).query<{ ok: boolean }>('select pg_cancel_backend($1) as ok', [
    hit.pid
  ])
  return { cancelled: res.rows[0]?.ok === true }
}

/* -------------------------------------------------------------- row CRUD */

/**
 * Row operations always read the columns first: the PK comes from there and every
 * identifier is checked against the column list (`requireColumn`).
 */
async function relation(
  target: Target,
  schema: string,
  table: string
): Promise<{ cols: DbColumn[]; keys: DbColumn[] }> {
  const cols = await introspect.columns(target.id, target.envId, schema, table)
  if (cols.length === 0) throw new Error(`Table not found: ${schema}.${table}`)
  return { cols, keys: pkColumns(cols) }
}

/**
 * Runs a write fragment through the transport it belongs to.
 *
 * On a remote environment a WRITE DOES NOT go through `queryJson()`: that wraps
 * the result into a subquery with `json_agg`, and Postgres only allows a
 * data-modifying CTE at the top level ("WITH clause containing a data-modifying
 * statement must be at the top level"). So writes go through `runSql()` — there
 * the statement is top level and the result comes back as text cells anyway.
 */
async function runFragment(
  target: Target,
  cols: DbColumn[],
  fragment: { text: string; params: Array<string | null> }
): Promise<DbRow[]> {
  if (!target.adapter) {
    const res = await poolFor(target.id).query({
      text: fragment.text,
      values: fragment.params,
      rowMode: 'array',
      types: TEXT_TYPES
    })
    return (res.rows ?? []) as DbRow[]
  }
  const run = await target.adapter.runSql(inlineParams(fragment.text, fragment.params), {
    readOnly: false,
    maxRows: 5000,
    timeoutMs: 60_000
  })
  if (!run.ok) throw new Error(run.error?.message ?? 'The query failed on the remote environment')
  const result = run.results[0]
  if (!result) return []
  // The column order of a remote result may not match our introspection order —
  // they are matched by name
  const index = new Map(result.columns.map((c, i) => [c.name, i]))
  return result.rows.map((row) =>
    cols.map((c) => {
      const at = index.get(c.name)
      return at === undefined ? null : (row[at] ?? null)
    })
  )
}

function cellOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  // `TEXT_TYPES` casts most columns to text, but the remote transports hand back
  // parsed JSON. `String({})` would render every one of those as '[object
  // Object]' in the grid.
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  // json/array columns come back parsed from the remote transports; `String({})`
  // would render every one of them as '[object Object]' in the grid.
  return JSON.stringify(v) ?? null
}

export interface SelectRowsReq {
  envId?: string | null
  schema: string
  table: string
  limit: number
  offset: number
  orderBy: DbOrder | null
  filters: DbFilter[]
  exactCount?: boolean
}

/** Above this size `count(*)` is skipped — offset pagination is for local dev anyway. */
const COUNT_LIMIT = 500_000

export async function selectRows(id: string, req: SelectRowsReq): Promise<DbRowsPage> {
  const { schema, table } = req
  const target = targetFor(id, req.envId ?? null)
  const { cols, keys } = await relation(target, schema, table)

  const sel = buildSelect(schema, table, cols, {
    filters: req.filters,
    orderBy: req.orderBy,
    limit: req.limit,
    offset: req.offset,
    castText: target.adapter !== null
  })
  const data = target.adapter ? await selectRemote(target, cols, sel) : await selectLocal(id, sel)

  let total: number | null = null
  const wantCount = req.exactCount !== false
  if (wantCount) {
    const est = await estimateOf(target, schema, table)
    if (est < 0 || est < COUNT_LIMIT || req.exactCount === true) {
      const cnt = buildCount(schema, table, cols, req.filters)
      const rows = await rowsOf<{ n: string | number }>(target, cnt.text, cnt.params)
      total = Number(rows[0]?.n ?? 0)
    }
  }

  const editable = keys.length > 0
  return {
    columns: cols,
    rows: data,
    total,
    editable,
    editableReason: editable ? null : 'no-pk'
  }
}

async function selectLocal(
  id: string,
  sel: { text: string; params: Array<string | null> }
): Promise<DbRow[]> {
  const res = await poolFor(id).query({
    text: sel.text,
    values: sel.params,
    rowMode: 'array',
    types: TEXT_TYPES
  })
  return (res.rows ?? []) as DbRow[]
}

async function selectRemote(
  target: Target,
  cols: DbColumn[],
  sel: { text: string; params: Array<string | null> }
): Promise<DbRow[]> {
  const names = cols.map((c) => c.name)
  const rows = await rowsOf<Record<string, unknown>>(target, inlineParams(sel.text, sel.params))
  return rows.map((row) => names.map((n) => cellOrNull(row[n])))
}

async function estimateOf(target: Target, schema: string, table: string): Promise<number> {
  const rows = await rowsOf<{ n: string | number }>(
    target,
    `select c.reltuples::int8 as n
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = $1 and c.relname = $2`,
    [schema, table]
  )
  return Number(rows[0]?.n ?? -1)
}

export async function insertRow(
  id: string,
  envId: string | null,
  schema: string,
  table: string,
  values: DbCells
): Promise<{ row: DbRow }> {
  const target = targetFor(id, envId)
  const { cols } = await relation(target, schema, table)
  const rows = await runFragment(target, cols, buildInsert(schema, table, cols, values))
  return { row: rows[0] ?? [] }
}

/**
 * `update`/`delete` run inside a transaction and check the affected row count:
 * this prevents a mass change caused by a trigger or by stale UI state.
 *
 */
export async function updateRow(
  id: string,
  envId: string | null,
  schema: string,
  table: string,
  pk: DbCells,
  patch: DbCells
): Promise<{ row: DbRow }> {
  const target = targetFor(id, envId)
  const { cols, keys } = await relation(target, schema, table)
  // The UI is not a security boundary — the guard exists here too
  if (keys.length === 0) throw new Error('No PK — rows of this table cannot be edited')

  const q = buildUpdate(schema, table, cols, pk, patch)

  if (target.adapter) {
    // Transactions aren't managed remotely; a data-modifying CTE is atomic anyway
    // and the number of returned rows gives the same check.
    const rows = await runFragment(target, cols, q)
    if (rows.length !== 1) {
      throw new Error(`Expected 1 row, changed ${rows.length}.`)
    }
    return { row: rows[0] ?? [] }
  }

  const client = await poolFor(id).connect()
  try {
    await client.query('begin')
    const res = await client.query({
      text: q.text,
      values: q.params,
      rowMode: 'array',
      types: TEXT_TYPES
    })
    if (res.rowCount !== 1) {
      await client.query('rollback')
      throw new Error(`Expected 1 row, changed ${res.rowCount ?? 0} — the change was rolled back.`)
    }
    await client.query('commit')
    return { row: (res.rows?.[0] ?? []) as DbRow }
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export async function deleteRows(
  id: string,
  envId: string | null,
  schema: string,
  table: string,
  pks: DbCells[]
): Promise<{ deleted: number }> {
  const target = targetFor(id, envId)
  const { cols, keys } = await relation(target, schema, table)
  if (keys.length === 0) throw new Error('No PK — rows of this table cannot be deleted')

  const q = buildDelete(schema, table, cols, pks)

  if (target.adapter) {
    // The number of `returning` rows is the number deleted — remotely `rowCount`
    // is not reliable (command tags are off in psql's CSV mode)
    const run = await target.adapter.runSql(`${inlineParams(q.text, q.params)} returning 1`, {
      readOnly: false,
      maxRows: 5000,
      timeoutMs: 60_000
    })
    if (!run.ok) throw new Error(run.error?.message ?? 'The delete failed')
    const deleted = run.results[0]?.rows.length ?? 0
    if (deleted > pks.length) {
      throw new Error(`More rows were deleted than expected (${deleted}).`)
    }
    return { deleted }
  }

  const client = await poolFor(id).connect()
  try {
    await client.query('begin')
    const res = await client.query({ text: q.text, values: q.params })
    if ((res.rowCount ?? 0) > pks.length) {
      await client.query('rollback')
      throw new Error(
        `More rows than expected were being deleted (${res.rowCount}) — the operation was rolled back.`
      )
    }
    await client.query('commit')
    return { deleted: res.rowCount ?? 0 }
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}
