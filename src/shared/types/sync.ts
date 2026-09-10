/**
 * The Sync screen: the five diff axes and the deploy plan built from them.
 */

import type { MigrationRow } from './migrations.js'
import type { FunctionInfo } from './functions.js'

export interface SyncAxis<T> {
  /** whether this axis has any difference */
  dirty: boolean
  items: T[]
  error: string | null
}

export interface SecretDiff {
  key: string
  where: 'local-only' | 'remote-only' | 'both'
}

export interface SyncReport {
  envId: string
  migrations: SyncAxis<MigrationRow>
  schema: SyncAxis<{ sql: string }>
  functions: SyncAxis<FunctionInfo>
  secrets: SyncAxis<SecretDiff>
  authConfig: SyncAxis<{ path: string; local: string; remote: string }>
  generatedAt: string
}

export type DeployStep = 'backup' | 'migrations' | 'functions' | 'secrets' | 'auth' | 'verify'

export interface DeployPlan {
  envId: string
  steps: DeployStep[]
  migrations: string[]
  functions: string[]
  secrets: string[]
  dryRun: boolean
}
