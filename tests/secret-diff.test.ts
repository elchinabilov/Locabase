import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { RemoteSecret } from '../src/shared/types/index.js'
import {
  buildSecretDiff,
  remoteNameOf,
  secretsDirty,
  valueMatches
} from '../src/main/core/secret-diff.js'

const plain = (name: string, value: string): RemoteSecret => ({ name, value, digest: null })
const hashed = (name: string, digest: string): RemoteSecret => ({ name, value: null, digest })
const sha = (v: string): string => createHash('sha256').update(v).digest('hex')

describe('remoteNameOf', () => {
  it('pushes an unmapped key under its own name', () => {
    expect(remoteNameOf({}, 'OPENAI_API_KEY')).toBe('OPENAI_API_KEY')
    expect(remoteNameOf(undefined, 'OPENAI_API_KEY')).toBe('OPENAI_API_KEY')
  })

  it('renames a mapped key', () => {
    const map = { SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID' }
    expect(remoteNameOf(map, 'SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID')).toBe('GOOGLE_CLIENT_ID')
  })

  it('treats an empty mapping as no mapping', () => {
    expect(remoteNameOf({ A: '' }, 'A')).toBe('A')
  })
})

describe('valueMatches', () => {
  it('compares a readable value directly', () => {
    expect(valueMatches(plain('A', 'x'), 'x')).toBe(true)
    expect(valueMatches(plain('A', 'x'), 'y')).toBe(false)
  })

  it('accepts a digest that is the sha256 of the local value', () => {
    expect(valueMatches(hashed('A', sha('secret')), 'secret')).toBe(true)
  })

  it('accepts a fingerprint that is the value itself', () => {
    expect(valueMatches(hashed('A', 'secret'), 'secret')).toBe(true)
  })

  // A mismatched fingerprint proves nothing — we do not know how it was derived,
  // so it must never be reported as a difference.
  it('says "cannot tell" rather than "changed" for an unrecognised digest', () => {
    expect(valueMatches(hashed('A', 'deadbeef'), 'secret')).toBeNull()
    expect(valueMatches(hashed('A', ''), 'secret')).toBeNull()
  })
})

describe('buildSecretDiff', () => {
  const local = new Map([
    ['OPENAI_API_KEY', 'sk-1'],
    ['SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID', 'goog-1'],
    ['ONLY_LOCAL', 'v']
  ])

  it('compares under the mapping and reports each state once', () => {
    const rows = buildSecretDiff(
      local,
      [
        plain('OPENAI_API_KEY', 'sk-1'),
        plain('GOOGLE_CLIENT_ID', 'stale'),
        plain('POSTGRES_PORT', '5432')
      ],
      { SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID' }
    )
    const byKey = new Map(rows.map((r) => [r.key, r]))

    expect(byKey.get('OPENAI_API_KEY')!.where).toBe('both')
    expect(byKey.get('SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID')).toMatchObject({
      where: 'changed',
      remoteKey: 'GOOGLE_CLIENT_ID',
      mapped: true
    })
    expect(byKey.get('ONLY_LOCAL')!.where).toBe('local-only')
    expect(byKey.get('POSTGRES_PORT')!.where).toBe('remote-only')
  })

  it('does not list a mapped remote key a second time as remote-only', () => {
    const rows = buildSecretDiff(new Map([['A', 'v']]), [plain('B', 'v')], { A: 'B' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: 'A', remoteKey: 'B', where: 'both' })
  })

  it('reports an unreadable remote as `both`, never as changed', () => {
    const rows = buildSecretDiff(new Map([['A', 'v']]), [hashed('A', 'unknown-scheme')], {})
    expect(rows[0]!.where).toBe('both')
  })
})

describe('secretsDirty', () => {
  // The self-hosted `.env` is the whole Docker configuration; its extra keys are
  // not drift, or the axis would never be clean.
  it('ignores remote-only rows', () => {
    const rows = buildSecretDiff(new Map(), [plain('POSTGRES_PORT', '5432')], {})
    expect(rows).toHaveLength(1)
    expect(secretsDirty(rows)).toBe(false)
  })

  it('is true for a missing or differing key', () => {
    expect(secretsDirty(buildSecretDiff(new Map([['A', 'v']]), [], {}))).toBe(true)
    expect(secretsDirty(buildSecretDiff(new Map([['A', 'v']]), [plain('A', 'w')], {}))).toBe(true)
  })

  it('is false when everything matches', () => {
    expect(secretsDirty(buildSecretDiff(new Map([['A', 'v']]), [plain('A', 'v')], {}))).toBe(false)
  })
})
