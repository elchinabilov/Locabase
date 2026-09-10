/**
 * Creates a local Supabase project from scratch.
 *
 * `supabase init` is run in the chosen folder — the CLI creates the file skeleton
 * itself, we keep no template of our own. Two things are then adjusted:
 *  - `project_id` is set from the name the user gave (container names derive from it);
 *  - ports are moved into a free block of 100 so the stack won't clash with others.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { sanitizeProjectId } from '@shared/naming.js'
import type { ConfigPatch, Project } from '@shared/types.js'
import { supabase } from './cli.js'
import { logBus } from './log.js'
import { add as addProject, update as updateProject, ProjectError } from './projects.js'
import { remapPatches, suggestRange } from './ports.js'
import { applyPatches } from './toml/patch.js'

const STREAM = 'new-project'
const INIT_TIMEOUT = 3 * 60 * 1000

/** Folders expected after `supabase init` that the CLI may not create. */
const SUBDIRS = ['migrations', 'functions']

const SEED_HEADER = '-- Seed for the local database. `supabase db reset` applies this file.\n'

/** CLI 2.x no longer creates this — keeps `.temp` and local env files out of the repo. */
const GITIGNORE = [
  '# Supabase',
  '.branches',
  '.temp',
  '',
  '# Locabase backups — database dumps never belong in the repo',
  '.backups',
  '',
  '# env',
  '.env.keys',
  '.env.local',
  '.env.*.local',
  ''
].join('\n')

export interface CreateInput {
  /** repo root — `supabase/` is created inside it */
  path: string
  /** display name; `project_id` derives from it. Defaults to the folder name */
  name?: string
  /** port block of 100, e.g. 553 → 553xx. Defaults to the suggested free block */
  portBase?: number
}

export async function create({ path, name, portBase }: CreateInput): Promise<Project> {
  const dir = resolve(path)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new ProjectError(`Folder not found: ${dir}`)
  }
  const configPath = join(dir, 'supabase', 'config.toml')
  if (existsSync(configPath)) {
    throw new ProjectError(
      'This folder already contains a Supabase project — add it with «Open existing project».'
    )
  }

  const label = name?.trim() || basename(dir)
  const projectId = sanitizeProjectId(label)
  if (!projectId) throw new ProjectError('The project name needs at least one letter or digit')

  logBus.push(STREAM, 'info', `Setting up a new project: ${dir}`)
  const res = await supabase(['init'], { cwd: dir, stream: STREAM, timeoutMs: INIT_TIMEOUT })
  if (!res.ok) {
    throw new ProjectError(res.error ?? `\`supabase init\` failed:\n${res.output.trim()}`)
  }
  if (!existsSync(configPath)) {
    throw new ProjectError('`supabase init` finished but supabase/config.toml was not created')
  }

  const base = portBase ?? suggestRange()
  const raw = readFileSync(configPath, 'utf8')
  const patches: ConfigPatch[] = [
    { path: 'project_id', value: projectId },
    ...remapPatches(parseToml(raw), base)
  ]
  const patched = applyPatches(raw, patches)
  if (patched.changed) writeFileSync(configPath, patched.text, 'utf8')
  logBus.push(STREAM, 'info', `project_id=${projectId}, ports in the ${base}xx block`)

  for (const sub of SUBDIRS) mkdirSync(join(dir, 'supabase', sub), { recursive: true })
  for (const [file, body] of [
    ['seed.sql', SEED_HEADER],
    ['.gitignore', GITIGNORE]
  ] as const) {
    const target = join(dir, 'supabase', file)
    if (!existsSync(target)) writeFileSync(target, body, 'utf8')
  }

  const project = addProject(dir)
  logBus.push(STREAM, 'info', 'Ready — you can bring it up with `supabase start`.')
  return label === project.name ? project : updateProject(project.id, { name: label })
}
