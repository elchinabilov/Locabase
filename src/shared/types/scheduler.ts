/**
 * Scheduled jobs — when a backup runs without anyone clicking anything.
 */

import type { BackupScope } from './backup.js'

/**
 * When a job runs. `cron` is the escape hatch (5 fields, standard syntax); the
 * other three are the shapes a backup schedule actually takes, so the form
 * doesn't make everyone learn cron.
 */
export type ScheduleKind = 'interval' | 'daily' | 'weekly' | 'cron'

export interface ScheduleSpec {
  kind: ScheduleKind
  /** `interval`: the gap in minutes */
  everyMinutes?: number
  /** `daily` / `weekly`: local wall-clock time, `HH:MM` */
  at?: string
  /** `weekly`: 0 = Sunday … 6 = Saturday */
  weekday?: number
  /** `cron`: minute hour day-of-month month day-of-week */
  expr?: string
}

export type JobType = 'backup'

export interface Job {
  id: string
  projectId: string
  name: string
  type: JobType
  enabled: boolean
  /** null = the local stack */
  envId: string | null
  schedule: ScheduleSpec
  scope: BackupScope
  storageId: string | null
  keepLocal: boolean
  /** 0 = keep everything */
  retentionDays: number
  retentionCount: number
  createdAt: string
  lastRunAt: string | null
  lastStatus: 'ok' | 'failed' | null
  lastError: string | null
  /** Computed by the scheduler; null when the job is off or the spec is invalid. */
  nextRunAt: string | null
  /** True while this job's run is in flight. */
  running: boolean
}

/** What the job form sends — the run bookkeeping fields are the scheduler's. */
export interface JobInput {
  id?: string
  projectId: string
  name: string
  type: JobType
  enabled: boolean
  envId: string | null
  schedule: ScheduleSpec
  scope: BackupScope
  storageId: string | null
  keepLocal: boolean
  retentionDays: number
  retentionCount: number
}
