/**
 * Saxlanmış SQL sorğuları — `supabase/.localbase/queries/<ad>.sql`.
 *
 * Repo-nun içində saxlanır ki, komanda ilə git vasitəsilə paylaşılsın və adi
 * fayl kimi redaktə oluna bilsin. `.gitignore`-a heç nə əlavə edilmir —
 * istəyən `supabase/.localbase/` sətrini özü yaza bilər.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { get as getProject, paths } from './projects.js'
import type { Project, SavedQuery } from '@shared/types.js'

/**
 * Nöqtə QƏSDƏN yoxdur: bu, `..`, `a.b`, `/abs` və NUL hiylələrini bir qaydada
 * öldürür. `resolve()` yoxlaması müdafiənin ikinci qatıdır.
 */
const NAME_RE = /^[A-Za-z0-9əöğışçüĞÖİŞÇÜƏ _-]{1,64}$/

export function dirFor(project: Project): string {
  return resolve(join(paths.supabaseDir(project), '.localbase', 'queries'))
}

export function fileFor(project: Project, name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error('Ad yalnız hərf, rəqəm, boşluq, `_` və `-` ola bilər (ən çox 64 simvol).')
  }
  const dir = dirFor(project)
  const file = resolve(dir, `${name}.sql`)
  // İkinci qat: ad yoxlanışından sonra da yolun qovluqdan çıxmadığını təsdiqlə.
  // `startsWith(dir)` tək başına qonşu `queries-evil/`-i qəbul edərdi — ona
  // görə ayırıcı ilə birlikdə yoxlanılır.
  if (file !== join(dir, `${name}.sql`) || !file.startsWith(dir + sep)) {
    throw new Error('Yol qovluqdan kənara çıxır')
  }
  return file
}

const README = `# .localbase

Localbase tətbiqinin layihəyə aid faylları.

- \`queries/\` — SQL redaktorunda saxlanmış sorğular. Adi \`.sql\` faylıdır,
  redaktorda da, burada da dəyişdirilə bilər.

Bu qovluq qəsdən commit olunur ki, komanda sorğuları paylaşsın. Şəxsi saxlamaq
istəyirsənsə \`.gitignore\`-a \`supabase/.localbase/\` əlavə et.
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

/* ---------------------------------------------------------- nüvə (Project) */

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
  if (!existsSync(file)) throw new Error(`Sorğu tapılmadı: ${name}`)
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
  if (!existsSync(from)) throw new Error(`Sorğu tapılmadı: ${name}`)
  if (existsSync(dest) && from !== dest) throw new Error(`Bu adda sorğu artıq var: ${to}`)
  renameSync(from, dest)
  return describe(dest, to)
}

export function removeFor(project: Project, name: string): void {
  rmSync(fileFor(project, name), { force: true })
}

/* ---------------------------------------------------------- id əsaslı örtük */

export const list = (id: string): SavedQuery[] => listFor(getProject(id))
export const read = (id: string, name: string): { name: string; sql: string } =>
  readFor(getProject(id), name)
export const write = (id: string, name: string, sql: string): SavedQuery =>
  writeFor(getProject(id), name, sql)
export const rename = (id: string, name: string, to: string): SavedQuery =>
  renameFor(getProject(id), name, to)
export const remove = (id: string, name: string): void => removeFor(getProject(id), name)
