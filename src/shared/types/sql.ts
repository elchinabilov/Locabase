/**
 * The SQL editor and the table browser: results, errors, and the introspected schema.
 */

/** One row — every cell is text (see `TEXT_TYPES` in `sql/build.ts`). */
export type DbRow = Array<string | null>
/** Column name → value. `null` = SQL NULL; a missing key = "default". */
export type DbCells = Record<string, string | null>

export interface SqlColumn {
  name: string
  typeOid: number
  /** `pg_type.typname`; `oid:<n>` when unrecognized */
  typeName: string
}

export interface SqlResult {
  /** `SELECT`, `INSERT`, `CREATE TABLE`, … */
  command: string | null
  columns: SqlColumn[]
  rows: DbRow[]
  rowCount: number | null
  /** truncated because of the `maxRows` limit */
  truncated: boolean
}

export interface SqlErrorInfo {
  message: string
  code: string | null
  severity: string | null
  detail: string | null
  hint: string | null
  /** 0-based character offset — to mark the offending token in the editor */
  position: number | null
  where: string | null
  table: string | null
  column: string | null
  constraint: string | null
}

export interface SqlRun {
  ok: boolean
  /** one result per statement, for a multi-statement script */
  results: SqlResult[]
  durationMs: number
  readOnly: boolean
  error: SqlErrorInfo | null
}

export interface SavedQuery {
  name: string
  path: string
  bytes: number
  updatedAt: string
}

export interface DbSchema {
  name: string
  owner: string
  comment: string | null
  /** `pg_*`, `information_schema` and Supabase's internal schemas */
  system: boolean
}

/** r=table p=partitioned v=view m=materialized f=foreign */
export type DbRelKind = 'r' | 'p' | 'v' | 'm' | 'f'

export interface DbTable {
  schema: string
  name: string
  kind: DbRelKind
  /** the `reltuples` estimate; -1 on PG14+ when never analyzed */
  estimate: number
  bytes: number
  rls: boolean
  comment: string | null
  editable: boolean
  /** the reason when `editable: false`, e.g. «No PK» */
  editableReason: EditableReason | null
}

export interface DbColumn {
  position: number
  name: string
  dataType: string
  typeOid: number
  nullable: boolean
  defaultExpr: string | null
  isIdentity: boolean
  isGenerated: boolean
  /** null = not part of the PK; a number = its position in the PK */
  pkOrd: number | null
  refSchema: string | null
  refTable: string | null
  refColumn: string | null
  comment: string | null
}

export type DbOp =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'isnull' | 'notnull'

export interface DbFilter {
  column: string
  op: DbOp
  /** ignored for `isnull`/`notnull` */
  value: string | null
}

export interface DbOrder {
  column: string
  dir: 'asc' | 'desc'
}

/**
 * Why a relation cannot be edited. A CODE, not a sentence: the main process has
 * no locale, so the wording belongs to the renderer's dictionary.
 */
export type EditableReason = 'no-pk' | 'view' | 'foreign-table'

export interface DbRowsPage {
  columns: DbColumn[]
  rows: DbRow[]
  /** null = no exact count was computed (the table is large) */
  total: number | null
  editable: boolean
  editableReason: EditableReason | null
}
