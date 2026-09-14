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

/**
 * `both` and `changed` both mean the key exists on either side; they differ only
 * in whether we could prove the values match. `unknown` is not a state — a remote
 * that hands back neither the value nor a comparable digest is reported as
 * `both`, and the UI lets it be pushed anyway.
 */
export type SecretWhere = 'local-only' | 'remote-only' | 'both' | 'changed'

export interface SecretDiff {
  /** the local `.env` key — for a `remote-only` row this is the remote name */
  key: string
  /** the name this key has on the remote; differs from `key` when mapped */
  remoteKey: string
  /** true when `remoteKey` comes from the environment's mapping, not 1:1 */
  mapped: boolean
  where: SecretWhere
}

/**
 * One secret as the remote reports it. A managed project never hands back the
 * value — only a digest — so both fields are nullable and the comparison in
 * `sync.ts` falls back accordingly.
 */
export interface RemoteSecret {
  name: string
  /** the plaintext, when the remote lets us read it (self-hosted `.env`) */
  value: string | null
  /** an opaque fingerprint, when it does not (managed Management API) */
  digest: string | null
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
  /** local `.env` keys to push — the remote name comes from the env mapping */
  secrets: string[]
  /** remote names to remove; these are remote names already, not local keys */
  secretDeletes: string[]
  dryRun: boolean
}
