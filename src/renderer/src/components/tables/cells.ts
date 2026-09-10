/**
 * The two derivations the table screens share: a row's primary key, and the
 * short type hint shown under a column header.
 */
import type { DbCells, DbColumn, DbRow } from '@shared/types'

export function pkCells(columns: DbColumn[], row: DbRow): DbCells {
  const out: DbCells = {}
  columns.forEach((c, i) => {
    if (c.pkOrd !== null) out[c.name] = row[i] ?? null
  })
  return out
}

export function shortType(c: DbColumn): string {
  const pk = c.pkOrd !== null ? '🔑' : ''
  return `${pk}${c.dataType}`
}
