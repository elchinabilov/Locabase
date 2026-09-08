/**
 * Saf SQL qurucuları və nəticə normalizasiyası. Burada nə `pg`, nə Electron
 * importu var — buna görə DB olmadan test olunur.
 *
 * İki qat injection qaydası:
 *  1. DƏYƏRLƏR həmişə `$n` parametridir. Bu faylda dəyəri SQL mətninə
 *     yapışdıran heç bir yol yoxdur.
 *  2. İDENTİFİKATORLAR həmişə `quoteIdent`-dən keçir VƏ əvvəlcə introspeksiya
 *     nəticəsindəki sütun siyahısında olmalıdır (`requireColumn`).
 */
import { quoteIdent, qualify } from './ident.js'
import type {
  DbCells,
  DbColumn,
  DbFilter,
  DbOp,
  DbOrder,
  DbRow,
  SqlColumn,
  SqlErrorInfo,
  SqlResult
} from '@shared/types.js'

/* ------------------------------------------------------------ normalizasiya */

/**
 * Hər sütun mətn kimi oxunur: Date, Buffer, bigint və JSON obyektləri heç vaxt
 * IPC sərhədini keçmir (structured clone Buffer-i pozar, bigint-i atardı).
 * IPC-dən keçən yeganə tiplər: `string | null`.
 */
export const TEXT_TYPES = { getTypeParser: () => (v: string) => v }

/** `pg`-nin QueryResult-undan bizə lazım olan hissə. */
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
 * pg xətası → serializasiya oluna bilən obyekt. Router yalnız `string`
 * qaytardığına görə bu obyekt uğurlu cavabın içində gedir.
 */
export function toSqlError(err: unknown): SqlErrorInfo {
  const e = (err ?? {}) as Record<string, unknown>
  const str = (k: string): string | null => (typeof e[k] === 'string' ? (e[k] as string) : null)
  const rawPos = e.position
  // pg `position` 1-əsaslı simvol ofsetidir; CodeMirror 0-əsaslı işləyir
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

/* ------------------------------------------------------------ sütun köməkçiləri */

export function requireColumn(cols: DbColumn[], name: string): DbColumn {
  const hit = cols.find((c) => c.name === name)
  if (!hit) throw new Error(`Bu cədvəldə belə sütun yoxdur: ${name}`)
  return hit
}

/** PK sütunları, PK-dakı sırası ilə. Boş massiv = PK yoxdur. */
export function pkColumns(cols: DbColumn[]): DbColumn[] {
  return cols
    .filter((c) => c.pkOrd !== null)
    .sort((a, b) => (a.pkOrd ?? 0) - (b.pkOrd ?? 0))
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
 * `where` fraqmenti. `start` — ilk placeholder nömrəsi (1-əsaslı).
 * `isnull`/`notnull` placeholder BURAXMIR — nömrələnmə buna görə
 * `params.length` üzərindən aparılır.
 */
export function buildWhere(cols: DbColumn[], filters: DbFilter[], start = 1): Fragment {
  if (filters.length === 0) return { text: '', params: [] }
  const params: Array<string | null> = []
  const parts: string[] = []
  for (const f of filters) {
    const col = requireColumn(cols, f.column)
    const op = OPS[f.op]
    if (!op) throw new Error(`Naməlum operator: ${String(f.op)}`)
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
    throw new Error(`Naməlum sıralama istiqaməti: ${String(order.dir)}`)
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
     * Hər sütunu `::text`-ə çevir. Uzaq mühitdə nəticə `json_agg` ilə gəlir və
     * tiplər JSON tiplərinə düşərdi (jsonb → obyekt, int → ədəd); mətnə
     * çevirmək lokaldakı `TEXT_TYPES` ilə eyni nəticəni verir.
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

/** `values`-dakı açar = açıq təyin; açar yoxdursa sütun «default» qalır. */
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
    if (col.isGenerated) throw new Error(`Hesablanan sütuna yazmaq olmaz: ${col.name}`)
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
  if (keys.length === 0) throw new Error('PK yoxdur — sətir redaktə oluna bilməz')
  const names = Object.keys(patch)
  if (names.length === 0) throw new Error('Dəyişiklik yoxdur')

  const params: Array<string | null> = []
  const sets: string[] = []
  for (const name of names) {
    const col = requireColumn(cols, name)
    if (col.isGenerated) throw new Error(`Hesablanan sütuna yazmaq olmaz: ${col.name}`)
    params.push(patch[name] ?? null)
    sets.push(`${quoteIdent(col.name)} = $${params.length}`)
  }

  const where: string[] = []
  for (const col of keys) {
    if (!(col.name in pk)) throw new Error(`PK dəyəri çatışmır: ${col.name}`)
    params.push(pk[col.name] ?? null)
    where.push(`${quoteIdent(col.name)} = $${params.length}`)
  }

  return {
    text: `update ${qualify(schema, table)} set ${sets.join(', ')} where ${where.join(' and ')} returning *`,
    params
  }
}

/** Kompozit PK üçün sətir konstruktoru: `where ("a","b") in (($1,$2),($3,$4))` */
export function buildDelete(
  schema: string,
  table: string,
  cols: DbColumn[],
  pks: DbCells[]
): Fragment {
  const keys = pkColumns(cols)
  if (keys.length === 0) throw new Error('PK yoxdur — sətir silinə bilməz')
  if (pks.length === 0) throw new Error('Silinəcək sətir seçilməyib')
  if (pks.length > 500) throw new Error('Bir dəfəyə ən çox 500 sətir silinə bilər')

  const params: Array<string | null> = []
  const tuples: string[] = []
  for (const row of pks) {
    const holes: string[] = []
    for (const col of keys) {
      if (!(col.name in row)) throw new Error(`PK dəyəri çatışmır: ${col.name}`)
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
