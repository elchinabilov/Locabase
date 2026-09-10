/**
 * The job scheduler.
 *
 * It is a timer in the main process, not a system cron entry: jobs run while
 * Locabase is open and nothing is left behind on the machine when it isn't. A
 * run missed with the app closed is NOT caught up on launch — waking up to three
 * backups of the same database at once is worse than one missed nightly dump;
 * `nextRunAt` is simply recomputed from the moment the app starts.
 *
 * The tick is deliberately dumb (every 30 s, run whatever is due). A single
 * long `setTimeout` would drift across a laptop sleep and fire late or not at all.
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import type { BackupRecord, Job, JobInput } from '@shared/types.js'
import { logBus } from '../log.js'
import * as projects from '../projects.js'
import * as backup from '../backup/index.js'
import { nextRun, validate } from './cron.js'

interface Shape {
  jobs: Job[]
}

let _store: Store<Shape> | null = null
function store(): Store<Shape> {
  _store ??= new Store<Shape>({ name: 'jobs', defaults: { jobs: [] } })
  return _store
}

export const jobBus = new EventEmitter()
const changed = (projectId: string): boolean => jobBus.emit('changed', projectId)

export const STREAM = 'jobs'
const TICK_MS = 30_000

/** Runtime state — never persisted: a crash must not leave a job "running". */
const running = new Set<string>()
let timer: NodeJS.Timeout | null = null

/* ------------------------------------------------------------------ store */

function decorate(job: Job): Job {
  return { ...job, running: running.has(job.id) }
}

export function all(): Job[] {
  return store().get('jobs').map(decorate)
}

export function list(projectId: string): Job[] {
  return all()
    .filter((j) => j.projectId === projectId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function get(jobId: string): Job {
  const found = store()
    .get('jobs')
    .find((j) => j.id === jobId)
  if (!found) throw new Error(`Job not found: ${jobId}`)
  return decorate(found)
}

function put(job: Job): Job {
  const rest = store()
    .get('jobs')
    .filter((j) => j.id !== job.id)
  store().set('jobs', [...rest, job])
  return decorate(job)
}

/** Recompute `nextRunAt`: a disabled or invalid job has none. */
function scheduled(job: Job, from: Date = new Date()): Job {
  if (!job.enabled) return { ...job, nextRunAt: null }
  const next = nextRun(job.schedule, from)
  return { ...job, nextRunAt: next ? next.toISOString() : null }
}

export function upsert(input: JobInput): Job {
  const name = input.name.trim()
  if (!name) throw new Error('A name is required')
  // Fails early rather than saving a job that will never fire.
  const invalid = validate(input.schedule)
  if (invalid) throw new Error(invalid)
  projects.get(input.projectId)
  if (input.envId) projects.getEnv(input.projectId, input.envId)

  const existing = input.id
    ? store()
        .get('jobs')
        .find((j) => j.id === input.id)
    : undefined
  if (input.id && !existing) throw new Error(`Job not found: ${input.id}`)

  const job: Job = {
    id: existing?.id ?? randomUUID(),
    projectId: input.projectId,
    name,
    type: input.type,
    enabled: input.enabled,
    envId: input.envId,
    schedule: input.schedule,
    scope: input.scope,
    storageId: input.storageId,
    keepLocal: input.keepLocal,
    retentionDays: Math.max(0, Math.trunc(input.retentionDays)),
    retentionCount: Math.max(0, Math.trunc(input.retentionCount)),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lastRunAt: existing?.lastRunAt ?? null,
    lastStatus: existing?.lastStatus ?? null,
    lastError: existing?.lastError ?? null,
    nextRunAt: null,
    running: false
  }
  const saved = put(scheduled(job))
  changed(job.projectId)
  return saved
}

export function remove(jobId: string): void {
  const job = get(jobId)
  store().set(
    'jobs',
    store()
      .get('jobs')
      .filter((j) => j.id !== jobId)
  )
  changed(job.projectId)
}

export function setEnabled(jobId: string, enabled: boolean): Job {
  const job = put(scheduled({ ...get(jobId), enabled }))
  changed(job.projectId)
  return job
}

/** A project that goes away takes its jobs with it. */
export function forgetProject(projectId: string): void {
  store().set(
    'jobs',
    store()
      .get('jobs')
      .filter((j) => j.projectId !== projectId)
  )
}

/* -------------------------------------------------------------------- run */

/**
 * Execute one job now. Used by the tick and by "Run now" — the two must not be
 * different code paths, or the button would test something the schedule doesn't do.
 */
export async function runJob(jobId: string): Promise<BackupRecord> {
  const job = get(jobId)
  if (running.has(job.id)) throw new Error(`«${job.name}» is already running`)
  running.add(job.id)
  changed(job.projectId)

  try {
    logBus.push(STREAM, 'info', `${job.name}: starting`)
    const record = await backup.run(
      job.projectId,
      {
        envId: job.envId,
        scope: job.scope,
        storageId: job.storageId,
        keepLocal: job.keepLocal,
        retentionDays: job.retentionDays,
        retentionCount: job.retentionCount
      },
      { trigger: 'job', jobId: job.id, jobName: job.name }
    )
    put(
      scheduled({
        ...get(job.id),
        lastRunAt: record.startedAt,
        lastStatus: record.status === 'ok' ? 'ok' : 'failed',
        lastError: record.error
      })
    )
    logBus.push(
      STREAM,
      record.status === 'ok' ? 'info' : 'error',
      `${job.name}: ${record.status === 'ok' ? 'done' : `failed — ${record.error ?? ''}`}`
    )
    return record
  } catch (err) {
    // A thrown error here is a setup problem (missing project, missing storage),
    // not a failed dump — a dump failure comes back as a `failed` record.
    const message = (err as Error).message
    put(
      scheduled({
        ...get(job.id),
        lastRunAt: new Date().toISOString(),
        lastStatus: 'failed',
        lastError: message
      })
    )
    logBus.push(STREAM, 'error', `${job.name}: ${message}`)
    throw err
  } finally {
    running.delete(job.id)
    changed(job.projectId)
  }
}

/** Jobs whose time has come. Exported so the tick stays readable. */
function due(now: Date): Job[] {
  return all().filter(
    (j) =>
      j.enabled &&
      !j.running &&
      j.nextRunAt !== null &&
      new Date(j.nextRunAt).getTime() <= now.getTime()
  )
}

async function tick(): Promise<void> {
  const jobs = due(new Date())
  // One at a time: two pg_dumps of the same stack at once help nobody.
  for (const job of jobs) {
    try {
      await runJob(job.id)
    } catch {
      // runJob already recorded and logged it; the loop must not stop here.
    }
  }
}

/* ----------------------------------------------------------- start / stop */

export function start(): void {
  if (timer) return
  // No catch-up: every enabled job is re-scheduled from now.
  const now = new Date()
  const jobs = store().get('jobs')
  store().set(
    'jobs',
    jobs.map((j) => scheduled(j, now))
  )

  timer = setInterval(() => {
    void tick()
  }, TICK_MS)
  // The tick loop must never keep the app alive on its own.
  timer.unref?.()

  const active = jobs.filter((j) => j.enabled).length
  if (active > 0) logBus.push(STREAM, 'info', `Scheduler up — ${active} job(s) armed`)
}

export function stop(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
