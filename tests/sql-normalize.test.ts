import { describe, expect, it } from 'vitest'
import { TEXT_TYPES, toResult, toSqlError } from '../src/main/core/sql/build.js'

const OIDS = new Map<number, string>([
  [23, 'int4'],
  [25, 'text']
])

describe('TEXT_TYPES', () => {
  it('dəyəri toxunmadan qaytarır', () => {
    const parse = TEXT_TYPES.getTypeParser()
    expect(parse('2024-01-01 10:00:00+00')).toBe('2024-01-01 10:00:00+00')
    expect(parse('{"a":1}')).toBe('{"a":1}')
  })
})

describe('toResult', () => {
  it('eyniadlı sütunları saxlayır', () => {
    const res = toResult(
      {
        command: 'SELECT',
        rowCount: 1,
        fields: [
          { name: 'a', dataTypeID: 23 },
          { name: 'a', dataTypeID: 23 }
        ],
        rows: [['2', '3']]
      },
      OIDS,
      100
    )
    expect(res.columns.map((c) => c.name)).toEqual(['a', 'a'])
    expect(res.columns[0]?.typeName).toBe('int4')
    expect(res.rows).toEqual([['2', '3']])
    expect(res.truncated).toBe(false)
  })

  it('naməlum oid üçün fallback ad verir', () => {
    const res = toResult({ fields: [{ name: 'x', dataTypeID: 99999 }], rows: [] }, OIDS, 10)
    expect(res.columns[0]?.typeName).toBe('oid:99999')
    expect(res.command).toBeNull()
  })

  it('maxRows-a görə kəsir', () => {
    const rows = Array.from({ length: 5 }, (_, i) => [String(i)])
    const res = toResult({ rows, rowCount: 5, fields: [{ name: 'i', dataTypeID: 23 }] }, OIDS, 3)
    expect(res.rows).toHaveLength(3)
    expect(res.truncated).toBe(true)
    expect(res.rowCount).toBe(5)
  })

  it('sütunsuz nəticəni (DDL) emal edir', () => {
    const res = toResult({ command: 'CREATE TABLE', rowCount: null }, OIDS, 100)
    expect(res.columns).toEqual([])
    expect(res.rows).toEqual([])
  })
})

describe('toSqlError', () => {
  it('pg xətasını tam köçürür və position-u 0-əsaslı edir', () => {
    const info = toSqlError({
      message: 'syntax error at or near "selct"',
      code: '42601',
      severity: 'ERROR',
      detail: 'detal',
      hint: 'ipucu',
      position: '8',
      table: 't',
      column: 'c',
      constraint: 'c_pkey',
      where: 'PL/pgSQL'
    })
    expect(info.position).toBe(7)
    expect(info.code).toBe('42601')
    expect(info.hint).toBe('ipucu')
    expect(info.detail).toBe('detal')
    expect(info.constraint).toBe('c_pkey')
  })

  it('adi Error-da position null olur', () => {
    const info = toSqlError(new Error('connect ECONNREFUSED'))
    expect(info.message).toBe('connect ECONNREFUSED')
    expect(info.position).toBeNull()
    expect(info.code).toBeNull()
  })

  it('obyekt olmayan dəyəri də emal edir', () => {
    expect(toSqlError('nə isə').message).toBe('nə isə')
  })
})
