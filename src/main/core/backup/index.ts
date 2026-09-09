/**
 * The backup engine — one code path for every target and every trigger.
 *
 * Local stack, managed project and self-hosted server all end up as a **file on
 * this machine**, so from there on everything is the same: the same list, the
 * same retention rule, the same upload to object storage. The manual button and
 * the scheduler both call `run()`; the only difference is what lands in
 * `trigger`.
 *
 * A failed run is not an exception — it is a record with `status: 'failed'` and
 * the reason. A backup that quietly disappeared from history is worse than a red
 * row that says why.
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import Store from 'electron-store'
import type {
  BackupOptions,
  BackupRecord,
  BackupScope,
  BackupTargetKind,
  Project,
  RemoteEnv,
  RestoreOptions,
  RestoreResult
} from '@shared/types.js'
import { runFromFile, runToFile } from '../cli.js'
import { servicesFor } from '../docker.js'
import { logBus } from '../log.js'
import * as projects from '../projects.js'
import * as storage from '../storage/index.js'
import { adapterFor } from '../remote/index.js'
import { selectPrunable, type RetentionRule } from './retention.js'

interface Shape {
  backups: BackupRecord[]
}

let _store: Store<Shape> | null = null
function store(): Store<Shape> {
  _store ??= new Store<Shape>({ name: 'backups', defaults: { backups: [] } })
  return _store
}

/** `changed` carries the project id — the renderer only reloads what it shows. */
export const backupBus = new EventEmitter()
const changed = (projectId: string): boolean => backupBus.emit('changed', projectId)

const DUMP_TIMEOUT = 6 * 60 * 60 * 1000

/** One dump per target at a time; a second click waits for nothing. */
const inFlight = new Set<string>()

/* ------------------------------------------------------------------ paths */

/** A filename-safe label: `Prod (EU)` → `prod-eu`. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'unnamed'
  )
}

/** `2026-09-09T14:03:12.512Z` → `20260909-140312` */
function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

/** Backups live beside the project, under `supabase/.backups/<environment>/`. */
export function dirFor(project: Project, envLabel: string): string {
  return join(project.path, 'supabase', '.backups', slug(envLabel))
}

/* ---------------------------------------------------------------- records */

