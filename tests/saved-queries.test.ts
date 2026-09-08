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
import type { Project } from '../src/shared/types.js'

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

describe('saxlanmış sorğular', () => {
  it('qovluq yoxdursa boş siyahı verir', () => {
    expect(listFor(project)).toEqual([])
  })

  it('write → list → read → rename → remove dövrü', () => {
    writeFor(project, 'aktiv istifadəçilər', 'select * from auth.users;')
    expect(existsSync(join(root, 'supabase', '.locabase', 'queries', 'aktiv istifadəçilər.sql'))).toBe(true)

    const all = listFor(project)
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe('aktiv istifadəçilər')
    expect(all[0]?.bytes).toBeGreaterThan(0)

    expect(readFor(project, 'aktiv istifadəçilər').sql).toBe('select * from auth.users;')

    renameFor(project, 'aktiv istifadəçilər', 'istifadəçilər')
    expect(listFor(project).map((q) => q.name)).toEqual(['istifadəçilər'])

    removeFor(project, 'istifadəçilər')
    expect(listFor(project)).toEqual([])
  })

  it('qovluğu rekursiv yaradır və README qoyur', () => {
    writeFor(project, 'q', 'select 1')
    expect(existsSync(join(root, 'supabase', '.locabase', 'README.md'))).toBe(true)
  })

  it('mövcud ada rename rədd olunur', () => {
    writeFor(project, 'a', 'select 1')
    writeFor(project, 'b', 'select 2')
    expect(() => renameFor(project, 'a', 'b')).toThrow(/artıq var/)
  })

  it('olmayan sorğunu oxumaq xəta verir', () => {
    expect(() => readFor(project, 'yox')).toThrow(/tapılmadı/)
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

  it.each(BAD)('yolu qıran adı rədd edir: %j', (name) => {
    expect(() => writeFor(project, name, 'select 1')).toThrow()
    // qovluqdan kənarda heç nə yaranmamalıdır
    const dir = dirFor(project)
    const files = existsSync(dir) ? readdirSync(dir) : []
    expect(files).toEqual([])
  })

  it('qonşu qovluğa (queries-evil) qaça bilmir', () => {
    expect(() => writeFor(project, '../queries-evil/x', 'select 1')).toThrow()
    expect(existsSync(join(root, 'supabase', '.locabase', 'queries-evil'))).toBe(false)
  })

  it('Azərbaycan hərfli, boşluqlu, defisli adı qəbul edir', () => {
    const q = writeFor(project, 'sifariş hesabatı-2', 'select 1')
    expect(q.name).toBe('sifariş hesabatı-2')
    expect(readFileSync(q.path, 'utf8')).toBe('select 1')
  })
})
