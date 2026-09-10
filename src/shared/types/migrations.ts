/**
 * Migration files and the local/remote ledgers they are compared against.
 */

export type MigrationState =
  'synced' | 'pending-local' | 'pending-remote' | 'remote-only' | 'local-only'

export interface MigrationRow {
  version: string
  name: string
  /** file path — when absent, the row exists in the ledger but has no file */
  file: string | null
  inFiles: boolean
  appliedLocal: boolean
  /** null = the remote is not configured or is unreachable */
  appliedRemote: boolean | null
  state: MigrationState
}

export interface MigrationReport {
  rows: MigrationRow[]
  localReachable: boolean
  remoteReachable: boolean
  error: string | null
}
