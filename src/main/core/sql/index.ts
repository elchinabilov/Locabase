/**
 * SQL icrası və sətir CRUD-u.
 *
 * Xəta rejimi: `execute()` SQL xətasında İSTİSNA ATMIR — router yalnız
 * `string` qaytardığına görə `position`/`hint`/`detail` itərdi. Xəta uğurlu
 * cavabın içində, `SqlRun.error`-da gedir (`TaskResult` üslubu).
 */
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

export { invalidate, closeAll, poolFor } from './pool.js'
export { introspect }

export interface ExecuteOpts {
  readOnly: boolean
  maxRows: number
  timeoutMs: number
  /** Ləğv üçün renderer-in verdiyi təsadüfi açar */
  token?: string
}

/** token → icra edən backend-in pid-i */
const inflight = new Map<string, { id: string; pid: number }>()

export async function execute(id: string, sql: string, opts: ExecuteOpts): Promise<SqlRun> {
  const maxRows = clampInt(opts.maxRows, 1, 5000)
  const timeoutMs = clampInt(opts.timeoutMs, 1_000, 600_000)
  const readOnly = opts.readOnly !== false
  const started = Date.now()

  let client
  try {
    client = await poolFor(id).connect()
  } catch (err) {
    return { ok: false, results: [], durationMs: Date.now() - started, readOnly, error: toSqlError(err) }
  }

  try {
    if (opts.token) {
      const pidRes = await client.query<{ pid: number }>('select pg_backend_pid()::int4 as pid')
      const pid = pidRes.rows[0]?.pid
      if (typeof pid === 'number') inflight.set(opts.token, { id, pid })
    }

    // SET parametrləşdirilmir — ona görə dəyər tam ədəd kimi clamp olunur
    await client.query(`set statement_timeout = ${timeoutMs}`)
    if (readOnly) await client.query('begin read only')

    const raw = await client.query({ text: sql, rowMode: 'array', types: TEXT_TYPES })
    const names = await oidNames(id)
    // Çoxifadəli skriptdə pg massiv qaytarır — HAMISI göstərilir, yalnız
    // sonuncu deyil (`insert…; select…`-in rowCount-u itməsin)
    const list = (Array.isArray(raw) ? raw : [raw]) as unknown[]
    const results: SqlResult[] = list.map((r) => toResult(r as never, names, maxRows))

    // Yalnız-oxu tranzaksiyada commit ilə rollback eynidir
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
 * İşləyən sorğunu ləğv et. `pg_terminate_backend` DEYİL — `cancel` bağlantını
 * sağ saxlayır, sorğu `57014` ilə təmiz qayıdır və klient hovuza dönür.
 */
export async function cancel(id: string, token: string): Promise<{ cancelled: boolean }> {
  const hit = inflight.get(token)
  if (!hit || hit.id !== id) return { cancelled: false }
  // Ayrıca bağlantıdan — icra edən klient bloklanıb
  const res = await poolFor(id).query<{ ok: boolean }>('select pg_cancel_backend($1) as ok', [
    hit.pid
  ])
  return { cancelled: res.rows[0]?.ok === true }
}

/* ------------------------------------------------------------ sətir CRUD */

/**
 * Sətir əməliyyatları həmişə əvvəlcə sütunları oxuyur: PK bundan tapılır və
 * hər identifikator sütun siyahısına qarşı yoxlanılır (`requireColumn`).
 */
async function relation(
  id: string,
  schema: string,
  table: string
): Promise<{ cols: DbColumn[]; keys: DbColumn[] }> {
  const cols = await introspect.columns(id, schema, table)
  if (cols.length === 0) throw new Error(`Cədvəl tapılmadı: ${schema}.${table}`)
  return { cols, keys: pkColumns(cols) }
}

export interface SelectRowsReq {
  schema: string
  table: string
  limit: number
  offset: number
  orderBy: DbOrder | null
  filters: DbFilter[]
  exactCount?: boolean
}

/** Böyükdürsə `count(*)` işə salınmır — offset paginasiya onsuz da lokal dev üçündür. */
const COUNT_LIMIT = 500_000

export async function selectRows(id: string, req: SelectRowsReq): Promise<DbRowsPage> {
  const { schema, table } = req
  const { cols, keys } = await relation(id, schema, table)
  const pool = poolFor(id)

  const sel = buildSelect(schema, table, cols, {
    filters: req.filters,
    orderBy: req.orderBy,
    limit: req.limit,
    offset: req.offset
  })
  const res = await pool.query({ text: sel.text, values: sel.params, rowMode: 'array', types: TEXT_TYPES })

  let total: number | null = null
  const wantCount = req.exactCount !== false
  if (wantCount) {
    const est = await estimateOf(id, schema, table)
    if (est < 0 || est < COUNT_LIMIT || req.exactCount === true) {
      const cnt = buildCount(schema, table, cols, req.filters)
      const cr = await pool.query<{ n: string }>(cnt.text, cnt.params)
      total = Number(cr.rows[0]?.n ?? 0)
    }
  }

  const editable = keys.length > 0
  return {
    columns: cols,
    rows: (res.rows ?? []) as DbRow[],
    total,
    editable,
    editableReason: editable ? null : 'PK yoxdur'
  }
}

async function estimateOf(id: string, schema: string, table: string): Promise<number> {
  const res = await poolFor(id).query<{ n: string }>(
    `select c.reltuples::int8 as n
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = $1 and c.relname = $2`,
    [schema, table]
  )
  return Number(res.rows[0]?.n ?? -1)
}

export async function insertRow(
  id: string,
  schema: string,
  table: string,
  values: DbCells
): Promise<{ row: DbRow }> {
  const { cols } = await relation(id, schema, table)
  const q = buildInsert(schema, table, cols, values)
  const res = await poolFor(id).query({
    text: q.text,
    values: q.params,
    rowMode: 'array',
    types: TEXT_TYPES
  })
  const row = (res.rows?.[0] ?? []) as DbRow
  return { row }
}

/**
 * `update`/`delete` tranzaksiya içindədir və təsirlənən sətir sayını yoxlayır:
 * trigger və ya köhnəlmiş UI vəziyyəti səbəbindən kütləvi dəyişikliyin
 * qarşısını alır.
 */
export async function updateRow(
  id: string,
  schema: string,
  table: string,
  pk: DbCells,
  patch: DbCells
): Promise<{ row: DbRow }> {
  const { cols, keys } = await relation(id, schema, table)
  // UI təhlükəsizlik sərhədi deyil — guard burada da var
  if (keys.length === 0) throw new Error('PK yoxdur — bu cədvəlin sətirləri redaktə olunmur')

  const q = buildUpdate(schema, table, cols, pk, patch)
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
      throw new Error(
        `Gözlənilən 1 sətir, dəyişən ${res.rowCount ?? 0} — dəyişiklik geri qaytarıldı.`
      )
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
  schema: string,
  table: string,
  pks: DbCells[]
): Promise<{ deleted: number }> {
  const { cols, keys } = await relation(id, schema, table)
  if (keys.length === 0) throw new Error('PK yoxdur — bu cədvəlin sətirləri silinmir')

  const q = buildDelete(schema, table, cols, pks)
  const client = await poolFor(id).connect()
  try {
    await client.query('begin')
    const res = await client.query({ text: q.text, values: q.params })
    if ((res.rowCount ?? 0) > pks.length) {
      await client.query('rollback')
      throw new Error(
        `Gözləniləndən çox sətir silinirdi (${res.rowCount}) — əməliyyat geri qaytarıldı.`
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
