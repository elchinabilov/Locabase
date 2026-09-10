import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { containedPath, isContained, PathError } from '../src/main/core/safe-path.js'

const ROOT = resolve('/tmp/locabase-project')

describe('containedPath', () => {
  it('resolves an ordinary relative file', () => {
    expect(containedPath(ROOT, '.env')).toBe(join(ROOT, '.env'))
  })

  it('allows a nested path', () => {
    expect(containedPath(ROOT, 'config/.env.local')).toBe(join(ROOT, 'config/.env.local'))
  })

  it('rejects a parent traversal', () => {
    expect(() => containedPath(ROOT, '../../../../.ssh/id_rsa')).toThrow(PathError)
  })

  it('rejects a traversal hidden mid-path', () => {
    expect(() => containedPath(ROOT, 'config/../../outside')).toThrow(PathError)
  })

  it('rejects an absolute path', () => {
    expect(() => containedPath(ROOT, '/etc/passwd')).toThrow(PathError)
  })

  it('rejects a sibling folder with a shared prefix', () => {
    // `startsWith(dir)` alone would accept `/tmp/locabase-project-evil`
    expect(() => containedPath(ROOT, '../locabase-project-evil/.env')).toThrow(PathError)
  })

  it('rejects an empty path', () => {
    expect(() => containedPath(ROOT, '')).toThrow(PathError)
  })

  it('rejects a NUL byte', () => {
    expect(() => containedPath(ROOT, '.env\0.png')).toThrow(PathError)
  })

  it('isContained mirrors containedPath without throwing', () => {
    expect(isContained(ROOT, '.env')).toBe(true)
    expect(isContained(ROOT, '../escape')).toBe(false)
  })
})
