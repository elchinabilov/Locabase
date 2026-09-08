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
import { readTree } from '../filetree.js'
import type {
  BackupInfo,
  HealthReport,
  ManagedEnv,
  Project,
  RemoteFile,
  RemoteFunctionInfo,
  RemoteService,
  SqlColumn,
  SqlResult,
  SqlRun,
  VerifyReport
} from '@shared/types.js'
import type { MigrationFile } from '../migrations.js'
import type { LedgerRow, LogFn, RemoteAdapter, RemoteSqlOpts } from './index.js'
import { toSqlError } from '../sql/build.js'

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
      verifyJwt: r.verify_jwt ?? null,
      // Management API fayl siyahısı vermir — fərq yalnız `readFunction` ilə
      files: null
    }))
  }

  /**
   * Uzaq mənbə `functions download` ilə **müvəqqəti** iş qovluğuna endirilir —
   * layihənin öz `supabase/functions/` qovluğu heç vaxt üstündən yazılmır.
   */
  async readFunction(name: string): Promise<RemoteFile[]> {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`yararsız funksiya adı: ${name}`)
    const work = mkdtempSync(join(tmpdir(), 'locabase-fn-'))
    try {
      mkdirSync(join(work, 'supabase'), { recursive: true })
      writeFileSync(join(work, 'supabase', 'config.toml'), `project_id = "download"\n`, 'utf8')
      const args = ['functions', 'download', name, '--project-ref', this.env.projectRef, '--workdir', work]
      const opts = { cwd: work, env: this.cliEnv(), stream: this.stream, timeoutMs: 5 * 60 * 1000 }
      // `--use-api` server tərəfdə unbundle edir — Docker tələb olunmur.
      // Köhnə CLI bu bayrağı tanımır, onda adi yolla təkrarlanır.
      let res = await supabase([...args, '--use-api'], opts)
      if (!res.ok && /unknown flag|unknown shorthand/i.test(res.output)) {
        res = await supabase(args, opts)
      }
      if (!res.ok) throw new Error(res.error ?? res.output.trim())
      return readTree(join(work, 'supabase', 'functions', name))
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
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

  /**
   * Managed layihədə ayrı-ayrı servisləri söndürmək mümkün deyil — platforma
   * onları özü idarə edir və belə bir API yoxdur.
   */
  async listServices(): Promise<RemoteService[]> {
    return []
  }

  async setServiceState(): Promise<void> {
    throw new Error(
      'Managed layihədə servisləri ayrıca söndürmək mümkün deyil — supabase.com onları özü idarə edir.'
    )
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

  /* ------------------------------------------------------------ SQL */

  /**
   * Management API-nin `database/query` endpoint-i. Nəticə JSON sətir
   * obyektləri kimi gəlir — nə sütun metadata-sı, nə də command tag var.
   *
   * `read_only` SERVER tərəfdə tətbiq olunur: bu bizim yeganə qorunmamızdır,
   * çünki bu nəqliyyatda `begin read only` göndərməyin yolu yoxdur.
   */
  private async queryApi(query: string, readOnly: boolean): Promise<Array<Record<string, unknown>>> {
    return this.api<Array<Record<string, unknown>>>(
      `/v1/projects/${this.env.projectRef}/database/query`,
      { method: 'POST', body: JSON.stringify({ query, read_only: readOnly }) }
    )
  }

  async queryJson<T>(sql: string): Promise<T[]> {
    return (await this.queryApi(sql, true)) as T[]
  }

  async runSql(sql: string, opts: RemoteSqlOpts): Promise<SqlRun> {
    const started = Date.now()
    try {
      const rows = await this.queryApi(sql, opts.readOnly)
      return {
        ok: true,
        results: [jsonToResult(rows, opts.maxRows)],
        durationMs: Date.now() - started,
        readOnly: opts.readOnly,
        error: null
      }
    } catch (err) {
      return {
        ok: false,
        results: [],
        durationMs: Date.now() - started,
        readOnly: opts.readOnly,
        error: toSqlError(err)
      }
    }
  }
}

/**
 * JSON sətirlərini şəbəkə formasına çevirir. Sütun sırası ilk sətrin açar
 * sırasıdır — API sütun metadata-sı vermir, ona görə eyniadlı sütunlar
 * (`select 1 as a, 2 as a`) burada birləşir. Lokal yolda belə deyil.
 */
function jsonToResult(rows: Array<Record<string, unknown>>, maxRows: number): SqlResult {
  const names: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!names.includes(key)) names.push(key)
  }
  const columns: SqlColumn[] = names.map((name) => ({ name, typeOid: 0, typeName: 'json' }))
  const truncated = rows.length > maxRows
  const kept = truncated ? rows.slice(0, maxRows) : rows
  return {
    command: null,
    columns,
    rows: kept.map((row) => names.map((n) => cellText(row[n]))),
    rowCount: rows.length,
    truncated
  }
}

/** Bütün xanalar mətn olmalıdır — lokal yoldakı `TEXT_TYPES` ilə eyni müqavilə. */
function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
