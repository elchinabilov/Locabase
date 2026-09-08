/**
 * Unifies managed (supabase.com) and self-hosted (SSH) environments behind one
 * interface — the Sync and Deploy screens never know which kind they're talking to.
 */
import type {
  BackupInfo,
  HealthReport,
  Project,
  RemoteEnv,
  RemoteFile,
  RemoteFunctionInfo,
  RemoteService,
  SqlRun,
  VerifyReport
} from '@shared/types.js'
import type { MigrationFile } from '../migrations.js'
import { ManagedAdapter } from './managed.js'
import { SelfHostedAdapter } from './selfhosted.js'

export interface LedgerRow {
  version: string
  name: string | null
}

export type LogFn = (text: string) => void

export interface RemoteSqlOpts {
  readOnly: boolean
  maxRows: number
  timeoutMs: number
}

export interface RemoteAdapter {
  readonly kind: RemoteEnv['kind']
  ping(): Promise<HealthReport>
  listAppliedMigrations(): Promise<LedgerRow[]>
  applyMigrations(files: MigrationFile[], log: LogFn): Promise<void>
  backup(log: LogFn): Promise<BackupInfo>
  listSecretNames(): Promise<string[]>
  setSecrets(kv: Record<string, string>, log: LogFn): Promise<void>
  listFunctions(): Promise<RemoteFunctionInfo[]>
  /**
   * The remote **file contents** of one function — for "View diff". Called on
   * demand, not as part of the `report()` flow.
   */
  readFunction(name: string): Promise<RemoteFile[]>
  deployFunctions(names: string[], log: LogFn): Promise<void>
  /** Add/remove a ledger row — for repairing a mismatch between files and ledger. */
  repairLedger(version: string, status: 'applied' | 'reverted', log: LogFn): Promise<void>
  /** Remote containers: state and RAM. Not controllable on managed. */
  listServices(): Promise<RemoteService[]>
  /** Stop / start a container. */
  setServiceState(container: string, on: boolean, log: LogFn): Promise<void>
  verify(): Promise<VerifyReport>

  /**
   * Free-form SQL — for the SQL editor. Unlike the local `execute()` it DOES NOT
   * THROW: a SQL error comes back in `SqlRun.error`.
   */
  runSql(sql: string, opts: RemoteSqlOpts): Promise<SqlRun>

  /**
   * An internal query (introspection, row CRUD). Results come back as JSON
   * objects — types (bool, number, null) are preserved.
   *
   * NOTE: the remote transports cannot bind `$n` parameters, so the caller pastes
   * literals with `inlineParams()`. This applies ONLY to text we build ourselves —
   * user SQL never passes through here.
   */
  queryJson<T>(sql: string): Promise<T[]>
}

export function adapterFor(project: Project, env: RemoteEnv): RemoteAdapter {
  return env.kind === 'managed'
    ? new ManagedAdapter(project, env)
    : new SelfHostedAdapter(project, env)
}
