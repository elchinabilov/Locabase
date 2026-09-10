/**
 * Saved SQL queries — `supabase/.locabase/queries/<name>.sql`.
 *
 * They live inside the repo so a team can share them through git and edit them
 * as ordinary files. Nothing is added to `.gitignore` — anyone who wants them
 * private can add the `supabase/.locabase/` line themselves.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { Project, SavedQuery } from '@shared/types/index.js'
import { get as getProject, paths } from './projects.js'

/**
 * The dot is left out DELIBERATELY: that kills `..`, `a.b`, `/abs` and NUL tricks
 * with one rule. The `resolve()` check is the second layer of defence.
 */
const NAME_RE = /^[A-Za-z0-9əöğışçüĞÖİŞÇÜƏ _-]{1,64}$/

export function dirFor(project: Project): string {
  return resolve(join(paths.supabaseDir(project), '.locabase', 'queries'))
}

export function fileFor(project: Project, name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(
      'The name may only contain letters, digits, spaces, `_` and `-` (64 characters max).'
    )
  }
  const dir = dirFor(project)
  const file = resolve(dir, `${name}.sql`)
  // Second layer: even after the name check, confirm the path stays inside the
  // folder. `startsWith(dir)` alone would accept a sibling `queries-evil/`, so
  // the separator is checked along with it.
  if (file !== join(dir, `${name}.sql`) || !file.startsWith(dir + sep)) {
    throw new Error('The path escapes the folder')
  }
  return file
}

const README = `# .locabase

Project-scoped files belonging to the Locabase app.

- \`queries/\` — queries saved from the SQL editor. Ordinary \`.sql\` files that
  can be edited here or in the editor.

This folder is committed on purpose so the team can share queries. If you would
rather keep them private, add \`supabase/.locabase/\` to \`.gitignore\`.
`

function ensureDir(project: Project): string {
  const dir = dirFor(project)
  mkdirSync(dir, { recursive: true })
  const readme = join(dir, '..', 'README.md')
  if (!existsSync(readme)) writeFileSync(readme, README, 'utf8')
  return dir
}

function describe(file: string, name: string): SavedQuery {
  const st = statSync(file)
  return { name, path: file, bytes: st.size, updatedAt: st.mtime.toISOString() }
}

/* --------------------------------------------------------- core (Project) */

export function listFor(project: Project): SavedQuery[] {
  const dir = dirFor(project)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => describe(join(dir, f), f.slice(0, -4)))
    .sort((a, b) => a.name.localeCompare(b.name, 'az'))
}

export function readFor(project: Project, name: string): { name: string; sql: string } {
  const file = fileFor(project, name)
  if (!existsSync(file)) throw new Error(`Query not found: ${name}`)
  return { name, sql: readFileSync(file, 'utf8') }
}

export function writeFor(project: Project, name: string, sql: string): SavedQuery {
  const file = fileFor(project, name)
  ensureDir(project)
  writeFileSync(file, sql, 'utf8')
  return describe(file, name)
}

export function renameFor(project: Project, name: string, to: string): SavedQuery {
  const from = fileFor(project, name)
  const dest = fileFor(project, to)
  if (!existsSync(from)) throw new Error(`Query not found: ${name}`)
  if (existsSync(dest) && from !== dest)
    throw new Error(`A query with this name already exists: ${to}`)
  renameSync(from, dest)
  return describe(dest, to)
}

export function removeFor(project: Project, name: string): void {
  rmSync(fileFor(project, name), { force: true })
}

/* ------------------------------------------------------- id-based wrapper */

export const list = (id: string): SavedQuery[] => listFor(getProject(id))
export const read = (id: string, name: string): { name: string; sql: string } =>
  readFor(getProject(id), name)
export const write = (id: string, name: string, sql: string): SavedQuery =>
  writeFor(getProject(id), name, sql)
export const rename = (id: string, name: string, to: string): SavedQuery =>
  renameFor(getProject(id), name, to)
export const remove = (id: string, name: string): void => removeFor(getProject(id), name)
