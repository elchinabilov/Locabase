import { describe, expect, it } from 'vitest'
import { inlineParams, qualify, quoteIdent, quoteLiteral } from '../src/main/core/sql/ident.js'

describe('quoteIdent', () => {
  it('adi adı dırnaqlayır', () => {
    expect(quoteIdent('users')).toBe('"users"')
  })

  it('daxili dırnaqları ikiləndirir', () => {
    expect(quoteIdent('my"col')).toBe('"my""col"')
  })

  it('Azərbaycan hərflərini olduğu kimi saxlayır', () => {
    expect(quoteIdent('ödəniş_tarixi')).toBe('"ödəniş_tarixi"')
  })

  it('boş adı rədd edir', () => {
    expect(() => quoteIdent('')).toThrow(/Boş identifikator/)
  })

  it('NUL baytını rədd edir', () => {
    expect(() => quoteIdent('a\0b')).toThrow(/NUL/)
  })

  it('injection cəhdi tək bir identifikator olaraq qalır', () => {
    const out = quoteIdent('a"; drop table t; --')
    expect(out.startsWith('"')).toBe(true)
    expect(out.endsWith('"')).toBe(true)
    // daxildə qoşalanmamış dırnaq qalmamalıdır
    expect(out.slice(1, -1).replaceAll('""', '')).not.toContain('"')
  })
})

describe('qualify', () => {
  it('sxem və cədvəli birləşdirir', () => {
    expect(qualify('public', 'users')).toBe('"public"."users"')
  })
})

describe('quoteLiteral', () => {
  it('tək dırnağı ikiləndirir', () => {
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'")
  })

  it('null-u SQL null-a çevirir', () => {
    expect(quoteLiteral(null)).toBe('null')
  })

  it('boş sətri boş literal edir (null deyil)', () => {
    expect(quoteLiteral('')).toBe("''")
  })

  it('tərs xətti olduğu kimi saxlayır', () => {
    expect(quoteLiteral('a\\b')).toBe("'a\\b'")
  })

  it('NUL baytını rədd edir', () => {
    expect(() => quoteLiteral('a\0b')).toThrow(/NUL/)
  })

  it('injection cəhdi bağlı literal olaraq qalır', () => {
    expect(quoteLiteral("x'; drop table t; --")).toBe("'x''; drop table t; --'")
  })
})

describe('inlineParams', () => {
  it('sıra ilə əvəzləyir', () => {
    expect(inlineParams('where "a" = $1 and "b" = $2', ['1', null])).toBe(
      `where "a" = '1' and "b" = null`
    )
  })

  it('$10-u düzgün oxuyur', () => {
    const params = Array.from({ length: 10 }, (_, i) => String(i))
    expect(inlineParams('$10', params)).toBe("'9'")
  })

  it('çatışmayan parametrdə xəta atır', () => {
    expect(() => inlineParams('$2', ['a'])).toThrow(/Parametr yoxdur/)
  })
})
