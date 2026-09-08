/**
 * The project registry. The only thing stored on disk is the path plus
 * environment metadata; `config.toml`, `.env` and migrations are always read
 * from the filesystem and never cached — which stops the tool and an editor
 * from fighting over the same file.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import { parse as parseToml } from 'smol-toml'
import type { Project, RemoteEnv } from '@shared/types.js'

interface RegistryShape {
  projects: Project[]
}

/**
 * The store is created lazily: `app.getPath('userData')` is only read on first
 * access, so `app.setName()` and the userData migration can run before it.
 */
let _store: Store<RegistryShape> | null = null
function store(): Store<RegistryShape> {
  _store ??= new Store<RegistryShape>({ name: 'projects', defaults: { projects: [] } })
  return _store
}

export class ProjectError extends Error {}

/* ------------------------------------------------------------- inspect */

export interface InspectResult {
  valid: boolean
  projectId: string | null
  reason: string | null
}

/** Does this folder contain a usable Supabase project? */
export function inspect(dir: string): InspectResult {
  if (!isAbsolute(dir)) return { valid: false, projectId: null, reason: 'The path must be absolute' }
  const configPath = join(dir, 'supabase', 'config.toml')
  if (!existsSync(configPath)) {
    return { valid: false, projectId: null, reason: 'supabase/config.toml not found' }
  }
  try {
    const parsed = parseToml(readFileSync(configPath, 'utf8')) as { project_id?: unknown }
    const id = typeof parsed.project_id === 'string' ? parsed.project_id : null
    if (!id) {
      return { valid: false, projectId: null, reason: 'config.toml-da `project_id` yoxdur' }
    }
    return { valid: true, projectId: id, reason: null }
  } catch (err) {
    return { valid: false, projectId: null, reason: `Could not read config.toml: ${(err as Error).message}` }
  }
}

/* ------------------------------------------------------------- CRUD */

export function list(): Project[] {
  return store().get('projects')
}

export function get(id: string): Project {
  const found = list().find((p) => p.id === id)
  if (!found) throw new ProjectError(`Project not found: ${id}`)
  return found
}

export function add(dir: string): Project {
  const path = resolve(dir)
  const info = inspect(path)
  if (!info.valid || !info.projectId) {
    throw new ProjectError(info.reason ?? 'Not a usable project folder')
  }
  const existing = list().find((p) => p.path === path)
  if (existing) return existing

  const project: Project = {
    id: randomUUID(),
    name: basename(path),
    path,
    projectId: info.projectId,
    envFile: existsSync(join(path, '.env')) ? '.env' : '.env',
    environments: [],
    addedAt: new Date().toISOString()
  }
  store().set('projects', [...list(), project])
  return project
}

export function update(id: string, patch: Partial<Project>): Project {
  const projects = list()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx === -1) throw new ProjectError(`Project not found: ${id}`)
  const current = projects[idx]!
  // id and path are immutable — they are the registry's key
  const next: Project = { ...current, ...patch, id: current.id, path: current.path }
  projects[idx] = next
  store().set('projects', projects)
  return next
}

export function remove(id: string): void {
  store().set(
    'projects',
    list().filter((p) => p.id !== id)
  )
}

/* ---------------------------------------------------------- environments */

export function upsertEnv(id: string, env: RemoteEnv): Project {
  const project = get(id)
  const envs = project.environments.filter((e) => e.id !== env.id)
  return update(id, { environments: [...envs, env] })
}

export function removeEnv(id: string, envId: string): Project {
  const project = get(id)
  return update(id, { environments: project.environments.filter((e) => e.id !== envId) })
}

export function getEnv(id: string, envId: string): RemoteEnv {
  const found = get(id).environments.find((e) => e.id === envId)
  if (!found) throw new ProjectError(`Environment not found: ${envId}`)
  return found
}

/* ------------------------------------------------------------- yollar */

export const paths = {
  supabaseDir: (p: Project): string => join(p.path, 'supabase'),
  configToml: (p: Project): string => join(p.path, 'supabase', 'config.toml'),
  migrationsDir: (p: Project): string => join(p.path, 'supabase', 'migrations'),
  functionsDir: (p: Project): string => join(p.path, 'supabase', 'functions'),
  envFile: (p: Project): string => join(p.path, p.envFile)
}
