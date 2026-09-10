import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeDump, dumpScript, envMergeScript } from '../src/main/core/remote/selfhosted.js'

const TOKEN = '__LOCABASE_test__'
const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

function dump(files: Array<[string, string | null]>): string {
  return files
    .map(([path, body]) => `${TOKEN}${path}\n${body === null ? `${TOKEN}!` : b64(body)}`)
    .join('\n')
}

describe('decodeDump', () => {
  it('turns base64 blocks into files and sorts them', () => {
    const out = decodeDump(
      dump([
        ['index.ts', 'export const a = 1\n'],
        ['_lib/util.ts', 'export const b = 2\n']
      ]),
      TOKEN
    )
    expect(out.map((f) => f.path)).toEqual(['_lib/util.ts', 'index.ts'])
    expect(out[1]!.content).toBe('export const a = 1\n')
    expect(out.every((f) => !f.binary)).toBe(true)
  })

  it('joins wrapped multi-line base64 into one file', () => {
    const body = 'x'.repeat(200)
    const wrapped = b64(body).replace(/(.{40})/g, '$1\n')
    const out = decodeDump(`${TOKEN}big.txt\n${wrapped}`, TOKEN)
    expect(out).toHaveLength(1)
    expect(out[0]!.content).toBe(body)
  })

  it('the `!` marker flags a file as binary/large — it stays in the listing', () => {
    const out = decodeDump(
      dump([
        ['bundle.wasm', null],
        ['index.ts', 'ok\n']
      ]),
      TOKEN
    )
    expect(out.map((f) => [f.path, f.binary, f.content])).toEqual([
      ['bundle.wasm', true, null],
      ['index.ts', false, 'ok\n']
    ])
  })

  it('content with a NUL byte counts as binary', () => {
    const raw = Buffer.from([0x61, 0x00, 0x62]).toString('base64')
    const out = decodeDump(`${TOKEN}bin\n${raw}`, TOKEN)
    expect(out[0]).toEqual({ path: 'bin', content: null, binary: true })
  })

  it('empty output gives an empty list', () => {
    expect(decodeDump('', TOKEN)).toEqual([])
  })
})

describe('envMergeScript', () => {
  const runScript = (file: string, input: string): string => {
    const script = envMergeScript(file)
    return execFileSync('bash', ['-c', script], { input }).toString().trim()
  }

  it('replaces an existing key and appends a new one at the end', () => {
    const dir = mkdtempSync(join(tmpdir(), 'locabase-env-'))
    const file = join(dir, '.env')
    writeFileSync(file, 'A=1\nB=2\nC=3\n')
    try {
      expect(runScript(file, 'B=changed\nD=4\n')).toBe('updated')
      expect(readFileSync(file, 'utf8')).toBe('A=1\nC=3\nB=changed\nD=4\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates the file when it does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'locabase-env-'))
    const file = join(dir, '.env')
    try {
      expect(runScript(file, 'K=v\n')).toBe('updated')
      expect(readFileSync(file, 'utf8')).toBe('K=v\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('works with a path containing spaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'locabase env '))
    const file = join(dir, '.env')
    writeFileSync(file, 'A=1\n')
    try {
      expect(runScript(file, 'A=2\n')).toBe('updated')
      expect(readFileSync(file, 'utf8')).toBe('A=2\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('dumpScript', () => {
  it('turns a real folder into a base64 stream that decodeDump restores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'locabase-fn-'))
    mkdirSync(join(dir, 'lib'))
    writeFileSync(join(dir, 'index.ts'), 'export const a = 1\n')
    writeFileSync(join(dir, 'lib', 'util.ts'), 'export const b = 2\n')
    writeFileSync(join(dir, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02]))
    try {
      const out = execFileSync('bash', ['-c', dumpScript(dir, 'TOK__')]).toString()
      const files = decodeDump(out, 'TOK__')
      expect(files.map((f) => f.path)).toEqual(['blob.bin', 'index.ts', 'lib/util.ts'])
      expect(files.find((f) => f.path === 'lib/util.ts')?.content).toBe('export const b = 2\n')
      expect(files.find((f) => f.path === 'blob.bin')).toEqual({
        path: 'blob.bin',
        content: null,
        binary: true
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
