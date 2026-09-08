import { describe, expect, it } from 'vitest'
import { parseCsv, parsePsqlCsv, parsePsqlError } from '../src/main/core/sql/csv.js'

describe('parseCsv', () => {
  it('sadə cədvəl', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('dırnaqlı sahədə vergül və sətir keçidi', () => {
    expect(parseCsv('a,b\n"x,y","iki\nsətir"\n')).toEqual([
      ['a', 'b'],
      ['x,y', 'iki\nsətir']
    ])
  })

  it('ikiləndirilmiş dırnaq', () => {
    expect(parseCsv('a\n"de""mə"\n')).toEqual([['a'], ['de"mə']])
  })

  it('boş sahələr qorunur', () => {
    expect(parseCsv('a,b,c\n,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['', '', '']
    ])
  })

  it('sonda sətir keçidi olmadan', () => {
    expect(parseCsv('a\n1')).toEqual([['a'], ['1']])
  })

  it('CRLF-i udur', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('boş çıxış boş massiv verir', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('JSON blobu bütöv qalır', () => {
    const json = '{"a": 1, "b": "x,y"}'
    const csv = `data\n"${json.replaceAll('"', '""')}"\n`
    expect(parseCsv(csv)[1]?.[0]).toBe(json)
  })
})

describe('parsePsqlCsv', () => {
  const TOKEN = 'lb-null-7f3a'

  it('NULL ilə boş sətri ayırır', () => {
    const out = `a,b\n${TOKEN},\n`
    expect(parsePsqlCsv(out, TOKEN)).toEqual({
      columns: ['a', 'b'],
      rows: [[null, '']]
    })
  })

  it('nəticəsiz ifadə boş sütun siyahısı verir', () => {
    expect(parsePsqlCsv('', TOKEN)).toEqual({ columns: [], rows: [] })
  })

  it('sentinel dəyər kimi görünsə də yalnız tam uyğunluq null olur', () => {
    const out = `a\n${TOKEN}x\n`
    expect(parsePsqlCsv(out, TOKEN).rows[0]?.[0]).toBe(`${TOKEN}x`)
  })
})

describe('parsePsqlError', () => {
  it('ERROR/DETAIL/HINT ayırır', () => {
    const out = [
      'psql:<stdin>:2: ERROR:  null value in column "adı" violates not-null constraint',
      'DETAIL:  Failing row contains (1, null).',
      'HINT:  Bir dəyər ver.'
    ].join('\n')
    const e = parsePsqlError(out)
    expect(e.message).toContain('violates not-null constraint')
    expect(e.detail).toContain('Failing row')
    expect(e.hint).toBe('Bir dəyər ver.')
  })

  it('DETAIL yoxdursa LINE kontekstini götürür', () => {
    const out = [
      'psql:<stdin>:1: ERROR:  syntax error at or near "selct"',
      'LINE 1: selct 1',
      '        ^'
    ].join('\n')
    const e = parsePsqlError(out)
    expect(e.message).toContain('syntax error')
    expect(e.detail).toContain('LINE 1: selct 1')
  })

  it('tanınmayan çıxışda ilk sətri qaytarır', () => {
    expect(parsePsqlError('ssh: connect to host x port 22: refused').message).toContain('ssh')
  })
})
