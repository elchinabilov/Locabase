/**
 * The managed environment — a supabase.com project.
 *
 * The CLI does most of the work (link, db push, functions deploy, secrets), while
 * the auth configuration is read through the Management API. The access token is
 * never passed as an argument — only through the `SUPABASE_ACCESS_TOKEN` env var.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  BackupFormat,
  BackupInfo,
  BackupScope,
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
import { supabase, supabaseJson } from '../cli.js'
import { get as getSecret, keys } from '../secrets.js'
import { readTree } from '../filetree.js'
import type { MigrationFile } from '../migrations.js'
import { toSqlError } from '../sql/build.js'
import type { LedgerRow, LogFn, RemoteAdapter, RemoteSqlOpts } from './index.js'

const API = 'https://api.supabase.com'

/** Past this the Management API is the wrong tool — see `restoreFrom`. */
const MANAGED_RESTORE_LIMIT = 8 * 1024 * 1024

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
        `No access token for «${this.env.name}» — add one in the environment settings.`
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

  /** Re-link when `supabase/.temp/project-ref` points somewhere other than this environment. */
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
    if (!res.ok) throw new Error(`link failed: ${res.error ?? res.output}`)
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
      details.push({ label: 'Project', ok: true, info: `${p.name} · ${p.region} · ${p.status}` })
    } catch (err) {
      details.push({ label: 'Project', ok: false, info: (err as Error).message })
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
   * There is no selective migration apply on managed — `db push` applies every
   * pending migration in order. The UI warns the user about this.
   */
  async applyMigrations(_files: MigrationFile[], log: LogFn): Promise<void> {
    await this.ensureLinked()
    log('supabase db push — every pending migration will be applied')
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
    log(`Schema backup: ${file}`)
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

  /**
   * A managed project has no shell, so the dump goes through the CLI. `db dump`
   * writes one aspect at a time — a `full` backup is roles + schema + data,
   * concatenated in restore order into a single `.sql` file.
   */
  async dumpTo(
    file: string,
    scope: BackupScope,
    log: LogFn
  ): Promise<{ bytes: number; format: BackupFormat }> {
    await this.ensureLinked()
    const parts: Array<{ name: string; args: string[] }> =
      scope === 'schema'
        ? [{ name: 'schema', args: [] }]
        : scope === 'data'
          ? [{ name: 'data', args: ['--data-only'] }]
          : [
              { name: 'roles', args: ['--role-only'] },
              { name: 'schema', args: [] },
              { name: 'data', args: ['--data-only'] }
            ]

    const tmp = mkdtempSync(join(tmpdir(), 'locabase-dump-'))
    try {
      writeFileSync(file, `-- locabase ${scope} dump of ${this.env.projectRef}\n`, { mode: 0o600 })
      for (const part of parts) {
        const piece = join(tmp, `${part.name}.sql`)
        log(`supabase db dump — ${part.name}`)
        const res = await supabase(['db', 'dump', '--linked', '-f', piece, ...part.args], {
          cwd: this.project.path,
          env: this.cliEnv(),
          stream: this.stream,
          timeoutMs: 60 * 60 * 1000
        })
        if (!res.ok) throw new Error(res.error ?? res.output)
        appendFileSync(file, `\n-- ---------- ${part.name} ----------\n`)
        appendFileSync(file, readFileSync(piece))
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
    return { bytes: statSync(file).size, format: 'plain' }
  }

  /**
   * A managed project has no shell to pipe a dump into, so the SQL goes through
   * the Management API query endpoint in one request. That works for schema-sized
   * dumps and not for a full production database — rather than half-restore and
   * leave a broken schema behind, anything larger is refused with the `psql`
   * command line to run instead.
   */
  async restoreFrom(
    file: string,
    format: BackupFormat,
    _clean: boolean,
    log: LogFn
  ): Promise<{ output: string }> {
    if (format !== 'plain') {
      throw new Error(
        'A managed project can only take a plain `.sql` dump — restore a custom-format one with `pg_restore` against the project connection string.'
      )
    }
    const bytes = statSync(file).size
    if (bytes > MANAGED_RESTORE_LIMIT) {
      throw new Error(
        `The dump is ${Math.round(bytes / 1024 / 1024)} MB — too large for the Management API. ` +
          `Restore it from a terminal instead: psql "<connection string>" -f ${file} ` +
          '(the string is in the project dashboard, Settings → Database).'
      )
    }
    log(`Restoring ${bytes} bytes into ${this.env.projectRef} through the Management API`)
    const run = await this.runSql(readFileSync(file, 'utf8'), {
      readOnly: false,
      maxRows: 1,
      timeoutMs: 60 * 60 * 1000
    })
    if (!run.ok) throw new Error(run.error?.message ?? 'the restore query failed')
    return { output: `${this.env.projectRef}: restore query finished` }
  }

  async listSecretNames(): Promise<string[]> {
    const rows = await this.api<Array<{ name: string }>>(
      `/v1/projects/${this.env.projectRef}/secrets`
    )
    return rows.map((r) => r.name).sort()
  }

  /** Values go through a temporary 0600 file — so they never show up in `ps`. */
  async setSecrets(kv: Record<string, string>, log: LogFn): Promise<void> {
    const entries = Object.entries(kv)
    if (entries.length === 0) return
    const dir = mkdtempSync(join(tmpdir(), 'supagui-'))
    const file = join(dir, '.env')
    try {
      writeFileSync(file, entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n'), {
        mode: 0o600
      })
      log(`Sending ${entries.length} secret(s): ${entries.map(([k]) => k).join(', ')}`)
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
      Array<{
        slug: string
        version: number
        status: string
        updated_at: number
        verify_jwt: boolean
      }>
    >(`/v1/projects/${this.env.projectRef}/functions`)
    return rows.map((r) => ({
      name: r.slug,
      version: r.version ?? null,
      status: r.status ?? null,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      verifyJwt: r.verify_jwt ?? null,
      // The Management API gives no file listing — the diff is only available
      // through `readFunction`.
      files: null
    }))
  }

  /**
   * The remote source is downloaded with `functions download` into a **temporary**
   * working folder — the project's own `supabase/functions/` is never overwritten.
   */
  async readFunction(name: string): Promise<RemoteFile[]> {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`invalid function name: ${name}`)
    const work = mkdtempSync(join(tmpdir(), 'locabase-fn-'))
    try {
      mkdirSync(join(work, 'supabase'), { recursive: true })
      writeFileSync(join(work, 'supabase', 'config.toml'), `project_id = "download"\n`, 'utf8')
      const args = [
        'functions',
        'download',
        name,
        '--project-ref',
        this.env.projectRef,
        '--workdir',
        work
      ]
      const opts = { cwd: work, env: this.cliEnv(), stream: this.stream, timeoutMs: 5 * 60 * 1000 }
      // `--use-api` unbundles server-side — no Docker required.
      // Older CLIs don't know the flag, in which case we retry the normal way.
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
        {
          cwd: this.project.path,
          env: this.cliEnv(),
          stream: this.stream,
          timeoutMs: 10 * 60 * 1000
        }
      )
      if (!res.ok) throw new Error(`${name}: ${res.error ?? res.output}`)
    }
  }

  /**
   * Individual services cannot be turned off on a managed project — the platform
   * manages them and there is no API for it.
   */
  async listServices(): Promise<RemoteService[]> {
    return []
  }

  async setServiceState(): Promise<void> {
    throw new Error(
      'Services cannot be switched off individually on a managed project — supabase.com manages them.'
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
   * The Management API's `database/query` endpoint. Results arrive as JSON row
   * objects — there is no column metadata and no command tag.
   *
   * `read_only` is enforced SERVER-side: that is our only protection here, because
   * this transport has no way to send `begin read only`.
   */
  private async queryApi(
    query: string,
    readOnly: boolean
  ): Promise<Array<Record<string, unknown>>> {
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
 * Turns JSON rows into a grid. Column order is the key order of the first row —
 * the API gives no column metadata, so identically named columns
 * (`select 1 as a, 2 as a`) collapse here. The local path does not do this.
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

/** Every cell has to be text — the same contract as `TEXT_TYPES` on the local path. */
function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
