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
  verify(): Promise<VerifyReport>
}

export function adapterFor(project: Project, env: RemoteEnv): RemoteAdapter {
  return env.kind === 'managed'
    ? new ManagedAdapter(project, env)
    : new SelfHostedAdapter(project, env)
}
