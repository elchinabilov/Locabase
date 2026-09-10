/**
 * Backups: a recorded run, the options that produced it, and restoring one.
 */

/** Where the dump came from. `local` is the Docker stack on this machine. */
export type BackupTargetKind = 'local' | 'managed' | 'self-hosted'

/**
 * `custom` — `pg_dump -Fc` (compressed, restorable with `pg_restore`);
 * `plain` — SQL text. Managed environments only produce `plain`: the dump goes
 * through `supabase db dump`, which has no custom format.
 */
export type BackupFormat = 'custom' | 'plain'

/** Managed dumps are assembled from parts; `full` = roles + schema + data. */
export type BackupScope = 'full' | 'schema' | 'data'

export type BackupTrigger = 'manual' | 'job'

export type BackupStatus = 'running' | 'ok' | 'failed'

export interface BackupRecord {
  id: string
  projectId: string
  /** null = the local stack */
  envId: string | null
  /** The environment name as it was at backup time — the env may be gone later. */
  envName: string
  kind: BackupTargetKind
  format: BackupFormat
  scope: BackupScope
  trigger: BackupTrigger
  /** the scheduler job that produced it, when it wasn't manual */
  jobId: string | null
  jobName: string | null
  status: BackupStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  /** The file on this machine; null once it has been pruned or was never kept. */
  path: string | null
  bytes: number
  /** Upload destination, when one was configured. */
  storageId: string | null
  storageName: string | null
  storageKey: string | null
  error: string | null
}

/** One backup run — the same options for the manual button and for a job. */
export interface BackupOptions {
  /** null = the local stack */
  envId: string | null
  scope?: BackupScope
  /** Upload to this connection after the dump; null = keep it local only. */
  storageId?: string | null
  /** Delete the local file once the upload succeeded. */
  keepLocal?: boolean
  /** Prune this environment's older backups. 0 = no limit. */
  retentionDays?: number
  retentionCount?: number
}

/**
 * Loading a dump back into a database. The target does **not** have to be where
 * the dump came from — pulling production into the local stack is the common
 * case — so it is chosen per restore, and confirmed by name.
 */
export interface RestoreOptions {
  backupId: string
  /** null = the local stack */
  envId: string | null
  /** Custom-format dumps only: drop objects before recreating them. */
  clean: boolean
  /** Must equal the target's name — the same guard `stack:reset` uses. */
  confirm: string
}

export interface RestoreResult {
  ok: boolean
  /** Where it went, as shown in the confirmation. */
  envName: string
  /** The tail of the restore output. */
  output: string
  error: string | null
  /**
   * `psql` does not stop on a failed statement (an existing role, a missing
   * owner), so a restore can finish and still have errors inside it. This counts
   * them — `ok: true` with a non-zero count means "loaded, but read the output".
   */
  failedStatements: number
  durationMs: number
  /** The dump was pulled back from object storage first. */
  fromStorage: boolean
}
