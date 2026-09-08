import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseToml } from 'smol-toml'
import { applyPatches, serializeValue, TomlPatchError } from '../src/main/core/toml/patch.js'
import { scanToml } from '../src/main/core/toml/scan.js'

const fixtures = ['sample-a', 'sample-b', 'sample-c'] as const
const load = (n: string): string =>
  readFileSync(resolve(__dirname, `fixtures/${n}.config.toml`), 'utf8')

/** Line-by-line difference: how many lines changed. */
function lineDiff(a: string, b: string): number {
  const la = a.split('\n')
  const lb = b.split('\n')
  let n = Math.abs(la.length - lb.length)
  for (let i = 0; i < Math.min(la.length, lb.length); i++) if (la[i] !== lb[i]) n++
  return n
}

describe('scanToml', () => {
  it.each(fixtures)('%s: every key matches what smol-toml reads', (name) => {
    const src = load(name)
    const scan = scanToml(src)
    const parsed = parseToml(src) as Record<string, unknown>

    expect(scan.entries.length).toBeGreaterThan(20)

    for (const entry of scan.entries) {
      // the range we scanned has to parse on its own
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

  it('sample-c: tables and comment lines are separated correctly', () => {
    const scan = scanToml(load('sample-c'))
    expect(scan.tableByPath.has('auth.external.linkedin_oidc')).toBe(true)
    expect(scan.byPath.get('auth.external.linkedin_oidc.client_id')).toBeDefined()
    expect(scan.byPath.get('project_id')).toBeDefined()
    // text like `[edge_runtime]` inside a comment must not be taken for a table
    expect(scan.tableByPath.has('functions')).toBe(false)
  })
})

describe('applyPatches — round-trip', () => {
  it.each(fixtures)('%s: no patches → byte-for-byte identical', (name) => {
    const src = load(name)
    expect(applyPatches(src, []).text).toBe(src)
  })

  it.each(fixtures)('%s: writing the same value leaves the file unchanged', (name) => {
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

describe('applyPatches — a pinpoint change', () => {
  it('sample-c: auth.jwt_expiry → exactly one line changes, comments stay put', () => {
    const src = load('sample-c')
    const out = applyPatches(src, [{ path: 'auth.jwt_expiry', value: 7200 }])
    expect(lineDiff(src, out.text)).toBe(1)
    expect(out.text).toContain('jwt_expiry = 7200')
    // the neighbouring comment blocks are untouched
    expect(out.text).toContain('# Mailpit — mail sent locally never really leaves')
    expect(out.text.split('\n').length).toBe(src.split('\n').length)
  })

  it('an inline comment survives on the line', () => {
    const src = ['[db]', 'port = 54322 # do not change the port', ''].join('\n')
    const out = applyPatches(src, [{ path: 'db.port', value: 56322 }])
    expect(out.text).toBe(['[db]', 'port = 56322 # do not change the port', ''].join('\n'))
  })

  it('an array value is replaced', () => {
    const src = load('sample-c')
    const out = applyPatches(src, [
      { path: 'api.schemas', value: ['public', 'graphql_public', 'storage'] }
    ])
    expect(out.text).toContain('schemas = ["public", "graphql_public", "storage"]')
    expect(lineDiff(src, out.text)).toBe(1)
  })

  it('an env() reference is written', () => {
    const src = load('sample-c')
    const out = applyPatches(src, [
      { path: 'auth.external.google.secret', value: { env: 'GOOGLE_SECRET_2' } }
    ])
    expect(out.text).toContain('secret = "env(GOOGLE_SECRET_2)"')
  })
})

describe('applyPatches — adding and deleting', () => {
  it('a new key lands at the end of its existing table', () => {
    const src = load('sample-c')
    const out = applyPatches(src, [{ path: 'auth.external.google.tenant_id', value: 'abc' }])
    const lines = out.text.split('\n')
    const idx = lines.findIndex((l) => l.includes('tenant_id = "abc"'))
    expect(idx).toBeGreaterThan(-1)
    // inside the google section, before the next `[` header
    const gh = lines.findIndex((l) => l.trim() === '[auth.external.google]')
    expect(idx).toBeGreaterThan(gh)
    const nextHeader = lines.findIndex((l, i) => i > gh && l.trim().startsWith('['))
    expect(idx).toBeLessThan(nextHeader)
  })

  it('a missing table is appended at the end of the file and parses', () => {
    const src = load('sample-c')
    const out = applyPatches(src, [
      { path: 'auth.external.apple.enabled', value: true },
      { path: 'auth.external.apple.client_id', value: { env: 'APPLE_CLIENT_ID' } }
    ])
    const parsed = parseToml(out.text) as any
    expect(parsed.auth.external.apple.enabled).toBe(true)
    expect(parsed.auth.external.apple.client_id).toBe('env(APPLE_CLIENT_ID)')
    // the existing part is untouched
    expect(out.text.startsWith(src.trimEnd())).toBe(true)
  })

  it('a key is deleted and the rest of the file still parses', () => {
    const src = load('sample-c')
    const out = applyPatches(src, [{ path: 'auth.jwt_expiry', value: undefined }])
    expect(out.text).not.toContain('jwt_expiry')
    expect(out.text.split('\n').length).toBe(src.split('\n').length - 1)
    expect(() => parseToml(out.text)).not.toThrow()
  })
})

describe('the validate gate', () => {
  it('serializeValue rejects a non-finite number', () => {
    expect(() => serializeValue(Number.POSITIVE_INFINITY)).toThrow(TomlPatchError)
  })

  it('quotes and backslashes are escaped', () => {
    const out = applyPatches('[auth]\nsite_url = "x"\n', [
      { path: 'auth.site_url', value: 'a"b\\c' }
    ])
    expect(parseToml(out.text)).toEqual({ auth: { site_url: 'a"b\\c' } })
  })
})
