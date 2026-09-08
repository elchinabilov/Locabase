import { describe, expect, it } from 'vitest'
import { qualify, quoteIdent } from '../src/main/core/sql/ident.js'

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