export function list(projectId: string): BackupRecord[] {
  return store()
    .get('backups')
    .filter((b) => b.projectId === projectId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function get(backupId: string): BackupRecord {
  const found = store().get('backups').find((b) => b.id === backupId)
  if (!found) throw new Error(`Backup not found: ${backupId}`)
  return found
}

function put(record: BackupRecord): BackupRecord {
  const rest = store().get('backups').filter((b) => b.id !== record.id)
  store().set('backups', [...rest, record])
  return record
}

function forget(backupId: string): void {
  store().set(
    'backups',
    store().get('backups').filter((b) => b.id !== backupId)
  )
}

/* -------------------------------------------------------------------- run */

function kindOf(env: RemoteEnv | null): BackupTargetKind {
  return env === null ? 'local' : env.kind
}

/** `pg_dump` inside the local `supabase_db_*` container, streamed straight out. */
async function dumpLocal(
  project: Project,
  file: string,
  scope: BackupScope,
  stream: string
): Promise<{ bytes: number; format: 'custom' }> {
  const services = await servicesFor(project.projectId)
  const db = services.find((s) => s.key === 'db')
  if (!db || db.state !== 'running') {
    throw new Error('The local stack is not running — start it before taking a backup')
  }
  const only = scope === 'schema' ? ['--schema-only'] : scope === 'data' ? ['--data-only'] : []
  const res = await runToFile(
    'docker',
    ['exec', '-i', db.container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc', ...only],
    file,
    { stream, timeoutMs: DUMP_TIMEOUT }
  )
  if (res.bytes === 0) throw new Error('pg_dump produced an empty file')
  return { bytes: res.bytes, format: 'custom' }
}

export interface RunMeta {
  trigger: BackupRecord['trigger']
  jobId?: string | null
  jobName?: string | null
}

export async function run(
  projectId: string,
  options: BackupOptions,
  meta: RunMeta = { trigger: 'manual' }
): Promise<BackupRecord> {
  const project = projects.get(projectId)
  const env = options.envId ? projects.getEnv(projectId, options.envId) : null
  const envLabel = env?.name ?? 'local'
  const scope: BackupScope = options.scope ?? 'full'
  const stream = `backup:${envLabel}`

  const lock = `${projectId}:${options.envId ?? 'local'}`
  if (inFlight.has(lock)) {
    throw new Error(`A backup of «${envLabel}» is already running`)
  }
  inFlight.add(lock)

  const started = new Date()
  const record: BackupRecord = {
    id: randomUUID(),
    projectId,
    envId: options.envId,
    envName: envLabel,
    kind: kindOf(env),
    format: env?.kind === 'managed' ? 'plain' : 'custom',
    scope,
    trigger: meta.trigger,
    jobId: meta.jobId ?? null,
    jobName: meta.jobName ?? null,
    status: 'running',
    startedAt: started.toISOString(),
    finishedAt: null,
    durationMs: null,
    path: null,
    bytes: 0,
    storageId: options.storageId ?? null,
    storageName: storage.find(options.storageId ?? null)?.name ?? null,
    storageKey: null,
    error: null
  }
  put(record)
  changed(projectId)

  const dir = dirFor(project, envLabel)
  const ext = record.format === 'plain' ? 'sql' : 'dump'
  const file = join(dir, `${slug(project.name)}-${slug(envLabel)}-${stamp(started)}.${ext}`)

  try {
    mkdirSync(dir, { recursive: true })
    logBus.push(stream, 'info', `Backup started (${scope}) → ${file}`)

    const result = env
      ? await adapterFor(project, env).dumpTo(file, scope, (text) =>
          logBus.push(stream, 'info', text)
        )
      : await dumpLocal(project, file, scope, stream)

    record.format = result.format
    record.bytes = result.bytes
    record.path = file

    if (options.storageId) {
      const conn = storage.get(options.storageId)
      const key = `${slug(project.name)}/${slug(envLabel)}/${file.split('/').pop()}`
      const uploaded = await storage.upload(conn.id, file, key)
      record.storageId = conn.id
      record.storageName = conn.name
      record.storageKey = uploaded.key
      if (options.keepLocal === false) {
        rmSync(file, { force: true })
        record.path = null
        logBus.push(stream, 'info', 'Local copy removed — the dump lives in the bucket')
      }
    }

    record.status = 'ok'
    record.finishedAt = new Date().toISOString()
    record.durationMs = Date.now() - started.getTime()
    put(record)
    logBus.push(stream, 'info', `Backup finished — ${humanBytes(record.bytes)}`)
  } catch (err) {
    record.status = 'failed'
    record.error = (err as Error).message
    record.finishedAt = new Date().toISOString()
    record.durationMs = Date.now() - started.getTime()
    if (record.path && !existsSync(record.path)) record.path = null
    put(record)
    logBus.push(stream, 'error', `Backup failed: ${record.error}`)
  } finally {
    inFlight.delete(lock)
  }

  if (record.status === 'ok') {
    await prune(projectId, options.envId, {
      days: options.retentionDays ?? 0,
      count: options.retentionCount ?? 0
    })
  }
  changed(projectId)
  return get(record.id)
}

/* ---------------------------------------------------------------- restore */

/**
 * Load a dump back into a database.
 *
 * Two things make this more than the inverse of `run()`:
 *  - the **target is chosen**, not implied. Pulling a production dump into the
 *    local stack is the everyday use; restoring onto production is the rare and
 *    dangerous one, so the caller has to type the target's name.
 *  - the local file may be long gone (a job with `keepLocal: false`). When the
 *    backup went to a bucket, the dump is pulled back down into a temp file
 *    first and deleted afterwards.
 */
export async function restore(options: RestoreOptions): Promise<RestoreResult> {
  const record = get(options.backupId)
  const project = projects.get(record.projectId)
  const env = options.envId ? projects.getEnv(record.projectId, options.envId) : null
  const envLabel = env?.name ?? 'local'
  const stream = `restore:${envLabel}`

  if (options.confirm.trim() !== envLabel) {
    throw new Error(`Type «${envLabel}» to confirm the restore`)
  }
  if (record.status !== 'ok') {
    throw new Error('This backup never finished — there is nothing to restore')
  }

  const lock = `restore:${record.projectId}:${options.envId ?? 'local'}`
  if (inFlight.has(lock)) throw new Error(`A restore into «${envLabel}» is already running`)
  inFlight.add(lock)

  const started = Date.now()
  let temp: string | null = null
  try {
    let file = record.path && existsSync(record.path) ? record.path : null
    if (!file) {
      if (!record.storageId || !record.storageKey) {
        throw new Error('The dump is gone — no local file and no copy in storage')
      }
      const dir = mkdtempSync(join(tmpdir(), 'locabase-restore-'))
      temp = join(dir, basename(record.storageKey))
      logBus.push(stream, 'info', `Fetching ${record.storageKey} from ${record.storageName}`)
      await storage.download(record.storageId, record.storageKey, temp)
      file = temp
    }

    logBus.push(stream, 'info', `Restoring ${basename(file)} → ${envLabel}`)
    const output = env
      ? (
          await adapterFor(project, env).restoreFrom(file, record.format, options.clean, (text) =>
            logBus.push(stream, 'info', text)
          )
        ).output
      : (await restoreLocal(project, file, record.format, options.clean, stream)).output

    // "finished" is not the same as "clean" — see `failedStatements`.
    const failures = output.match(/^ERROR:/gm)?.length ?? 0
    logBus.push(stream, 'info', `Restore finished → ${envLabel}`)
    return {
      ok: true,
      envName: envLabel,
      output,
      error: null,
      failedStatements: failures,
      durationMs: Date.now() - started,
      fromStorage: temp !== null
    }
  } catch (err) {
    const message = (err as Error).message
    logBus.push(stream, 'error', `Restore failed: ${message}`)
    return {
      ok: false,
      envName: envLabel,
      output: '',
      error: message,
      failedStatements: 0,
      durationMs: Date.now() - started,
      fromStorage: temp !== null
    }
  } finally {
    if (temp) rmSync(temp, { force: true })
    inFlight.delete(lock)
  }
}

/** `pg_restore` / `psql` inside the local `supabase_db_*` container. */
async function restoreLocal(
  project: Project,
  file: string,
  format: BackupRecord['format'],
  clean: boolean,
  stream: string
): Promise<{ output: string }> {
  const services = await servicesFor(project.projectId)
  const db = services.find((s) => s.key === 'db')
  if (!db || db.state !== 'running') {
    throw new Error('The local stack is not running — start it before restoring')
  }
  const args =
    format === 'plain'
      ? ['exec', '-i', db.container, 'psql', '-U', 'postgres', '-d', 'postgres']
      : [
          'exec',
          '-i',
          db.container,
          'pg_restore',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '--no-owner',
          '--no-privileges',
          ...(clean ? ['--clean', '--if-exists'] : [])
        ]
  const res = await runFromFile('docker', args, file, { stream, timeoutMs: DUMP_TIMEOUT })
  if (!res.ok) throw new Error(res.error ?? (res.output.trim() || 'the restore failed'))
  return { output: res.output }
}

/* ---------------------------------------------------------------- cleanup */

/** Drop what the retention rule says to drop — file, uploaded object and record. */
export async function prune(
  projectId: string,
  envId: string | null,
  rule: RetentionRule
): Promise<number> {
  const scoped = list(projectId).filter((b) => b.envId === envId)
  const doomed = selectPrunable(scoped, rule)
  for (const record of doomed) {
    await destroy(record, true)
  }
  if (doomed.length > 0) {
    logBus.push('backup', 'info', `Retention: ${doomed.length} old backup(s) removed`)
  }
  return doomed.length
}

/** Delete a backup's bytes (local file and uploaded object), then its record. */
async function destroy(record: BackupRecord, includeStorage: boolean): Promise<void> {
  if (record.path) {
    try {
      rmSync(record.path, { force: true })
    } catch (err) {
      logBus.push('backup', 'warn', `${record.path}: ${(err as Error).message}`)
    }
  }
  if (includeStorage && record.storageId && record.storageKey) {
    try {
      await storage.removeObject(record.storageId, record.storageKey)
    } catch (err) {
      // The bucket may be gone or the key revoked — the record still goes away.
      logBus.push('backup', 'warn', `${record.storageKey}: ${(err as Error).message}`)
    }
  }
  forget(record.id)
}

export async function remove(backupId: string, deleteFile: boolean): Promise<void> {
  const record = get(backupId)
  if (deleteFile) {
    await destroy(record, true)
  } else {
    forget(backupId)
  }
  changed(record.projectId)
}

/** Upload (or re-upload) a kept local dump. */
export async function upload(backupId: string, storageId: string): Promise<BackupRecord> {
  const record = get(backupId)
  if (!record.path || !existsSync(record.path)) {
    throw new Error('The local file is gone — there is nothing left to upload')
  }
  const conn = storage.get(storageId)
  const key = `${slug(record.envName)}/${record.path.split('/').pop()}`
  const uploaded = await storage.upload(conn.id, record.path, key)
  const next: BackupRecord = {
    ...record,
    bytes: record.bytes || statSync(record.path).size,
    storageId: conn.id,
    storageName: conn.name,
    storageKey: uploaded.key
  }
  put(next)
  changed(record.projectId)
  return next
}

/** Forget records whose project is gone — called when a project is removed. */
export function forgetProject(projectId: string): void {
  store().set(
    'backups',
    store().get('backups').filter((b) => b.projectId !== projectId)
  )
}

export function humanBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}
