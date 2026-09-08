/**
 * Managed (supabase.com) və self-hosted (SSH) mühitləri bir interfeys altında
 * birləşdirir — Sync və Deploy ekranları hansı növlə işlədiyini bilmir.
 */
import type {
  BackupInfo,
  HealthReport,
  Project,
  RemoteEnv,
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
  deployFunctions(names: string[], log: LogFn): Promise<void>
  /** Ledger sətrini əlavə et / sil — fayllarla ledger uyğunsuzluğunu düzəltmək üçün. */
  repairLedger(version: string, status: 'applied' | 'reverted', log: LogFn): Promise<void>
  /** Uzaq konteynerlər: vəziyyət və RAM. Managed-də idarə oluna bilmir. */
  listServices(): Promise<RemoteService[]>
  /** Konteyneri dayandır / başlat. */
  setServiceState(container: string, on: boolean, log: LogFn): Promise<void>
  verify(): Promise<VerifyReport>

  /**
   * Sərbəst SQL — SQL redaktoru üçün. Lokal `execute()` kimi İSTİSNA ATMIR:
   * SQL xətası `SqlRun.error`-da qayıdır.
   */
  runSql(sql: string, opts: RemoteSqlOpts): Promise<SqlRun>

  /**
   * Daxili sorğu (introspeksiya, sətir CRUD). Nəticə JSON obyektləri kimi
   * qayıdır — tiplər (bool, ədəd, null) qorunur.
   *
   * DİQQƏT: uzaq nəqliyyat `$n` parametri bağlaya bilmir, ona görə çağıran
   * tərəf `inlineParams()` ilə literal yapışdırır. Bu YALNIZ bizim qurduğumuz
   * mətnlərə tətbiq olunur — istifadəçi SQL-i heç vaxt buradan keçmir.
   */
  queryJson<T>(sql: string): Promise<T[]>
}

export function adapterFor(project: Project, env: RemoteEnv): RemoteAdapter {
  return env.kind === 'managed'
    ? new ManagedAdapter(project, env)
    : new SelfHostedAdapter(project, env)
}
