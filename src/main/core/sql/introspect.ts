/**
 * Sxem introspeksiyası — `pg_catalog` üzərindən.
 *
 * `information_schema` qəsdən istifadə edilmir: sahibi olmadığın cədvəlləri
 * gizlədir, `attidentity`/`attgenerated`-i təmiz vermir, sətir təxmini yoxdur
 * və nəzərəçarpacaq dərəcədə yavaşdır.
 */
import { poolFor } from './pool.js'
import { qualify } from './ident.js'
import type { DbColumn, DbCompletion, DbRelKind, DbSchema, DbTable } from '@shared/types.js'

/** Supabase-in öz sxemləri — filtrlənmir, sadəcə UI-da yığılır. */
const SUPABASE_SCHEMAS = new Set([
  'auth',
  'storage',
  'realtime',
  '_realtime',
  'graphql',
  'graphql_public',
  'extensions',
  'vault',
  'supabase_migrations',
  'supabase_functions',
  'net',
  'cron',
  'pgsodium',
  'pgsodium_masks'
])

const SCHEMAS_SQL = `
  select n.nspname as name,
         pg_catalog.pg_get_userbyid(n.nspowner) as owner,
         pg_catalog.obj_description(n.oid, 'pg_namespace') as comment
  from pg_catalog.pg_namespace n
  where $1::bool or (n.nspname <> 'information_schema' and n.nspname not like 'pg\\_%')
  order by (n.nspname = 'public') desc, n.nspname
`

export async function schemas(id: string, includeSystem: boolean): Promise<DbSchema[]> {
  const res = await poolFor(id).query<{ name: string; owner: string; comment: string | null }>(
    SCHEMAS_SQL,
    [includeSystem]
  )
  return res.rows.map((r) => ({
    name: r.name,
    owner: r.owner,
    comment: r.comment,
    system:
      SUPABASE_SCHEMAS.has(r.name) ||
      r.name === 'information_schema' ||
      r.name.startsWith('pg_')
  }))
}

const TABLES_SQL = `
  select c.relname as name,
         c.relkind as kind,
         c.reltuples::int8 as estimate,
         pg_catalog.pg_total_relation_size(c.oid)::int8 as bytes,
         c.relrowsecurity as rls,
         pg_catalog.obj_description(c.oid, 'pg_class') as comment,
         exists (
           select 1 from pg_catalog.pg_index i
           where i.indrelid = c.oid and i.indisprimary
         ) as has_pk
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = $1 and c.relkind in ('r','p','v','m','f')
  order by c.relkind, c.relname
`

interface TableRaw {
  name: string
  kind: string
  estimate: string
  bytes: string
  rls: boolean
  comment: string | null
  has_pk: boolean
}

export async function tables(id: string, schema: string): Promise<DbTable[]> {
  const res = await poolFor(id).query<TableRaw>(TABLES_SQL, [schema])
  return res.rows.map((r) => {
    const kind = r.kind as DbRelKind
    const isTable = kind === 'r' || kind === 'p'
    const editable = isTable && r.has_pk
    return {
      schema,
      name: r.name,
      kind,
      estimate: Number(r.estimate),
      bytes: Number(r.bytes),
      rls: r.rls,
      comment: r.comment,
      editable,
      editableReason: editable
        ? null
        : isTable
          ? 'PK yoxdur'
          : kind === 'v' || kind === 'm'
            ? 'Görünüş redaktə olunmur'
            : 'Xarici cədvəl redaktə olunmur'
    }
  })
}

/**
 * `$1::regclass` özü injection-a bağlıdır — ya real relation-a həll olur, ya da
 * xəta atır. `pkOrd` bool deyil, sıradır: kompozit PK-da `(a,b) in ((…))`
 * formasının ardıcıllığı bundan asılıdır.
 */
