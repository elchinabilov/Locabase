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
import { inlineParams } from './ident.js'
import { rowsOf, targetFor, type Target } from './target.js'
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
  /** Ləğv üçün renderer-in verdiyi təsadüfi açar. Yalnız lokalda işləyir. */
  token?: string
  /** null = lokal Postgres; əks halda layihənin uzaq mühiti */
  envId?: string | null
}

/** token → icra edən backend-in pid-i */
const inflight = new Map<string, { id: string; pid: number }>()

export async function execute(id: string, sql: string, opts: ExecuteOpts): Promise<SqlRun> {
  const maxRows = clampInt(opts.maxRows, 1, 5000)
  const timeoutMs = clampInt(opts.timeoutMs, 1_000, 600_000)
  const readOnly = opts.readOnly !== false
  const started = Date.now()

  // Uzaq mühit: nəqliyyat adapterdədir (Management API / psql). Ləğv, çoxlu
  // nəticə bloku və `position` orada yoxdur — adapter özü izah edir.
  const envId = opts.envId ?? null
  if (envId) {
    const target = targetFor(id, envId)
    if (!target.adapter) throw new Error(`Mühit tapılmadı: ${envId}`)
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
  target: Target,
  schema: string,
  table: string
): Promise<{ cols: DbColumn[]; keys: DbColumn[] }> {
  const cols = await introspect.columns(target.id, target.envId, schema, table)
  if (cols.length === 0) throw new Error(`Cədvəl tapılmadı: ${schema}.${table}`)
  return { cols, keys: pkColumns(cols) }
}

/**
 * Yazma fraqmentini nəqliyyata uyğun icra edir.
 *
 * Uzaq mühitdə YAZMA `queryJson()`-dan KEÇMİR: o, nəticəni `json_agg` ilə alt
 * sorğuya sarıyır, Postgres isə datanı dəyişən CTE-nin yalnız yuxarı səviyyədə
 * olmasına icazə verir («WITH clause containing a data-modifying statement
 * must be at the top level»). Ona görə yazma `runSql()` ilə gedir — orada
 * ifadə yuxarı səviyyədədir və nəticə onsuz da mətn xanaları kimi qayıdır.
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
  if (!run.ok) throw new Error(run.error?.message ?? 'Uzaq mühitdə sorğu uğursuz oldu')
  const result = run.results[0]
  if (!result) return []
  // Uzaq nəticənin sütun sırası bizim introspeksiya sırası ilə eyni olmaya
  // bilər — adla uyğunlaşdırılır
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
  return typeof v === 'string' ? v : String(v)
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

/** Böyükdürsə `count(*)` işə salınmır — offset paginasiya onsuz da lokal dev üçündür. */
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
  const data = target.adapter
    ? await selectRemote(target, cols, sel)
    : await selectLocal(id, sel)

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
    editableReason: editable ? null : 'PK yoxdur'
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
  const rows = await rowsOf<Record<string, unknown>>(
    target,
    inlineParams(sel.text, sel.params)
  )
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
 * `update`/`delete` tranzaksiya içindədir və təsirlənən sətir sayını yoxlayır:
 * trigger və ya köhnəlmiş UI vəziyyəti səbəbindən kütləvi dəyişikliyin
 * qarşısını alır.
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
  // UI təhlükəsizlik sərhədi deyil — guard burada da var
  if (keys.length === 0) throw new Error('PK yoxdur — bu cədvəlin sətirləri redaktə olunmur')

  const q = buildUpdate(schema, table, cols, pk, patch)

  if (target.adapter) {
    // Uzaqda tranzaksiya idarə edilmir; datanı dəyişən CTE onsuz da atomikdir
    // və qayıdan sətir sayı eyni yoxlamanı verir.
    const rows = await runFragment(target, cols, q)
    if (rows.length !== 1) {
      throw new Error(`Gözlənilən 1 sətir, dəyişən ${rows.length}.`)
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
  envId: string | null,
  schema: string,
  table: string,
  pks: DbCells[]
): Promise<{ deleted: number }> {
  const target = targetFor(id, envId)
  const { cols, keys } = await relation(target, schema, table)
  if (keys.length === 0) throw new Error('PK yoxdur — bu cədvəlin sətirləri silinmir')

  const q = buildDelete(schema, table, cols, pks)

  if (target.adapter) {
    // `returning` sətirlərinin sayı silinənlərin sayıdır — uzaqda `rowCount`
    // etibarlı gəlmir (psql CSV-də command tag söndürülüb)
    const run = await target.adapter.runSql(
      `${inlineParams(q.text, q.params)} returning 1`,
      { readOnly: false, maxRows: 5000, timeoutMs: 60_000 }
    )
    if (!run.ok) throw new Error(run.error?.message ?? 'Silinmə uğursuz oldu')
    const deleted = run.results[0]?.rows.length ?? 0
    if (deleted > pks.length) {
      throw new Error(`Gözləniləndən çox sətir silindi (${deleted}).`)
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
