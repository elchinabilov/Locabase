/**
 * Layihə registry-si. Diskdə saxlanılan yeganə şey yol + mühit metadata-sıdır;
 * `config.toml`, `.env` və miqrasiyalar həmişə fayl sistemindən oxunur, kopyası
 * saxlanılmır — tool ilə redaktorun bir-birini üzməsinin qarşısını alır.
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

const store = new Store<RegistryShape>({
  name: 'projects',
  defaults: { projects: [] }
})

export class ProjectError extends Error {}

/* ------------------------------------------------------------- inspect */

export interface InspectResult {
  valid: boolean
  projectId: string | null
  reason: string | null
}

/** Qovluğun içində işlək bir Supabase layihəsi varmı? */
export function inspect(dir: string): InspectResult {
  if (!isAbsolute(dir)) return { valid: false, projectId: null, reason: 'Yol mütləq olmalıdır' }
  const configPath = join(dir, 'supabase', 'config.toml')
  if (!existsSync(configPath)) {
    return { valid: false, projectId: null, reason: 'supabase/config.toml tapılmadı' }
  }
  try {
    const parsed = parseToml(readFileSync(configPath, 'utf8')) as { project_id?: unknown }
    const id = typeof parsed.project_id === 'string' ? parsed.project_id : null
    if (!id) {
      return { valid: false, projectId: null, reason: 'config.toml-da `project_id` yoxdur' }
    }
    return { valid: true, projectId: id, reason: null }
  } catch (err) {
    return { valid: false, projectId: null, reason: `config.toml oxunmadı: ${(err as Error).message}` }
  }
}

/* ------------------------------------------------------------- CRUD */

export function list(): Project[] {
  return store.get('projects')
}

export function get(id: string): Project {
  const found = list().find((p) => p.id === id)
  if (!found) throw new ProjectError(`Layihə tapılmadı: ${id}`)
  return found
}

export function add(dir: string): Project {
  const path = resolve(dir)
  const info = inspect(path)
  if (!info.valid || !info.projectId) {
    throw new ProjectError(info.reason ?? 'Yararsız layihə qovluğu')
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
  store.set('projects', [...list(), project])
  return project
}

export function update(id: string, patch: Partial<Project>): Project {
  const projects = list()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx === -1) throw new ProjectError(`Layihə tapılmadı: ${id}`)
  const current = projects[idx]!
  // id və path dəyişməz — onlar registry-nin açarıdır
  const next: Project = { ...current, ...patch, id: current.id, path: current.path }
  projects[idx] = next
  store.set('projects', projects)
  return next
}

export function remove(id: string): void {
  store.set(
    'projects',
    list().filter((p) => p.id !== id)
  )
}

/* ------------------------------------------------------------- mühitlər */

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
  if (!found) throw new ProjectError(`Mühit tapılmadı: ${envId}`)
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
