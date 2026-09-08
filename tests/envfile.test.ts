import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteKey, mask, readMap, readRaw, writeKeys } from '../src/main/core/envfile.js'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'supagui-env-'))
  file = join(dir, '.env')
})

const SAMPLE = `# Local backend secrets — gitignored
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=123-abc.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="GOCSPX-super-secret"

# LinkedIn
SUPABASE_AUTH_EXTERNAL_LINKEDIN_OIDC_CLIENT_ID='86xyz'
OPENAI_API_KEY=sk-proj-abc # unused
export R2_ACCOUNT_ID=deadbeef
`

describe('readRaw', () => {
  it('skips comments, unquotes values and understands the export prefix', () => {
    writeFileSync(file, SAMPLE)
    const map = readMap(file)
    expect(map.get('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET')).toBe('GOCSPX-super-secret')
    expect(map.get('SUPABASE_AUTH_EXTERNAL_LINKEDIN_OIDC_CLIENT_ID')).toBe('86xyz')
    expect(map.get('R2_ACCOUNT_ID')).toBe('deadbeef')
    expect(map.size).toBe(5)
  })

  it('cuts an inline comment from an unquoted value', () => {
    writeFileSync(file, SAMPLE)
    expect(readMap(file).get('OPENAI_API_KEY')).toBe('sk-proj-abc')
  })

  it('returns an empty result for a missing file', () => {
    expect(readRaw(file).entries).toEqual([])
  })
})

describe('writeKeys', () => {
  it('updates an existing key in place and keeps the comments', () => {
    writeFileSync(file, SAMPLE)
    writeKeys(file, [{ key: 'OPENAI_API_KEY', value: 'sk-yeni' }])
    const out = readFileSync(file, 'utf8')
    expect(out).toContain('# Local backend secrets')
    expect(out).toContain('# LinkedIn')
    expect(readMap(file).get('OPENAI_API_KEY')).toBe('sk-yeni')
    expect(out.split('\n').length).toBe(SAMPLE.split('\n').length)
  })

  it('preserves the quoting style', () => {
    writeFileSync(file, SAMPLE)
    writeKeys(file, [{ key: 'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET', value: 'yeni-sirr' }])
    expect(readFileSync(file, 'utf8')).toContain('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="yeni-sirr"')
  })

  it('appends a new key at the end', () => {
    writeFileSync(file, SAMPLE)
    writeKeys(file, [{ key: 'NEW_KEY', value: 'value' }])
    const out = readFileSync(file, 'utf8')
    expect(out.trimEnd().endsWith('NEW_KEY=value')).toBe(true)
    expect(readMap(file).get('NEW_KEY')).toBe('value')
  })

  it('quotes a value containing spaces or special characters', () => {
    writeKeys(file, [{ key: 'A', value: 'two words' }])
    expect(readMap(file).get('A')).toBe('two words')
  })

  it('writes the file with 0600 permissions', () => {
    writeKeys(file, [{ key: 'A', value: 'b' }])
    const { mode } = require('node:fs').statSync(file) as { mode: number }
    expect(mode & 0o777).toBe(0o600)
  })
})

describe('deleteKey', () => {
  it('removes only the target line', () => {
    writeFileSync(file, SAMPLE)
    deleteKey(file, 'OPENAI_API_KEY')
    const out = readFileSync(file, 'utf8')
    expect(out).not.toContain('OPENAI_API_KEY')
    expect(out).toContain('# LinkedIn')
    expect(readMap(file).size).toBe(4)
  })
})

describe('mask', () => {
  it('fully hides a short value', () => {
    expect(mask('12345678')).toBe('••••••••')
  })
  it('keeps the ends of a long value', () => {
    const m = mask('sk-proj-1234567890abcdef')
    expect(m.startsWith('sk-')).toBe(true)
    expect(m.endsWith('def')).toBe(true)
    expect(m).toContain('•')
  })
  it('leaves an empty value empty', () => {
    expect(mask('')).toBe('')
  })
})
