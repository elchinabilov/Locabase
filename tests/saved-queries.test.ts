import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  dirFor,
  listFor,
  readFor,
  removeFor,
  renameFor,
  writeFor
} from '../src/main/core/queries.js'
import type { Project } from '../src/shared/types/index.js'

let root: string
let project: Project

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'locabase-q-'))
  project = {
    id: 'p1',
    name: 'test',
    path: root,
    projectId: 'test',
    envFile: '.env',
    environments: [],
    addedAt: new Date().toISOString()
  }
})

describe('saved queries', () => {
  it('returns an empty list when the folder is missing', () => {
    expect(listFor(project)).toEqual([])
  })

  it('write → list → read → rename → remove cycle', () => {
    writeFor(project, 'active users', 'select * from auth.users;')
    expect(existsSync(join(root, 'supabase', '.locabase', 'queries', 'active users.sql'))).toBe(
      true
    )

    const all = listFor(project)
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe('active users')
    expect(all[0]?.bytes).toBeGreaterThan(0)

    expect(readFor(project, 'active users').sql).toBe('select * from auth.users;')

    renameFor(project, 'active users', 'users')
    expect(listFor(project).map((q) => q.name)).toEqual(['users'])

    removeFor(project, 'users')
    expect(listFor(project)).toEqual([])
  })

  it('creates the folder recursively and drops a README in it', () => {
    writeFor(project, 'q', 'select 1')
    expect(existsSync(join(root, 'supabase', '.locabase', 'README.md'))).toBe(true)
  })

  it('rejects a rename onto an existing name', () => {
    writeFor(project, 'a', 'select 1')
    writeFor(project, 'b', 'select 2')
    expect(() => renameFor(project, 'a', 'b')).toThrow(/already exists/)
  })

  it('reading a missing query throws', () => {
    expect(() => readFor(project, 'yox')).toThrow(/not found/)
  })

  const BAD = [
    '../evil',
    '../../../../etc/passwd',
    'a/b',
    '/abs',
    '..',
    '.',
    'a\0b',
    '',
    'x'.repeat(65),
    'report.sql',
    'q..sql'
  ]

  it.each(BAD)('rejects a path-breaking name: %j', (name) => {
    expect(() => writeFor(project, name, 'select 1')).toThrow()
    // nothing may be created outside the folder
    const dir = dirFor(project)
    const files = existsSync(dir) ? readdirSync(dir) : []
    expect(files).toEqual([])
  })

  it('cannot escape into a sibling folder (queries-evil)', () => {
    expect(() => writeFor(project, '../queries-evil/x', 'select 1')).toThrow()
    expect(existsSync(join(root, 'supabase', '.locabase', 'queries-evil'))).toBe(false)
  })

  it('accepts non-ASCII letters, spaces and dashes in a name', () => {
    const q = writeFor(project, 'sifariş hesabatı-2', 'select 1')
    expect(q.name).toBe('sifariş hesabatı-2')
    expect(readFileSync(q.path, 'utf8')).toBe('select 1')
  })
})
