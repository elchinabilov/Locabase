import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseToml } from 'smol-toml'
import { applyPatches, serializeValue, TomlPatchError } from '../src/main/core/toml/patch.js'
import { scanToml } from '../src/main/core/toml/scan.js'

const fixtures = ['next-cv', 'alocar', 'e-tehsil'] as const
const load = (n: string): string =>
  readFileSync(resolve(__dirname, `fixtures/${n}.config.toml`), 'utf8')

/** Sətir-sətir fərq: dəyişən sətirlərin sayı. */
function lineDiff(a: string, b: string): number {
  const la = a.split('\n')
  const lb = b.split('\n')
  let n = Math.abs(la.length - lb.length)
  for (let i = 0; i < Math.min(la.length, lb.length); i++) if (la[i] !== lb[i]) n++
  return n
}

describe('scanToml', () => {
  it.each(fixtures)('%s: hər açar smol-toml ilə eyni nəticə verir', (name) => {
    const src = load(name)
    const scan = scanToml(src)
    const parsed = parseToml(src) as Record<string, unknown>

    expect(scan.entries.length).toBeGreaterThan(20)

    for (const entry of scan.entries) {
      // skan etdiyimiz aralıq tək başına parse olunmalıdır
      const raw = src.slice(entry.valueStart, entry.valueEnd)
      const round = parseToml(`x = ${raw}`) as { x: unknown }
      let actual: unknown = parsed
      for (const seg of entry.path.split('.')) {
        actual = (actual as Record<string, unknown>)?.[seg]
      }
      if (Array.isArray(round.x)) expect(actual).toEqual(round.x)
      else expect(actual).toBe(round.x)
    }
  })

  it('next-cv: cədvəllər və şərh sətirləri düzgün ayrılır', () => {
    const scan = scanToml(load('next-cv'))
    expect(scan.tableByPath.has('auth.external.linkedin_oidc')).toBe(true)
    expect(scan.byPath.get('auth.external.linkedin_oidc.client_id')).toBeDefined()
    expect(scan.byPath.get('project_id')).toBeDefined()
    // şərh içindəki `[edge_runtime]` kimi mətnlər cədvəl kimi tutulmamalıdır
    expect(scan.tableByPath.has('functions')).toBe(false)
  })
})

describe('applyPatches — round-trip', () => {
  it.each(fixtures)('%s: yamaqsız → bayt-bayt eyni', (name) => {
    const src = load(name)
    expect(applyPatches(src, []).text).toBe(src)
  })

  it.each(fixtures)('%s: eyni dəyər yazılanda fayl dəyişmir', (name) => {
    const src = load(name)
    const parsed = parseToml(src) as Record<string, unknown>
    const patches = scanToml(src)
      .entries.filter((e) => {
        let v: unknown = parsed
        for (const seg of e.path.split('.')) v = (v as Record<string, unknown>)?.[seg]
        return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      })
      .map((e) => {
        let v: unknown = parsed
        for (const seg of e.path.split('.')) v = (v as Record<string, unknown>)?.[seg]
        return { path: e.path, value: v as string | number | boolean }
      })

    expect(patches.length).toBeGreaterThan(50)
    const out = applyPatches(src, patches)
    expect(out.text).toBe(src)
    expect(out.changed).toBe(false)
  })
})

describe('applyPatches — nöqtəvi dəyişiklik', () => {
  it('next-cv: auth.jwt_expiry → tam bir sətir dəyişir, şərhlər yerində', () => {
    const src = load('next-cv')
    const out = applyPatches(src, [{ path: 'auth.jwt_expiry', value: 7200 }])
    expect(lineDiff(src, out.text)).toBe(1)
    expect(out.text).toContain('jwt_expiry = 7200')
    // qonşu şərh blokları toxunulmamışdır
    expect(out.text).toContain('# Mailpit — lokalda göndərilən e-poçtlar həqiqətən getmir')
    expect(out.text.split('\n').length).toBe(src.split('\n').length)
  })

  it('inline şərhli sətirdə şərh qalır', () => {
    const src = ['[db]', 'port = 54322 # portu dəyişmə', ''].join('\n')
    const out = applyPatches(src, [{ path: 'db.port', value: 56322 }])
    expect(out.text).toBe(['[db]', 'port = 56322 # portu dəyişmə', ''].join('\n'))
  })

  it('massiv dəyəri əvəz olunur', () => {
    const src = load('next-cv')
    const out = applyPatches(src, [
      { path: 'api.schemas', value: ['public', 'graphql_public', 'storage'] }
    ])
    expect(out.text).toContain('schemas = ["public", "graphql_public", "storage"]')
    expect(lineDiff(src, out.text)).toBe(1)
  })

  it('env() referensi yazılır', () => {
    const src = load('next-cv')
    const out = applyPatches(src, [
      { path: 'auth.external.google.secret', value: { env: 'GOOGLE_SECRET_2' } }
    ])
    expect(out.text).toContain('secret = "env(GOOGLE_SECRET_2)"')
  })
})

describe('applyPatches — əlavə və silmə', () => {
  it('mövcud cədvələ yeni açar onun sonuna düşür', () => {
    const src = load('next-cv')
    const out = applyPatches(src, [{ path: 'auth.external.google.tenant_id', value: 'abc' }])
    const lines = out.text.split('\n')
    const idx = lines.findIndex((l) => l.includes('tenant_id = "abc"'))
    expect(idx).toBeGreaterThan(-1)
    // google seksiyasının içində, növbəti `[` başlığından əvvəl
    const gh = lines.findIndex((l) => l.trim() === '[auth.external.google]')
    expect(idx).toBeGreaterThan(gh)
    const nextHeader = lines.findIndex((l, i) => i > gh && l.trim().startsWith('['))
    expect(idx).toBeLessThan(nextHeader)
  })

  it('olmayan cədvəl faylın sonuna əlavə olunur və parse olunur', () => {
    const src = load('next-cv')
    const out = applyPatches(src, [
      { path: 'auth.external.apple.enabled', value: true },
      { path: 'auth.external.apple.client_id', value: { env: 'APPLE_CLIENT_ID' } }
    ])
    const parsed = parseToml(out.text) as any
    expect(parsed.auth.external.apple.enabled).toBe(true)
    expect(parsed.auth.external.apple.client_id).toBe('env(APPLE_CLIENT_ID)')
    // mövcud hissə toxunulmayıb
    expect(out.text.startsWith(src.trimEnd())).toBe(true)
  })

  it('açar silinir və qalan fayl parse olunur', () => {
    const src = load('next-cv')
    const out = applyPatches(src, [{ path: 'auth.jwt_expiry', value: undefined }])
    expect(out.text).not.toContain('jwt_expiry')
    expect(out.text.split('\n').length).toBe(src.split('\n').length - 1)
    expect(() => parseToml(out.text)).not.toThrow()
  })
})

describe('validate qapısı', () => {
  it('serializeValue sonsuz rəqəmi rədd edir', () => {
    expect(() => serializeValue(Number.POSITIVE_INFINITY)).toThrow(TomlPatchError)
  })

  it('dırnaq və tərs-slash qaçırılır', () => {
    const out = applyPatches('[auth]\nsite_url = "x"\n', [
      { path: 'auth.site_url', value: 'a"b\\c' }
    ])
    expect(parseToml(out.text)).toEqual({ auth: { site_url: 'a"b\\c' } })
  })
})
