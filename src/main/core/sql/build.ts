/**
 * Pure SQL builders and result normalization. Nothing here imports `pg` or
 * Electron — which is why it can be tested without a database.
 *
 * Two layers of injection defence:
 *  1. VALUES are always `$n` parameters. There is no path in this file that
 *     pastes a value into SQL text.
 *  2. IDENTIFIERS always go through `quoteIdent` AND must first appear in the
 *     column list returned by introspection (`requireColumn`).
 */
import type {
  DbCells,
  DbColumn,
  DbFilter,
  DbOp,
  DbOrder,
  DbRow,
  SqlColumn,
  SqlErrorInfo,
  SqlResult,
  SqlRun
} from '@shared/types/index.js'
import { quoteIdent, qualify } from './ident.js'

/* ------------------------------------------------------------ normalizasiya */

/**
 * Every column is read as text: Date, Buffer, bigint and JSON objects never cross
 * the IPC boundary (structured clone would mangle a Buffer and drop a bigint).
 * The only types that cross IPC are `string | null`.
 */
export const TEXT_TYPES = { getTypeParser: () => (v: string) => v }

/** The part of `pg`'s QueryResult we actually need. */
export interface RawResult {
  command?: string | null
  rowCount?: number | null
  fields?: Array<{ name: string; dataTypeID: number }>
  rows?: unknown[]
}

export function toResult(
  raw: RawResult,
  oidNames: Map<number, string>,
  maxRows: number
): SqlResult {
  const columns: SqlColumn[] = (raw.fields ?? []).map((f) => ({
    name: f.name,
    typeOid: f.dataTypeID,
    typeName: oidNames.get(f.dataTypeID) ?? `oid:${f.dataTypeID}`
  }))
  const all = (raw.rows ?? []) as DbRow[]
  const truncated = all.length > maxRows
  return {
    command: raw.command ?? null,
    columns,
    rows: truncated ? all.slice(0, maxRows) : all,
    rowCount: raw.rowCount ?? null,
    truncated
  }
}

/**
 * A pg error → a serializable object. Since the router only returns `string`,
 * this object travels inside a successful response.
 */
export function toSqlError(err: unknown): SqlErrorInfo {
  const e = (err ?? {}) as Record<string, unknown>
  const str = (k: string): string | null => (typeof e[k] === 'string' ? e[k] : null)
  const rawPos = e.position
  // pg's `position` is a 1-based character offset; CodeMirror is 0-based
  const pos = typeof rawPos === 'string' || typeof rawPos === 'number' ? Number(rawPos) : NaN
  return {
    message: str('message') ?? String(err),
    code: str('code'),
    severity: str('severity'),
    detail: str('detail'),
    hint: str('hint'),
    position: Number.isFinite(pos) && pos > 0 ? pos - 1 : null,
    where: str('where'),
    table: str('table'),
    column: str('column'),
    constraint: str('constraint')
  }
}

/**
 * The shape a failed run comes back as. Four call sites built this by hand —
 * the two remote transports and both failure paths of the local one — and a
 * failure is exactly where a forgotten field is least likely to be noticed.
 */
export function failedRun(started: number, readOnly: boolean, err: unknown): SqlRun {
  return {
    ok: false,
    results: [],
    durationMs: Date.now() - started,
    readOnly,
    error: toSqlError(err)
  }
}

/* ---------------------------------------------------------- column helpers */

export function requireColumn(cols: DbColumn[], name: string): DbColumn {
  const hit = cols.find((c) => c.name === name)
  if (!hit) throw new Error(`No such column on this table: ${name}`)
  return hit
}

/** PK columns, in PK order. An empty array means there is no PK. */
export function pkColumns(cols: DbColumn[]): DbColumn[] {
  return cols.filter((c) => c.pkOrd !== null).sort((a, b) => (a.pkOrd ?? 0) - (b.pkOrd ?? 0))
}

/* ------------------------------------------------------------ where / order */

const OPS: Record<DbOp, { sql: string; param: boolean }> = {
  eq: { sql: '=', param: true },
  neq: { sql: '<>', param: true },
  gt: { sql: '>', param: true },
  gte: { sql: '>=', param: true },
  lt: { sql: '<', param: true },
  lte: { sql: '<=', param: true },
  like: { sql: 'like', param: true },
  ilike: { sql: 'ilike', param: true },
  isnull: { sql: 'is null', param: false },
  notnull: { sql: 'is not null', param: false }
}

export interface Fragment {
  text: string
  params: Array<string | null>
}

/**
 * The `where` fragment. `start` is the first placeholder number (1-based).
 * `isnull`/`notnull` EMIT NO placeholder — which is why numbering is driven by
 * `params.length`.
 */
export function buildWhere(cols: DbColumn[], filters: DbFilter[], start = 1): Fragment {
  if (filters.length === 0) return { text: '', params: [] }
  const params: Array<string | null> = []
  const parts: string[] = []
  for (const f of filters) {
    const col = requireColumn(cols, f.column)
    const op = OPS[f.op]
    if (!op) throw new Error(`Unknown operator: ${String(f.op)}`)
    if (op.param) {
      params.push(f.value)
      parts.push(`${quoteIdent(col.name)} ${op.sql} $${start + params.length - 1}`)
    } else {
      parts.push(`${quoteIdent(col.name)} ${op.sql}`)
    }
  }
  return { text: `where ${parts.join(' and ')}`, params }
}