const COLUMNS_SQL = `
  with pk as (
    select a.attname, array_position(i.indkey::int2[], a.attnum) as ord
    from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = $1::regclass and i.indisprimary
  ),
  fk as (
    select a.attname,
           cn.nspname as ref_schema, cf.relname as ref_table, af.attname as ref_column
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_attribute a  on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    join pg_catalog.pg_class     cf on cf.oid = con.confrelid
    join pg_catalog.pg_namespace cn on cn.oid = cf.relnamespace
    join pg_catalog.pg_attribute af on af.attrelid = con.confrelid and af.attnum = con.confkey[1]
    where con.conrelid = $1::regclass and con.contype = 'f'
      and array_length(con.conkey, 1) = 1
  )
  select a.attnum::int4                                    as position,
         a.attname                                         as name,
         pg_catalog.format_type(a.atttypid, a.atttypmod)   as data_type,
         a.atttypid::int4                                  as type_oid,
         not a.attnotnull                                  as nullable,
         pg_catalog.pg_get_expr(d.adbin, d.adrelid)        as default_expr,
         a.attidentity  <> ''                              as is_identity,
         a.attgenerated <> ''                              as is_generated,
         pk.ord::int4                                      as pk_ord,
         fk.ref_schema, fk.ref_table, fk.ref_column,
         pg_catalog.col_description(a.attrelid, a.attnum)  as comment
  from pg_catalog.pg_attribute a
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  left join pk on pk.attname = a.attname
  left join fk on fk.attname = a.attname
  where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
  order by a.attnum
`

interface ColumnRaw {
  position: number
  name: string
  data_type: string
  type_oid: number
  nullable: boolean
  default_expr: string | null
  is_identity: boolean
  is_generated: boolean
  pk_ord: number | null
  ref_schema: string | null
  ref_table: string | null
  ref_column: string | null
  comment: string | null
}

/** Sətir CRUD hər əməliyyatda sütunları oxuyur — qısa keş gediş-gəlişi azaldır. */
const COL_TTL_MS = 5_000
const colCache = new Map<string, { at: number; cols: DbColumn[] }>()

export async function columns(id: string, schema: string, table: string): Promise<DbColumn[]> {
  const key = `${id}\0${schema}\0${table}`
  const hit = colCache.get(key)
  if (hit && Date.now() - hit.at < COL_TTL_MS) return hit.cols

  const res = await poolFor(id).query<ColumnRaw>(COLUMNS_SQL, [qualify(schema, table)])
  const cols: DbColumn[] = res.rows.map((r) => ({
    position: r.position,
    name: r.name,
    dataType: r.data_type,
    typeOid: r.type_oid,
    nullable: r.nullable,
    defaultExpr: r.default_expr,
    isIdentity: r.is_identity,
    isGenerated: r.is_generated,
    pkOrd: r.pk_ord,
    refSchema: r.ref_schema,
    refTable: r.ref_table,
    refColumn: r.ref_column,
    comment: r.comment
  }))
  colCache.set(key, { at: Date.now(), cols })
  return cols
}

/** DDL-dən sonra keşi at. */
export function forgetColumns(id: string): void {
  for (const key of [...colCache.keys()]) {
    if (key.startsWith(`${id}\0`)) colCache.delete(key)
  }
}

const COMPLETION_SQL = `
  select n.nspname as schema, c.relname as table, a.attname as column
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p','v','m','f') and a.attnum > 0 and not a.attisdropped
    and n.nspname <> 'information_schema' and n.nspname not like 'pg\\_%'
  order by n.nspname, c.relname, a.attnum
`

/** Avtotamamlama üçün bütün sxem/cədvəl/sütun adları — bir gediş-gəlişdə. */
export async function completion(id: string): Promise<DbCompletion> {
  const res = await poolFor(id).query<{ schema: string; table: string; column: string }>(
    COMPLETION_SQL
  )
  const map = new Map<string, { schema: string; table: string; columns: string[] }>()
  for (const row of res.rows) {
    const key = `${row.schema}.${row.table}`
    const entry = map.get(key) ?? { schema: row.schema, table: row.table, columns: [] }
    entry.columns.push(row.column)
    map.set(key, entry)
  }
  return { tables: [...map.values()] }
}
