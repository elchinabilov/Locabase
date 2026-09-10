import { describe, expect, it } from 'vitest'
import { inlineParams, qualify, quoteIdent, quoteLiteral } from '../src/main/core/sql/ident.js'

describe('quoteIdent', () => {
  it('quotes an ordinary name', () => {
    expect(quoteIdent('users')).toBe('"users"')
  })

  it('doubles inner quotes', () => {
    expect(quoteIdent('my"col')).toBe('"my""col"')
  })

  it('keeps non-ASCII letters as they are', () => {
    expect(quoteIdent('ödəniş_tarixi')).toBe('"ödəniş_tarixi"')
  })

  it('rejects an empty name', () => {
    expect(() => quoteIdent('')).toThrow(/Empty identifier/)
  })

  it('rejects a NUL byte', () => {
    expect(() => quoteIdent('a\0b')).toThrow(/NUL/)
  })

  it('an injection attempt stays a single identifier', () => {
    const out = quoteIdent('a"; drop table t; --')
    expect(out.startsWith('"')).toBe(true)
    expect(out.endsWith('"')).toBe(true)
    // no unpaired quote may remain inside
    expect(out.slice(1, -1).replaceAll('""', '')).not.toContain('"')
  })
})

describe('qualify', () => {
  it('joins schema and table', () => {
    expect(qualify('public', 'users')).toBe('"public"."users"')
  })
})

describe('quoteLiteral', () => {
  it('doubles a single quote', () => {
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'")
  })

  it('turns null into SQL null', () => {
    expect(quoteLiteral(null)).toBe('null')
  })

  it('turns an empty string into an empty literal (not null)', () => {
    expect(quoteLiteral('')).toBe("''")
  })

  it('keeps a backslash as it is', () => {
    expect(quoteLiteral('a\\b')).toBe("'a\\b'")
  })

  it('rejects a NUL byte', () => {
    expect(() => quoteLiteral('a\0b')).toThrow(/NUL/)
  })

  it('an injection attempt stays a closed literal', () => {
    expect(quoteLiteral("x'; drop table t; --")).toBe("'x''; drop table t; --'")
  })
})

describe('inlineParams', () => {
  it('substitutes in order', () => {
    expect(inlineParams('where "a" = $1 and "b" = $2', ['1', null])).toBe(
      `where "a" = '1' and "b" = null`
    )
  })

  it('reads $10 correctly', () => {
    const params = Array.from({ length: 10 }, (_, i) => String(i))
    expect(inlineParams('$10', params)).toBe("'9'")
  })

  it('throws on a missing parameter', () => {
    expect(() => inlineParams('$2', ['a'])).toThrow(/No such parameter/)
  })
})
