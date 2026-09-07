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

const SAMPLE = `# Lokal backend sirləri — gitignored
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=123-abc.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="GOCSPX-super-secret"

# LinkedIn
SUPABASE_AUTH_EXTERNAL_LINKEDIN_OIDC_CLIENT_ID='86xyz'
OPENAI_API_KEY=sk-proj-abc # istifadə olunmur
export R2_ACCOUNT_ID=deadbeef
`

describe('readRaw', () => {
  it('şərhləri atlayır, dırnaqları açır, export prefiksini tanıyır', () => {
    writeFileSync(file, SAMPLE)
    const map = readMap(file)
    expect(map.get('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET')).toBe('GOCSPX-super-secret')
    expect(map.get('SUPABASE_AUTH_EXTERNAL_LINKEDIN_OIDC_CLIENT_ID')).toBe('86xyz')
    expect(map.get('R2_ACCOUNT_ID')).toBe('deadbeef')
    expect(map.size).toBe(5)
  })

  it('dırnaqsız dəyərdə inline şərhi kəsir', () => {
    writeFileSync(file, SAMPLE)
    expect(readMap(file).get('OPENAI_API_KEY')).toBe('sk-proj-abc')
  })

  it('olmayan fayl üçün boş nəticə', () => {
    expect(readRaw(file).entries).toEqual([])
  })
})

describe('writeKeys', () => {
  it('mövcud açarı yerində yeniləyir, şərhlər qalır', () => {
    writeFileSync(file, SAMPLE)
    writeKeys(file, [{ key: 'OPENAI_API_KEY', value: 'sk-yeni' }])
    const out = readFileSync(file, 'utf8')
    expect(out).toContain('# Lokal backend sirləri')
    expect(out).toContain('# LinkedIn')
    expect(readMap(file).get('OPENAI_API_KEY')).toBe('sk-yeni')
    expect(out.split('\n').length).toBe(SAMPLE.split('\n').length)
  })

  it('dırnaq üslubunu saxlayır', () => {
    writeFileSync(file, SAMPLE)
    writeKeys(file, [{ key: 'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET', value: 'yeni-sirr' }])
    expect(readFileSync(file, 'utf8')).toContain('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="yeni-sirr"')
  })

  it('yeni açarı sona əlavə edir', () => {
    writeFileSync(file, SAMPLE)
    writeKeys(file, [{ key: 'YENI_ACAR', value: 'dəyər' }])
    const out = readFileSync(file, 'utf8')
    expect(out.trimEnd().endsWith('YENI_ACAR="dəyər"')).toBe(true)
    expect(readMap(file).get('YENI_ACAR')).toBe('dəyər')
  })

  it('boşluq və xüsusi simvollu dəyər dırnağa alınır', () => {
    writeKeys(file, [{ key: 'A', value: 'iki söz' }])
    expect(readMap(file).get('A')).toBe('iki söz')
  })

  it('faylı 0600 icazə ilə yazır', () => {
    writeKeys(file, [{ key: 'A', value: 'b' }])
    const { mode } = require('node:fs').statSync(file) as { mode: number }
    expect(mode & 0o777).toBe(0o600)
  })
})

describe('deleteKey', () => {
  it('yalnız hədəf sətri silir', () => {
    writeFileSync(file, SAMPLE)
    deleteKey(file, 'OPENAI_API_KEY')
    const out = readFileSync(file, 'utf8')
    expect(out).not.toContain('OPENAI_API_KEY')
    expect(out).toContain('# LinkedIn')
    expect(readMap(file).size).toBe(4)
  })
})

describe('mask', () => {
  it('qısa dəyəri tam gizlədir', () => {
    expect(mask('12345678')).toBe('••••••••')
  })
  it('uzun dəyərin uclarını saxlayır', () => {
    const m = mask('sk-proj-1234567890abcdef')
    expect(m.startsWith('sk-')).toBe(true)
    expect(m.endsWith('def')).toBe(true)
    expect(m).toContain('•')
  })
  it('boş dəyər boş qalır', () => {
    expect(mask('')).toBe('')
  })
})
