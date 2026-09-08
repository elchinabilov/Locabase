/**
 * Sıfırdan lokal Supabase layihəsi qurur.
 *
 * Seçilmiş qovluqda `supabase init` işlədilir — yəni fayl skeletini CLI-nin
 * özü yaradır, biz şablon saxlamırıq. Sonra iki şey düzəldilir:
 *  - `project_id` istifadəçinin verdiyi ada gətirilir (konteyner adları bundan);
 *  - portlar boş 100-lük bloka köçürülür ki, digər stack-lərlə toqquşmasın.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { supabase } from './cli.js'
import { logBus } from './log.js'
import { add as addProject, update as updateProject, ProjectError } from './projects.js'
import { remapPatches, suggestRange } from './ports.js'
import { applyPatches } from './toml/patch.js'
import { sanitizeProjectId } from '@shared/naming.js'
import type { ConfigPatch, Project } from '@shared/types.js'

const STREAM = 'new-project'
const INIT_TIMEOUT = 3 * 60 * 1000

/** `supabase init`-dən sonra olması gözlənilən, amma CLI yaratmaya bilən qovluqlar. */
const SUBDIRS = ['migrations', 'functions']

const SEED_HEADER = '-- Lokal baza üçün seed. `supabase db reset` bu faylı tətbiq edir.\n'

/** CLI 2.x artıq bunu yaratmır — `.temp` və lokal env faylları repo-ya düşməsin. */
const GITIGNORE = [
  '# Supabase',
  '.branches',
  '.temp',
  '',
  '# env',
  '.env.keys',
  '.env.local',
  '.env.*.local',
  ''
].join('\n')

export interface CreateInput {
  /** repo kökü — `supabase/` bunun içində yaranır */
  path: string
  /** UI adı; `project_id` bundan törəyir. Default: qovluq adı */
  name?: string
  /** 100-lük port bloku, məs. 553 → 553xx. Default: boş blok təklifi */
  portBase?: number
}

export async function create({ path, name, portBase }: CreateInput): Promise<Project> {
  const dir = resolve(path)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new ProjectError(`Qovluq tapılmadı: ${dir}`)
  }
  const configPath = join(dir, 'supabase', 'config.toml')
  if (existsSync(configPath)) {
    throw new ProjectError(
      'Bu qovluqda artıq Supabase layihəsi var — «Mövcud layihəni aç» ilə əlavə et.'
    )
  }

  const label = name?.trim() || basename(dir)
  const projectId = sanitizeProjectId(label)
  if (!projectId) throw new ProjectError('Layihə adında ən azı bir hərf və ya rəqəm olmalıdır')

  logBus.push(STREAM, 'info', `Yeni layihə qurulur: ${dir}`)
  const res = await supabase(['init'], { cwd: dir, stream: STREAM, timeoutMs: INIT_TIMEOUT })
  if (!res.ok) {
    throw new ProjectError(res.error ?? `\`supabase init\` uğursuz oldu:\n${res.output.trim()}`)
  }
  if (!existsSync(configPath)) {
    throw new ProjectError('`supabase init` bitdi, amma supabase/config.toml yaranmadı')
  }

  const base = portBase ?? suggestRange()
  const raw = readFileSync(configPath, 'utf8')
  const patches: ConfigPatch[] = [
    { path: 'project_id', value: projectId },
    ...remapPatches(parseToml(raw), base)
  ]
  const patched = applyPatches(raw, patches)
  if (patched.changed) writeFileSync(configPath, patched.text, 'utf8')
  logBus.push(STREAM, 'info', `project_id=${projectId}, portlar ${base}xx blokunda`)

  for (const sub of SUBDIRS) mkdirSync(join(dir, 'supabase', sub), { recursive: true })
  for (const [file, body] of [
    ['seed.sql', SEED_HEADER],
    ['.gitignore', GITIGNORE]
  ] as const) {
    const target = join(dir, 'supabase', file)
    if (!existsSync(target)) writeFileSync(target, body, 'utf8')
  }

  const project = addProject(dir)
  logBus.push(STREAM, 'info', 'Hazırdır — `supabase start` ilə qaldıra bilərsən.')
  return label === project.name ? project : updateProject(project.id, { name: label })
}
