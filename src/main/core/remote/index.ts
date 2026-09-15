/**
 * Unifies managed (supabase.com) and self-hosted (SSH) environments behind one
 * interface — the Sync and Deploy screens never know which kind they're talking to.
 */
import type {
  BackupFormat,
  BackupInfo,
  BackupScope,
  HealthReport,
  Project,
  RemoteEnv,
  RemoteFile,
  RemoteFunctionInfo,
  RemoteSecret,
  RemoteService,
  SqlRun,
  VerifyReport
} from '@shared/types/index.js'
import type { MigrationFile } from '../migrations.js'
import { ManagedAdapter } from './managed.js'
import { SelfHostedAdapter } from './selfhosted.js'

export interface LedgerRow {
  version: string
  name: string | null
}

export type LogFn = (text: string) => void

export interface AuthEnvGaps {
  /** the compose file we read, or null when there is none */
  composePath: string | null
  /** the service running GoTrue, by image */
  service: string | null
  /** the variables that service is not handed */
  missing: string[]
  /** false when the file could not be read well enough to answer */
  readable: boolean
}

export interface AuthApplyResult {
  /** true when lines had to be added to the compose file */
  composeChanged: boolean
  service: string
  composePath: string
}

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
  /**
   * Stream a database dump into a local file — the Backups screen and the
   * scheduler both go through this, so a remote dump ends up on this machine and
   * can be uploaded to object storage like any other.
   *
   * `scope` only means something for managed environments, where the dump is
   * assembled from `supabase db dump` parts; self-hosted always writes a full
   * `pg_dump -Fc`.
   */
  dumpTo(
    file: string,
    scope: BackupScope,
    log: LogFn
  ): Promise<{ bytes: number; format: BackupFormat }>
  /**
   * Load a dump file back into this environment. Destructive by definition — the
   * caller is responsible for the confirmation.
   */
  restoreFrom(
    file: string,
    format: BackupFormat,
    clean: boolean,
    log: LogFn
  ): Promise<{ output: string }>
  /**
   * Every secret the remote knows about. Self-hosted returns the values too —
   * that `.env` is a plain file we can read — while managed returns only a
   * digest, which is why `RemoteSecret` has both fields nullable.
   */
  listSecrets(): Promise<RemoteSecret[]>
  /** `kv` is keyed by REMOTE name — `sync.ts` applies the mapping before calling. */
  setSecrets(kv: Record<string, string>, log: LogFn): Promise<void>
  /** Remove secrets by their remote name. */
  unsetSecrets(names: string[], log: LogFn): Promise<void>
  /**
   * Which auth variables the remote's auth container is not handed. A value in
   * the stack `.env` only reaches the process when the compose file names it, so
   * a clean secret push can still leave the provider disabled.
   */
  authEnvGaps(names: string[]): Promise<AuthEnvGaps>
  /**
   * Name those variables in the compose file if needed and recreate the auth
   * container, so values just written to `.env` are actually read.
   */
  applyAuthVars(names: string[], log: LogFn): Promise<AuthApplyResult>
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

/**
 * Reach each endpoint and report what came back. Both adapters had their own
 * copy of this loop; they only ever differed in which URLs they built.
 *
 * A 5xx is a failure, anything below it is not: an unauthenticated `GET` on
 * `/rest/v1/` legitimately answers 401, and that still proves the service is up.
 */
export async function checkEndpoints(
  targets: Array<[label: string, url: string]>
): Promise<VerifyReport> {
  const checks: VerifyReport['checks'] = []
  for (const [label, url] of targets) {
    try {
      const res = await fetch(url, { method: 'GET' })
      checks.push({ label, ok: res.status < 500, info: `HTTP ${res.status}` })
    } catch (err) {
      checks.push({ label, ok: false, info: (err as Error).message })
    }
  }
  return { ok: checks.every((c) => c.ok), checks }
}

export function adapterFor(project: Project, env: RemoteEnv): RemoteAdapter {
  return env.kind === 'managed'
    ? new ManagedAdapter(project, env)
    : new SelfHostedAdapter(project, env)
}
