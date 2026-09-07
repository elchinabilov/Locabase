/**
 * Managed mühit — supabase.com layihəsi.
 *
 * İşin çoxunu CLI görür (link, db push, functions deploy, secrets), auth
 * konfiqurasiyası isə Management API ilə oxunur. Access token heç vaxt
 * arqument kimi verilmir — yalnız `SUPABASE_ACCESS_TOKEN` env dəyişəni ilə.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { supabase, supabaseJson } from '../cli.js'
import { get as getSecret, keys } from '../secrets.js'
import type {
  BackupInfo,
  HealthReport,
  ManagedEnv,
  Project,
  RemoteFunctionInfo,
  VerifyReport
} from '@shared/types.js'
import type { MigrationFile } from '../migrations.js'
import type { LedgerRow, LogFn, RemoteAdapter } from './index.js'

const API = 'https://api.supabase.com'

interface CliMigrationRow {
  local?: string
  remote?: string
  name?: string
  version?: string
}

export class ManagedAdapter implements RemoteAdapter {
  readonly kind = 'managed' as const

  constructor(
    private readonly project: Project,
    private readonly env: ManagedEnv
  ) {}

  private get stream(): string {
    return `remote:${this.env.name}`
  }

  private token(): string {
    const token = getSecret(keys.managedToken(this.env.id))
    if (!token) {
      throw new Error(
        `«${this.env.name}» üçün access token yoxdur — mühit ayarlarından əlavə et.`
      )
    }
    return token
  }

  private cliEnv(): Record<string, string> {
    const out: Record<string, string> = { SUPABASE_ACCESS_TOKEN: this.token() }
    const password = getSecret(keys.dbPassword(this.env.id))
    if (password) out['SUPABASE_DB_PASSWORD'] = password
    return out
  }

  /** `supabase/.temp/project-ref` bu mühitə baxmırsa yenidən link et. */
  private async ensureLinked(): Promise<void> {
    const refFile = join(this.project.path, 'supabase', '.temp', 'project-ref')
    const current = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : null
    if (current === this.env.projectRef) return
    const res = await supabase(['link', '--project-ref', this.env.projectRef], {
      cwd: this.project.path,
      env: this.cliEnv(),
      stream: this.stream,
      timeoutMs: 120_000
    })
    if (!res.ok) throw new Error(`link uğursuz: ${res.error ?? res.output}`)
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token()}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    if (!res.ok) {
      throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  async ping(): Promise<HealthReport> {
    const details: HealthReport['details'] = []
    try {
      const p = await this.api<{ name: string; region: string; status: string }>(
        `/v1/projects/${this.env.projectRef}`
      )
      details.push({ label: 'Layihə', ok: true, info: `${p.name} · ${p.region} · ${p.status}` })
    } catch (err) {
      details.push({ label: 'Layihə', ok: false, info: (err as Error).message })
    }
    return { ok: details.every((d) => d.ok), kind: this.kind, details }
  }

  async listAppliedMigrations(): Promise<LedgerRow[]> {
    await this.ensureLinked()
    const rows = await supabaseJson<CliMigrationRow[]>(
      ['migration', 'list', '--linked', '--output-format', 'json'],
      { cwd: this.project.path, env: this.cliEnv(), stream: this.stream, timeoutMs: 120_000 }
    )
    return rows
      .filter((r) => Boolean(r.remote))
      .map((r) => ({ version: String(r.remote), name: r.name ?? null }))
  }

  /**
   * Managed tərəfdə seçmə miqrasiya tətbiqi yoxdur — `db push` gözləyən
   * hamısını sıra ilə tətbiq edir. UI istifadəçini bu barədə xəbərdar edir.
   */
  async applyMigrations(_files: MigrationFile[], log: LogFn): Promise<void> {
    await this.ensureLinked()
    log('supabase db push — gözləyən bütün miqrasiyalar tətbiq olunur')
    const res = await supabase(['db', 'push', '--yes'], {
      cwd: this.project.path,
      env: this.cliEnv(),
      stream: this.stream,
      timeoutMs: 20 * 60 * 1000
    })
    if (!res.ok) throw new Error(res.error ?? res.output)
  }

  async backup(log: LogFn): Promise<BackupInfo> {
    await this.ensureLinked()
    const dir = join(this.project.path, 'supabase', '.backups')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = join(dir, `${this.env.projectRef}-${stamp}.sql`)
    mkdirSync(dir, { recursive: true })
    log(`Sxem yedəyi: ${file}`)
    const res = await supabase(['db', 'dump', '--linked', '-f', file], {
      cwd: this.project.path,
      env: this.cliEnv(),
      stream: this.stream,
      timeoutMs: 20 * 60 * 1000
    })
    if (!res.ok) throw new Error(res.error ?? res.output)
    const size = existsSync(file) ? `${Math.round(readFileSync(file).length / 1024)} KB` : '?'
    return { path: file, size, createdAt: new Date().toISOString() }
  }

  async listSecretNames(): Promise<string[]> {
    const rows = await this.api<Array<{ name: string }>>(
      `/v1/projects/${this.env.projectRef}/secrets`
    )
    return rows.map((r) => r.name).sort()
  }

  /** Dəyərlər müvəqqəti 0600 fayl ilə ötürülür — `ps` siyahısında görünməsin. */
  async setSecrets(kv: Record<string, string>, log: LogFn): Promise<void> {
    const entries = Object.entries(kv)
    if (entries.length === 0) return
    const dir = mkdtempSync(join(tmpdir(), 'supagui-'))
    const file = join(dir, '.env')
    try {
      writeFileSync(
        file,
        entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n'),
        { mode: 0o600 }
      )
      log(`${entries.length} secret göndərilir: ${entries.map(([k]) => k).join(', ')}`)
      const res = await supabase(
        ['secrets', 'set', '--project-ref', this.env.projectRef, '--env-file', file],
        { cwd: this.project.path, env: this.cliEnv(), stream: this.stream, timeoutMs: 120_000 }
      )
      if (!res.ok) throw new Error(res.error ?? res.output)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  async listFunctions(): Promise<RemoteFunctionInfo[]> {
    const rows = await this.api<
      Array<{ slug: string; version: number; status: string; updated_at: number; verify_jwt: boolean }>
    >(`/v1/projects/${this.env.projectRef}/functions`)
    return rows.map((r) => ({
      name: r.slug,
      version: r.version ?? null,
      status: r.status ?? null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      verifyJwt: r.verify_jwt ?? null
    }))
  }

  async deployFunctions(names: string[], log: LogFn): Promise<void> {
    if (names.length === 0) return
    for (const name of names) {
      log(`deploy: ${name}`)
      const res = await supabase(
        ['functions', 'deploy', name, '--project-ref', this.env.projectRef],
        { cwd: this.project.path, env: this.cliEnv(), stream: this.stream, timeoutMs: 10 * 60 * 1000 }
      )
      if (!res.ok) throw new Error(`${name}: ${res.error ?? res.output}`)
    }
  }

  async repairLedger(version: string, status: 'applied' | 'reverted', log: LogFn): Promise<void> {
    await this.ensureLinked()
    log(`migration repair --linked --status ${status} ${version}`)
    const res = await supabase(['migration', 'repair', '--linked', '--status', status, version], {
      cwd: this.project.path,
      env: this.cliEnv(),
      stream: this.stream,
      timeoutMs: 120_000
    })
    if (!res.ok) throw new Error(res.error ?? res.output)
  }

  async verify(): Promise<VerifyReport> {
    const base = `https://${this.env.projectRef}.supabase.co`
    const checks: VerifyReport['checks'] = []
    for (const [label, url] of [
      ['REST', `${base}/rest/v1/`],
      ['Auth', `${base}/auth/v1/health`]
    ] as const) {
      try {
        const res = await fetch(url, { method: 'GET' })
        checks.push({ label, ok: res.status < 500, info: `HTTP ${res.status}` })
      } catch (err) {
        checks.push({ label, ok: false, info: (err as Error).message })
      }
    }
    return { ok: checks.every((c) => c.ok), checks }
  }
}
