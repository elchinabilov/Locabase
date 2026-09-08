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
import type { DbColumn, DbFilter, DbOp } from '../src/shared/types.js'

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
  it('naməlum sütun rədd olunur', () => {
    expect(() => requireColumn(COLS, 'yox')).toThrow(/Bu cədvəldə belə sütun yoxdur/)
  })

  it('PK sütunları sıra ilə qayıdır', () => {
    expect(pkColumns(COLS).map((c) => c.name)).toEqual(['a', 'b'])
    expect(pkColumns([col('x')])).toEqual([])
  })
})

describe('buildWhere', () => {
  it('sadə bərabərlik', () => {
    const f = buildWhere(COLS, [{ column: 'a', op: 'eq', value: '1' }])
    expect(f.text).toBe('where "a" = $1')
    expect(f.params).toEqual(['1'])
  })

  it('parametrsiz operator nömrələnməni sürüşdürmür', () => {
    const filters: DbFilter[] = [
      { column: 'a', op: 'eq', value: '1' },
      { column: 'b', op: 'isnull', value: null },
      { column: 'c', op: 'eq', value: '2' }
    ]
    const f = buildWhere(COLS, filters)
    expect(f.text).toBe('where "a" = $1 and "b" is null and "c" = $2')
    expect(f.params).toEqual(['1', '2'])
  })

  it('boş filtr boş fraqment verir', () => {
    expect(buildWhere(COLS, [])).toEqual({ text: '', params: [] })
  })

  it('naməlum operator rədd olunur', () => {
    expect(() =>
      buildWhere(COLS, [{ column: 'a', op: 'drop' as DbOp, value: null }])
    ).toThrow(/Naməlum operator/)
  })

  it('dəyər içindəki injection yalnız parametrdə görünür', () => {
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

  it('başqa istiqaməti rədd edir', () => {
    expect(() =>
      buildOrder(COLS, { column: 'a', dir: 'desc; drop table t' as 'asc' })
    ).toThrow(/Naməlum sıralama/)
  })
})

describe('buildSelect / buildCount', () => {
  it('limit və offset tam ədəd kimi yapışdırılır', () => {
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

  it('limit/offset saxta dəyərdə clamp olunur', () => {
    const f = buildSelect('public', 'users', COLS, {
      filters: [],
      orderBy: null,
      limit: Number.NaN,
      offset: -5
    })
    expect(f.text).toContain('limit 1 offset 0')
  })

  it('count eyni filtri istifadə edir', () => {
    const f = buildCount('public', 'users', COLS, [{ column: 'c', op: 'ilike', value: '%a%' }])
    expect(f.text).toBe('select count(*)::int8 as n from "public"."users" where "c" ilike $1')
    expect(f.params).toEqual(['%a%'])
  })
})

describe('buildInsert', () => {
  it('açar sırası ilə parametrləşir', () => {
    const f = buildInsert('public', 't', COLS, { a: '1', c: null })
    expect(f.text).toBe('insert into "public"."t" ("a", "c") values ($1, $2) returning *')
    expect(f.params).toEqual(['1', null])
  })

  it('hesablanan sütuna yazmağı rədd edir', () => {
    expect(() => buildInsert('public', 't', COLS, { gen: '1' })).toThrow(/Hesablanan sütuna/)
  })

  it('boş dəyər dəsti default values verir', () => {
    expect(buildInsert('public', 't', COLS, {}).text).toBe(
      'insert into "public"."t" default values returning *'
    )
  })
})

describe('buildUpdate', () => {
  it('where bütün PK sütunlarını əhatə edir', () => {
    const f = buildUpdate('public', 't', COLS, { a: '1', b: '2' }, { c: 'yeni' })
    expect(f.text).toBe(
      'update "public"."t" set "c" = $1 where "a" = $2 and "b" = $3 returning *'
    )
    expect(f.params).toEqual(['yeni', '1', '2'])
  })

  it('PK olmayan cədvəldə rədd olunur', () => {
    expect(() => buildUpdate('public', 't', [col('x')], {}, { x: '1' })).toThrow(/PK yoxdur/)
  })

  it('çatışmayan PK dəyəri rədd olunur', () => {
    expect(() => buildUpdate('public', 't', COLS, { a: '1' }, { c: 'z' })).toThrow(
      /PK dəyəri çatışmır: b/
    )
  })

  it('boş patch rədd olunur', () => {
    expect(() => buildUpdate('public', 't', COLS, { a: '1', b: '2' }, {})).toThrow(
      /Dəyişiklik yoxdur/
    )
  })
})

describe('buildDelete', () => {
  it('kompozit PK üçün sətir konstruktoru qurur', () => {
    const f = buildDelete('public', 't', COLS, [
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ])
    expect(f.text).toBe('delete from "public"."t" where ("a", "b") in (($1, $2), ($3, $4))')
    expect(f.params).toEqual(['1', '2', '3', '4'])
  })

  it('500-dən çox sətri rədd edir', () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ a: String(i), b: '0' }))
    expect(() => buildDelete('public', 't', COLS, many)).toThrow(/ən çox 500/)
  })

  it('boş seçimi rədd edir', () => {
    expect(() => buildDelete('public', 't', COLS, [])).toThrow(/seçilməyib/)
  })
})

describe('buildSelect castText', () => {
  it('hər sütunu ::text-ə çevirir', () => {
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
