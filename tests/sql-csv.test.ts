import { describe, expect, it } from 'vitest'
import { parseCsv, parsePsqlCsv, parsePsqlError } from '../src/main/core/sql/csv.js'

describe('parseCsv', () => {
  it('a simple table', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('a comma and a line break inside a quoted field', () => {
    expect(parseCsv('a,b\n"x,y","two\nlines"\n')).toEqual([
      ['a', 'b'],
      ['x,y', 'two\nlines']
    ])
  })

  it('a doubled quote', () => {
    expect(parseCsv('a\n"do""nt"\n')).toEqual([['a'], ['do"nt']])
  })

  it('empty fields are preserved', () => {
    expect(parseCsv('a,b,c\n,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['', '', '']
    ])
  })

  it('without a trailing newline', () => {
    expect(parseCsv('a\n1')).toEqual([['a'], ['1']])
  })

  it('CRLF-i udur', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('empty output gives an empty array', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('a JSON blob stays intact', () => {
    const json = '{"a": 1, "b": "x,y"}'
    const csv = `data\n"${json.replaceAll('"', '""')}"\n`
    expect(parseCsv(csv)[1]?.[0]).toBe(json)
  })
})

describe('parsePsqlCsv', () => {
  const TOKEN = 'lb-null-7f3a'

  it('tells NULL apart from an empty string', () => {
    const out = `a,b\n${TOKEN},\n`
    expect(parsePsqlCsv(out, TOKEN)).toEqual({
      columns: ['a', 'b'],
      rows: [[null, '']]
    })
  })

  it('a statement with no result gives an empty column list', () => {
    expect(parsePsqlCsv('', TOKEN)).toEqual({ columns: [], rows: [] })
  })

  it('only an exact match becomes null, even when the value looks like the sentinel', () => {
    const out = `a\n${TOKEN}x\n`
    expect(parsePsqlCsv(out, TOKEN).rows[0]?.[0]).toBe(`${TOKEN}x`)
  })
})

describe('parsePsqlError', () => {
  it('separates ERROR/DETAIL/HINT', () => {
    const out = [
      'psql:<stdin>:2: ERROR:  null value in column "name" violates not-null constraint',
      'DETAIL:  Failing row contains (1, null).',
      'HINT:  Provide a value.'
    ].join('\n')
    const e = parsePsqlError(out)
    expect(e.message).toContain('violates not-null constraint')
    expect(e.detail).toContain('Failing row')
    expect(e.hint).toBe('Provide a value.')
  })

  it('falls back to the LINE context when there is no DETAIL', () => {
    const out = [
      'psql:<stdin>:1: ERROR:  syntax error at or near "selct"',
      'LINE 1: selct 1',
      '        ^'
    ].join('\n')
    const e = parsePsqlError(out)
    expect(e.message).toContain('syntax error')
    expect(e.detail).toContain('LINE 1: selct 1')
  })

  it('returns the first line of unrecognized output', () => {
    expect(parsePsqlError('ssh: connect to host x port 22: refused').message).toContain('ssh')
  })
})