export function buildOrder(cols: DbColumn[], order: DbOrder | null): string {
  if (!order) return ''
  const col = requireColumn(cols, order.column)
  if (order.dir !== 'asc' && order.dir !== 'desc') {
    throw new Error(`Unknown sort direction: ${String(order.dir)}`)
  }
  return `order by ${quoteIdent(col.name)} ${order.dir}`
}

/* ------------------------------------------------------------ select */

export function buildSelect(
  schema: string,
  table: string,
  cols: DbColumn[],
  opts: {
    filters: DbFilter[]
    orderBy: DbOrder | null
    limit: number
    offset: number
    /**
     * Cast every column to `::text`. On a remote environment the result arrives
     * through `json_agg` and types would collapse into JSON types (jsonb → object,
     * int → number); casting to text gives the same result as local `TEXT_TYPES`.
     */
    castText?: boolean
  }
): Fragment {
  const where = buildWhere(cols, opts.filters, 1)
  const order = buildOrder(cols, opts.orderBy)
  const limit = clampInt(opts.limit, 1, 5000)
  const offset = clampInt(opts.offset, 0, 100_000_000)
  const projection = opts.castText
    ? cols.map((c) => `${quoteIdent(c.name)}::text as ${quoteIdent(c.name)}`).join(', ')
    : '*'
  const text = [
    `select ${projection} from ${qualify(schema, table)}`,
    where.text,
    order,
    `limit ${limit} offset ${offset}`
  ]
    .filter(Boolean)
    .join(' ')
  return { text, params: where.params }
}

export function buildCount(
  schema: string,
  table: string,
  cols: DbColumn[],
  filters: DbFilter[]
): Fragment {
  const where = buildWhere(cols, filters, 1)
  return {
    text: [`select count(*)::int8 as n from ${qualify(schema, table)}`, where.text]
      .filter(Boolean)
      .join(' '),
    params: where.params
  }
}

/* ------------------------------------------------------------ insert / update / delete */

/** A key present in `values` means an explicit assignment; a missing key leaves the column at its default. */
export function buildInsert(
  schema: string,
  table: string,
  cols: DbColumn[],
  values: DbCells
): Fragment {
  const names = Object.keys(values)
  const params: Array<string | null> = []
  const idents: string[] = []
  for (const name of names) {
    const col = requireColumn(cols, name)
    if (col.isGenerated) throw new Error(`A generated column cannot be written: ${col.name}`)
    idents.push(quoteIdent(col.name))
    params.push(values[name] ?? null)
  }
  if (idents.length === 0) {
    return { text: `insert into ${qualify(schema, table)} default values returning *`, params: [] }
  }
  const holes = idents.map((_, i) => `$${i + 1}`).join(', ')
  return {
    text: `insert into ${qualify(schema, table)} (${idents.join(', ')}) values (${holes}) returning *`,
    params
  }
}

export function buildUpdate(
  schema: string,
  table: string,
  cols: DbColumn[],
  pk: DbCells,
  patch: DbCells
): Fragment {
  const keys = pkColumns(cols)
  if (keys.length === 0) throw new Error('No PK — this row cannot be edited')
  const names = Object.keys(patch)
  if (names.length === 0) throw new Error('Nothing changed')

  const params: Array<string | null> = []
  const sets: string[] = []
  for (const name of names) {
    const col = requireColumn(cols, name)
    if (col.isGenerated) throw new Error(`A generated column cannot be written: ${col.name}`)
    params.push(patch[name] ?? null)
    sets.push(`${quoteIdent(col.name)} = $${params.length}`)
  }

  const where: string[] = []
  for (const col of keys) {
    if (!(col.name in pk)) throw new Error(`Missing PK value: ${col.name}`)
    params.push(pk[col.name] ?? null)
    where.push(`${quoteIdent(col.name)} = $${params.length}`)
  }

  return {
    text: `update ${qualify(schema, table)} set ${sets.join(', ')} where ${where.join(' and ')} returning *`,
    params
  }
}

/** Row constructor for a composite PK: `where ("a","b") in (($1,$2),($3,$4))` */
export function buildDelete(
  schema: string,
  table: string,
  cols: DbColumn[],
  pks: DbCells[]
): Fragment {
  const keys = pkColumns(cols)
  if (keys.length === 0) throw new Error('No PK — this row cannot be deleted')
  if (pks.length === 0) throw new Error('No rows selected for deletion')
  if (pks.length > 500) throw new Error('At most 500 rows can be deleted at once')

  const params: Array<string | null> = []
  const tuples: string[] = []
  for (const row of pks) {
    const holes: string[] = []
    for (const col of keys) {
      if (!(col.name in row)) throw new Error(`Missing PK value: ${col.name}`)
      params.push(row[col.name] ?? null)
      holes.push(`$${params.length}`)
    }
    tuples.push(`(${holes.join(', ')})`)
  }
  const lhs = keys.map((c) => quoteIdent(c.name)).join(', ')
  return {
    text: `delete from ${qualify(schema, table)} where (${lhs}) in (${tuples.join(', ')})`,
    params
  }
}

/* ------------------------------------------------------------ misc */

export function clampInt(v: number, min: number, max: number): number {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}
