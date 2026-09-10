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
import { containedPath } from './safe-path.js'

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
  if (!isAbsolute(dir))
    return { valid: false, projectId: null, reason: 'The path must be absolute' }
  const configPath = join(dir, 'supabase', 'config.toml')
  if (!existsSync(configPath)) {
    return { valid: false, projectId: null, reason: 'supabase/config.toml not found' }
  }
  try {
    const parsed = parseToml(readFileSync(configPath, 'utf8')) as { project_id?: unknown }
    const id = typeof parsed.project_id === 'string' ? parsed.project_id : null
    if (!id) {
      return { valid: false, projectId: null, reason: 'config.toml has no `project_id`' }
    }
    return { valid: true, projectId: id, reason: null }
  } catch (err) {
    return {
      valid: false,
      projectId: null,
      reason: `Could not read config.toml: ${(err as Error).message}`
    }
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

/**
 * The only fields the renderer may change. Everything else on a `Project` is
 * derived from the folder on disk (`path`, `projectId`) or is the registry's own
 * bookkeeping (`id`, `addedAt`) — a spread of an unfiltered patch would let the
 * renderer repoint `envFile` outside the project and turn `env:read`/`env:write`
 * into an arbitrary file read/write.
 */
const MUTABLE_FIELDS = ['name', 'envFile', 'environments'] as const
type MutableField = (typeof MUTABLE_FIELDS)[number]

export function update(id: string, patch: Partial<Project>): Project {
  const projects = list()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx === -1) throw new ProjectError(`Project not found: ${id}`)
  const current = projects[idx]!

  const allowed: Partial<Pick<Project, MutableField>> = {}
  for (const field of MUTABLE_FIELDS) {
    if (patch[field] !== undefined) Object.assign(allowed, { [field]: patch[field] })
  }

  // `envFile` is joined onto the project root and handed to `fs` — it has to stay
  // inside the project. The environments carry an SSH host that reaches an argv.
  if (allowed.envFile !== undefined) assertEnvFile(current.path, allowed.envFile)
  if (allowed.environments !== undefined) allowed.environments.forEach(assertEnv)

  const next: Project = { ...current, ...allowed }
  projects[idx] = next
  store().set('projects', projects)
  return next
}

function assertEnvFile(projectPath: string, envFile: string): void {
  try {
    containedPath(projectPath, envFile)
  } catch (err) {
    throw new ProjectError((err as Error).message)
  }
}

/**
 * `ssh` and `rsync` both read a leading `-` as an option, so an unvalidated host
 * (`-oProxyCommand=…`) is local code execution even though it only ever travels
 * in an argv array. The key path is checked the same way it is used: as a path.
 */
const SSH_HOST_RE = /^[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?$/

function assertEnv(env: RemoteEnv): void {
  if (env.kind !== 'self-hosted') return
  if (!SSH_HOST_RE.test(env.sshHost)) {
    throw new ProjectError(
      `Invalid SSH host: ${env.sshHost} — expected [user@]host with letters, digits, dot, dash or underscore`
    )
  }
  if (env.sshKeyPath && env.sshKeyPath.startsWith('-')) {
    throw new ProjectError('The SSH key path may not start with `-`')
  }
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

/* --------------------------------------------------------------- paths */

export const paths = {
  supabaseDir: (p: Project): string => join(p.path, 'supabase'),
  configToml: (p: Project): string => join(p.path, 'supabase', 'config.toml'),
  migrationsDir: (p: Project): string => join(p.path, 'supabase', 'migrations'),
  functionsDir: (p: Project): string => join(p.path, 'supabase', 'functions'),
  // Not `join`: the registry is renderer-writable, so the containment check is
  // repeated at the point of use rather than trusted from write time.
  envFile: (p: Project): string => containedPath(p.path, p.envFile)
}
