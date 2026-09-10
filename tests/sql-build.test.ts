import { describe, expect, it } from 'vitest'
import {
  buildCount,
  buildDelete,
  buildInsert,
  buildOrder,
  buildSelect,
  buildUpdate,
  buildWhere,
  pkColumns,
  requireColumn
} from '../src/main/core/sql/build.js'
import type { DbColumn, DbFilter, DbOp } from '../src/shared/types/index.js'

function col(name: string, over: Partial<DbColumn> = {}): DbColumn {
  return {
    position: 1,
    name,
    dataType: 'text',
    typeOid: 25,
    nullable: true,
    defaultExpr: null,
    isIdentity: false,
    isGenerated: false,
    pkOrd: null,
    refSchema: null,
    refTable: null,
    refColumn: null,
    comment: null,
    ...over
  }
}

const COLS = [
  col('a', { pkOrd: 0 }),
  col('b', { pkOrd: 1 }),
  col('c'),
  col('gen', { isGenerated: true })
]

describe('requireColumn / pkColumns', () => {
  it('rejects an unknown column', () => {
    expect(() => requireColumn(COLS, 'nope')).toThrow(/No such column on this table/)
  })

  it('returns PK columns in order', () => {
    expect(pkColumns(COLS).map((c) => c.name)).toEqual(['a', 'b'])
    expect(pkColumns([col('x')])).toEqual([])
  })
})

describe('buildWhere', () => {
  it('simple equality', () => {
    const f = buildWhere(COLS, [{ column: 'a', op: 'eq', value: '1' }])
    expect(f.text).toBe('where "a" = $1')
    expect(f.params).toEqual(['1'])
  })

  it('a parameterless operator does not shift the numbering', () => {
    const filters: DbFilter[] = [
      { column: 'a', op: 'eq', value: '1' },
      { column: 'b', op: 'isnull', value: null },
      { column: 'c', op: 'eq', value: '2' }
    ]
    const f = buildWhere(COLS, filters)
    expect(f.text).toBe('where "a" = $1 and "b" is null and "c" = $2')
    expect(f.params).toEqual(['1', '2'])
  })

  it('an empty filter gives an empty fragment', () => {
    expect(buildWhere(COLS, [])).toEqual({ text: '', params: [] })
  })

  it('rejects an unknown operator', () => {
    expect(() => buildWhere(COLS, [{ column: 'a', op: 'drop' as DbOp, value: null }])).toThrow(
      /Unknown operator/
    )
  })

  it('an injection inside a value only ever appears as a parameter', () => {
    const f = buildWhere(COLS, [{ column: 'a', op: 'eq', value: "1'; drop table t; --" }])
    expect(f.text).toBe('where "a" = $1')
    expect(f.text).not.toContain('drop')
    expect(f.params).toEqual(["1'; drop table t; --"])
  })
})

describe('buildOrder', () => {
  it('asc/desc emal edir', () => {
    expect(buildOrder(COLS, { column: 'a', dir: 'desc' })).toBe('order by "a" desc')
    expect(buildOrder(COLS, null)).toBe('')
  })

  it('rejects any other direction', () => {
    expect(() => buildOrder(COLS, { column: 'a', dir: 'desc; drop table t' as 'asc' })).toThrow(
      /Unknown sort direction/
    )
  })
})

describe('buildSelect / buildCount', () => {
  it('limit and offset are pasted as integers', () => {
    const f = buildSelect('public', 'users', COLS, {
      filters: [{ column: 'a', op: 'eq', value: 'x' }],
      orderBy: { column: 'b', dir: 'asc' },
      limit: 50,
      offset: 100
    })
    expect(f.text).toBe(
      'select * from "public"."users" where "a" = $1 order by "b" asc limit 50 offset 100'
    )
    expect(f.params).toEqual(['x'])
  })

  it('limit/offset are clamped on a bogus value', () => {
    const f = buildSelect('public', 'users', COLS, {
      filters: [],
      orderBy: null,
      limit: Number.NaN,
      offset: -5
    })
    expect(f.text).toContain('limit 1 offset 0')
  })

  it('count uses the same filter', () => {
    const f = buildCount('public', 'users', COLS, [{ column: 'c', op: 'ilike', value: '%a%' }])
    expect(f.text).toBe('select count(*)::int8 as n from "public"."users" where "c" ilike $1')
    expect(f.params).toEqual(['%a%'])
  })
})

describe('buildInsert', () => {
  it('parameterizes in key order', () => {
    const f = buildInsert('public', 't', COLS, { a: '1', c: null })
    expect(f.text).toBe('insert into "public"."t" ("a", "c") values ($1, $2) returning *')
    expect(f.params).toEqual(['1', null])
  })

  it('rejects writing to a generated column', () => {
    expect(() => buildInsert('public', 't', COLS, { gen: '1' })).toThrow(/generated column/)
  })

  it('an empty value set gives default values', () => {
    expect(buildInsert('public', 't', COLS, {}).text).toBe(
      'insert into "public"."t" default values returning *'
    )
  })
})

describe('buildUpdate', () => {
  it('the where clause covers every PK column', () => {
    const f = buildUpdate('public', 't', COLS, { a: '1', b: '2' }, { c: 'yeni' })
    expect(f.text).toBe('update "public"."t" set "c" = $1 where "a" = $2 and "b" = $3 returning *')
    expect(f.params).toEqual(['yeni', '1', '2'])
  })

  it('rejects a table without a PK', () => {
    expect(() => buildUpdate('public', 't', [col('x')], {}, { x: '1' })).toThrow(/No PK/)
  })

  it('rejects a missing PK value', () => {
    expect(() => buildUpdate('public', 't', COLS, { a: '1' }, { c: 'z' })).toThrow(
      /Missing PK value: b/
    )
  })

  it('rejects an empty patch', () => {
    expect(() => buildUpdate('public', 't', COLS, { a: '1', b: '2' }, {})).toThrow(
      /Nothing changed/
    )
  })
})

describe('buildDelete', () => {
  it('builds a row constructor for a composite PK', () => {
    const f = buildDelete('public', 't', COLS, [
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ])
    expect(f.text).toBe('delete from "public"."t" where ("a", "b") in (($1, $2), ($3, $4))')
    expect(f.params).toEqual(['1', '2', '3', '4'])
  })

  it('rejects more than 500 rows', () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ a: String(i), b: '0' }))
    expect(() => buildDelete('public', 't', COLS, many)).toThrow(/At most 500 rows/)
  })

  it('rejects an empty selection', () => {
    expect(() => buildDelete('public', 't', COLS, [])).toThrow(/No rows selected/)
  })
})

describe('buildSelect castText', () => {
  it('casts every column to ::text', () => {
    const f = buildSelect('public', 't', [col('a'), col('b')], {
      filters: [],
      orderBy: null,
      limit: 10,
      offset: 0,
      castText: true
    })
    expect(f.text).toBe(
      'select "a"::text as "a", "b"::text as "b" from "public"."t" limit 10 offset 0'
    )
  })
})
