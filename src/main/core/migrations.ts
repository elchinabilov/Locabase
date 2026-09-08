/**
 * The migration report: **files · local ledger · remote ledger**, side by side.
 *
 * Drift has historically been the most expensive problem in these projects, so
 * all three sources are read separately and none of them is inferred from
 * another.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabase } from './cli.js'
import { logBus } from './log.js'
import { readLedger } from './localdb.js'
import { get as getProject, getEnv, paths } from './projects.js'
import { adapterFor } from './remote/index.js'
import type { MigrationReport, MigrationRow, MigrationState, TaskResult } from '@shared/types.js'

export interface MigrationFile {
  version: string
  name: string
  file: string
}

/** `00003_grants.sql` → { version: '00003', name: 'grants' } */
export function listFiles(projectPath: string): MigrationFile[] {
  const dir = join(projectPath, 'supabase', 'migrations')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const base = f.slice(0, -4)
      const idx = base.indexOf('_')
      return {
        version: idx === -1 ? base : base.slice(0, idx),
        name: idx === -1 ? '' : base.slice(idx + 1),
        file: join(dir, f)
      }
    })
    .sort((a, b) => a.version.localeCompare(b.version))
}

export function readMigration(file: string): string {
  return readFileSync(file, 'utf8')
}

function stateOf(inFiles: boolean, local: boolean, remote: boolean | null): MigrationState {
  if (!inFiles) return remote === true || local ? 'remote-only' : 'local-only'
  if (!local) return 'pending-local'
  if (remote === false) return 'pending-remote'
  return 'synced'
}

export async function report(id: string, envId: string | null): Promise<MigrationReport> {
  const project = getProject(id)
  const files = listFiles(project.path)
  const localLedger = await readLedger(project)

  let remoteVersions: Set<string> | null = null
  let error: string | null = null
  if (envId) {
    try {
      const adapter = adapterFor(project, getEnv(id, envId))
      const rows = await adapter.listAppliedMigrations()
      remoteVersions = new Set(rows.map((r) => r.version))
    } catch (err) {
      error = `Could not read the remote ledger: ${(err as Error).message}`
    }
  }

  const localVersions = new Set((localLedger ?? []).map((r) => r.version))
  const all = new Map<string, MigrationRow>()

  for (const f of files) {
    all.set(f.version, {
      version: f.version,
      name: f.name,
      file: f.file,
      inFiles: true,
      appliedLocal: localVersions.has(f.version),
      appliedRemote: remoteVersions ? remoteVersions.has(f.version) : null,
      state: 'synced'
    })
  }
  for (const row of localLedger ?? []) {
    if (all.has(row.version)) continue
    all.set(row.version, {
      version: row.version,
      name: row.name ?? '',
      file: null,
      inFiles: false,
      appliedLocal: true,
      appliedRemote: remoteVersions ? remoteVersions.has(row.version) : null,
      state: 'local-only'
    })
  }
  for (const version of remoteVersions ?? []) {
    if (all.has(version)) continue
    all.set(version, {
      version,
      name: '',
      file: null,
      inFiles: false,
      appliedLocal: false,
      appliedRemote: true,
      state: 'remote-only'
    })
  }

  const rows = [...all.values()]
    .map((r) => ({ ...r, state: stateOf(r.inFiles, r.appliedLocal, r.appliedRemote) }))
    .sort((a, b) => a.version.localeCompare(b.version))

  return {
    rows,
    localReachable: localLedger !== null,
    remoteReachable: remoteVersions !== null,
    error
  }
}

const NAME_RE = /^[a-z0-9_]+$/

export async function create(id: string, name: string): Promise<{ file: string }> {
  if (!NAME_RE.test(name)) {
    throw new Error('The name may only contain lowercase letters, digits and underscores.')
  }
  const project = getProject(id)
  const before = new Set(listFiles(project.path).map((f) => f.file))
  const res = await supabase(['migration', 'new', name], {
    cwd: project.path,
    stream: `migrations:${project.projectId}`
  })
  if (!res.ok) throw new Error(res.error ?? res.output)
  const created = listFiles(project.path).find((f) => !before.has(f.file))
  if (!created) throw new Error('The new migration file was not found')
  return { file: created.file }
}

/**
 * Writes the text from the SQL editor into a new timestamped migration file.
 * `create()` makes an empty file through the CLI — the name validation and the
 * "find the newly created file" logic are reused as they are.
 */
export async function createWithBody(
  id: string,
  name: string,
  sql: string
): Promise<{ file: string }> {
  const { file } = await create(id, name)
  writeFileSync(file, sql.endsWith('\n') ? sql : `${sql}\n`, 'utf8')
  return { file }
}

export async function up(id: string): Promise<TaskResult> {
  const project = getProject(id)
  return supabase(['migration', 'up', '--local'], {
    cwd: project.path,
    stream: `migrations:${project.projectId}`,
    timeoutMs: 10 * 60 * 1000
  })
}

export async function diff(id: string): Promise<{ sql: string }> {
  const project = getProject(id)
  const res = await supabase(['db', 'diff'], {
    cwd: project.path,
    stream: `migrations:${project.projectId}`,
    timeoutMs: 5 * 60 * 1000
  })
  if (!res.ok) throw new Error(res.error ?? res.output)
  return { sql: res.output }
}

export async function repair(
  id: string,
  envId: string,
  version: string,
  status: 'applied' | 'reverted'
): Promise<TaskResult> {
  const project = getProject(id)
  const env = getEnv(id, envId)
  const adapter = adapterFor(project, env)
  try {
    await adapter.repairLedger(version, status, (t) =>
      logBus.push(`remote:${env.name}`, 'warn', t)
    )
    return { ok: true, code: 0, output: `${version} → ${status}`, error: null }
  } catch (err) {
    return { ok: false, code: null, output: '', error: (err as Error).message }
  }
}

export { paths }
