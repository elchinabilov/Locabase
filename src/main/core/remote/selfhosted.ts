/**
 * The self-hosted environment — a Supabase stack running on your own server
 * (Coolify, a plain VPS, …). The connection uses the system `ssh` binary rather
 * than the ssh2 library: that way `~/.ssh/config` host aliases, ssh-agent and
 * `known_hosts` all work exactly as they do in the user's terminal, with no
 * second configuration to keep in sync.
 */
import { basename } from 'node:path'
import { run } from '../cli.js'
import { paths } from '../projects.js'
import { MAX_FILE_BYTES } from '../filetree.js'
import { parseBytes } from '@shared/services.js'
import type {
  BackupInfo,
  HealthReport,
  Project,
  RemoteFile,
  RemoteFileChecksum,
  RemoteFunctionInfo,
  RemoteService,
  SelfHostedEnv,
  SqlRun,
  VerifyReport
} from '@shared/types.js'
import type { MigrationFile } from '../migrations.js'
import { readMigration } from '../migrations.js'
import type { LedgerRow, LogFn, RemoteAdapter, RemoteSqlOpts } from './index.js'
import { parsePsqlCsv, parsePsqlError } from '../sql/csv.js'
import { randomUUID } from 'node:crypto'

/** A string that is safe to paste into a remote shell. */
function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** `supabase-edge-functions-abc123` + `abc123` → `edge-functions` */
function serviceKeyOf(container: string, suffix: string): string {
  let key = container
  if (key.endsWith(`-${suffix}`)) key = key.slice(0, -(suffix.length + 1))
  return key.replace(/^supabase[-_]/, '') || container
}

/** `Up 2 hours (healthy)` → `healthy` */
function parseHealth(status: string): string | null {
  const m = /\((healthy|unhealthy|health: starting|starting)\)/i.exec(status)
  return m ? m[1]!.toLowerCase().replace('health: ', '') : null
}

/**
 * A bash script that merges the remote `.env` with `KEY=value` lines coming from
 * stdin: a key that already exists is replaced, everything else stays as it is,
 * and the result is moved into place atomically with 0600 permissions.
 *
 * Lines are joined with `\n` — joining with `;` would make `while … do;` a syntax error.
 */
export function envMergeScript(file: string): string {
  return [
    'set -e',
    'T="$(mktemp)"',
    'trap \'rm -f "$T" "$T.old"\' EXIT',
    'cat > "$T"',
    `TARGET=${sq(file)}`,
    'touch "$TARGET"',
    'cp "$TARGET" "$T.old"',
    'while IFS= read -r line; do',
    '  [ -z "$line" ] && continue',
    '  K="${line%%=*}"',
    '  grep -v "^${K}=" "$T.old" > "$T.new" || true',
    '  mv "$T.new" "$T.old"',
    'done < "$T"',
    'cat "$T" >> "$T.old"',
    'chmod 600 "$T.old"',
    'mv "$T.old" "$TARGET"',
    'echo updated'
  ].join('\n')
}

/**
 * A bash script that streams every file in a folder as a `<token><path>` header
 * plus base64 content. For a large file a `<token>!` marker is sent instead of the
 * content — so the file stays in the listing and isn't reported as "local only".
 */
export function dumpScript(dir: string, token: string): string {
  return [
    `cd ${sq(dir)}`,
    // dot-prefixed files are skipped — the local tree ignores them too
    `find . -type f -not -path '*/.*' | sort | while IFS= read -r f; do`,
    `  printf '%s%s\\n' ${sq(token)} "\${f#./}"`,
    `  if [ "$(wc -c < "$f")" -le ${MAX_FILE_BYTES} ]; then`,
    '    base64 < "$f"',
    '  else',
    `    printf '%s!\\n' ${sq(token)}`,
    '  fi',
    'done'
  ].join('\n')
}

/** `<token><path>` headers + base64 lines (or a `<token>!` marker) → files. */
export function decodeDump(out: string, token: string): RemoteFile[] {
  const files: RemoteFile[] = []
  let path: string | null = null
  let b64: string[] = []
  let skipped = false
  const flush = (): void => {
    if (path === null) return
    if (skipped) {
      files.push({ path, content: null, binary: true })
    } else {
      const buf = Buffer.from(b64.join(''), 'base64')
      const binary = buf.includes(0)
      files.push({ path, content: binary ? null : buf.toString('utf8'), binary })
    }
    path = null
    b64 = []
    skipped = false
  }
  for (const line of out.split('\n')) {
    if (line.startsWith(token)) {
      const rest = line.slice(token.length).trim()
      if (rest === '!') {
        skipped = true
        continue
      }
      flush()
      path = rest
      continue
    }
    if (path !== null) b64.push(line.trim())
  }
  flush()
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

const LEDGER_QUERY =
  "select version || '\\t' || coalesce(name, '') from supabase_migrations.schema_migrations order by version"

export class SelfHostedAdapter implements RemoteAdapter {
  readonly kind = 'self-hosted' as const

  constructor(
    private readonly project: Project,
    private readonly env: SelfHostedEnv
  ) {}

  private get stream(): string {
    return `remote:${this.env.name}`
  }

  private sshArgs(): string[] {
    const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12']
    if (this.env.sshPort && this.env.sshPort !== 22) args.push('-p', String(this.env.sshPort))
    if (this.env.sshKeyPath) args.push('-i', this.env.sshKeyPath)
    return args
  }

  /** Run a command remotely. `input`, when given, is piped to stdin. */
  private async ssh(
    command: string,
    opts: {
      input?: string
      timeoutMs?: number
      quiet?: boolean
      maxOutputLines?: number
    } = {}
  ): Promise<string> {
    const res = await run('ssh', [...this.sshArgs(), this.env.sshHost, command], {
      stream: this.stream,
      input: opts.input,
      timeoutMs: opts.timeoutMs ?? 120_000,
      quiet: opts.quiet,
      maxOutputLines: opts.maxOutputLines
    })
    if (!res.ok) throw new Error(res.error ?? (res.output.trim() || 'the ssh command failed'))
    return res.output
  }

  /** `docker exec -i <db> psql ...` — the remote equivalent of a local psql session. */
  private psql(
    sql: string,
    flags: string[] = [],
    opts: { timeoutMs?: number; maxOutputLines?: number } = {}
  ): Promise<string> {
    const cmd = [
      'docker exec -i',
      sq(this.env.dbContainer),
      'psql -U postgres -d postgres -v ON_ERROR_STOP=1',
      ...flags
    ].join(' ')
    return this.ssh(cmd, { input: sql, quiet: true, ...opts })
  }

  async ping(): Promise<HealthReport> {
    const details: HealthReport['details'] = []
    try {
      const uname = await this.ssh('uname -srm', { quiet: true, timeoutMs: 20_000 })
      details.push({ label: 'SSH', ok: true, info: uname.trim().split('\n')[0] ?? '' })
    } catch (err) {
      details.push({ label: 'SSH', ok: false, info: (err as Error).message })
      return { ok: false, kind: this.kind, details }
    }
    try {
      const out = await this.psql('select version();', ['-At'])
      details.push({ label: 'Postgres', ok: true, info: out.trim().split('\n')[0]?.slice(0, 60) ?? '' })
    } catch (err) {
      details.push({ label: 'Postgres', ok: false, info: (err as Error).message })
    }
    if (this.env.functionsContainer) {
      try {
        const out = await this.ssh(
          `docker inspect -f '{{.State.Status}}' ${sq(this.env.functionsContainer)}`,
          { quiet: true, timeoutMs: 30_000 }
        )
        details.push({ label: 'Edge runtime', ok: out.includes('running'), info: out.trim() })
      } catch (err) {
        details.push({ label: 'Edge runtime', ok: false, info: (err as Error).message })
      }
    }
    return { ok: details.every((d) => d.ok), kind: this.kind, details }
  }

  async listAppliedMigrations(): Promise<LedgerRow[]> {
    const out = await this.psql(`${LEDGER_QUERY};`, ['-At'])
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('NOTICE'))
      .map((line) => {
        const [version, name] = line.split('\t')
        return { version: version!.trim(), name: name?.trim() || null }
      })
      .filter((r) => /^\d+$/.test(r.version))
  }

  /**
   * Every migration is applied **in its own transaction**, together with its ledger
   * row — so a half-applied migration can't be left behind.
   */
  async applyMigrations(files: MigrationFile[], log: LogFn): Promise<void> {
    for (const file of files) {
      log(`${file.version} — ${basename(file.file)}`)
      const sql = [
        'begin;',
        readMigration(file.file),
        ';',
        `insert into supabase_migrations.schema_migrations (version, name)`,
        `values ('${file.version.replace(/'/g, "''")}', '${file.name.replace(/'/g, "''")}')`,
        'on conflict (version) do nothing;',
        'commit;'
      ].join('\n')
      await this.psql(sql)
    }
  }

  async backup(log: LogFn): Promise<BackupInfo> {
    const dir = this.env.backupDir || '/var/backups/supabase'
    const prefix = this.project.projectId
    const script = [
      'set -e',
      `mkdir -p ${sq(dir)}`,
      `F=${sq(dir)}/${prefix}-$(date +%F-%H%M%S).dump`,
      `docker exec -i ${sq(this.env.dbContainer)} pg_dump -U postgres -Fc postgres > "$F"`,
      'ls -lh "$F"',
      `find ${sq(dir)} -name ${sq(`${prefix}-*.dump`)} -mtime +${this.env.backupRetentionDays || 14} -delete`
    ].join('\n')
    log('Taking a backup…')
    const out = await this.ssh(`bash -s`, { input: script, timeoutMs: 30 * 60 * 1000 })
    const line = out.trim().split('\n').filter(Boolean).pop() ?? ''
    const parts = line.split(/\s+/)
    return {
      path: parts[parts.length - 1] ?? `${dir}/${prefix}.dump`,
      size: parts[4] ?? '?',
      createdAt: new Date().toISOString()
    }
  }

  /** The key names in the remote `.env` — values are not fetched. */
  async listSecretNames(): Promise<string[]> {
    const file = `${this.env.remoteDir}/.env`
    const out = await this.ssh(
      `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' ${sq(file)} 2>/dev/null | tr -d '=' | sort -u || true`,
      { quiet: true }
    )
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(l))
  }

  /**
   * Update the remote `.env`. Values travel **over stdin** — they never appear in
   * `ps` output or in shell history.
   */
  async setSecrets(kv: Record<string, string>, log: LogFn): Promise<void> {
    const entries = Object.entries(kv)
    if (entries.length === 0) return
    for (const [k, v] of entries) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`invalid variable name: ${k}`)
      if (v.includes('\n')) throw new Error(`${k}: multi-line values are not supported`)
    }
    const file = `${this.env.remoteDir}/.env`
    log(`Updating ${entries.length} variable(s): ${entries.map(([k]) => k).join(', ')}`)

    // The script lives in the remote command itself while stdin carries the **values** —
    // that way no secret ends up in an argument or in shell history.
    const script = envMergeScript(file)

    const payload = `${entries.map(([k, v]) => `${k}=${v}`).join('\n')}\n`
    await this.ssh(`bash -c ${sq(script)}`, { input: payload, quiet: true, timeoutMs: 60_000 })
  }

  async listFunctions(): Promise<RemoteFunctionInfo[]> {
    if (!this.env.functionsContainer) return []
    const dir = `${this.env.remoteDir}/volumes/functions`
    const out = await this.ssh(
      `ls -1 ${sq(dir)} 2>/dev/null | grep -v '^_' || true`,
      { quiet: true }
    )
    const names = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    // The file md5s of every function arrive in **one** ssh call —
    // showing the difference doesn't require pulling the files.
    const checksums = await this.functionChecksums(dir)
    return names.map((name) => ({
      name,
      version: null,
      status: null,
      updatedAt: null,
      verifyJwt: null,
      files: checksums?.get(name) ?? (checksums ? [] : null)
    }))
  }

  /** `<function name> → [{path, md5}]`; null when md5sum is unavailable. */
  private async functionChecksums(dir: string): Promise<Map<string, RemoteFileChecksum[]> | null> {
    let out: string
    try {
      out = await this.ssh(
        `cd ${sq(dir)} 2>/dev/null && find . -type f -not -path './_*' -not -path '*/.*' -exec md5sum {} + 2>/dev/null || true`,
        { quiet: true, maxOutputLines: 20_000 }
      )
    } catch {
      return null
    }
    const byName = new Map<string, RemoteFileChecksum[]>()
    let seen = false
    for (const line of out.split('\n')) {
      const m = /^([0-9a-f]{32})\s+\.\/(.+)$/.exec(line.trim())
      if (!m) continue
      seen = true
      const rel = m[2]!
      const slash = rel.indexOf('/')
      if (slash === -1) continue
      const name = rel.slice(0, slash)
      const path = rel.slice(slash + 1)
      byName.set(name, [...(byName.get(name) ?? []), { path, md5: m[1]! }])
    }
    return seen || out.trim() === '' ? byName : null
  }

  async readFunction(name: string): Promise<RemoteFile[]> {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`invalid function name: ${name}`)
    const dir = `${this.env.remoteDir}/volumes/functions/${name}`
    // The separator is random per call — file content must never collide with it
    const token = `__LOCABASE_${randomUUID().replace(/-/g, '')}__`
    const out = await this.ssh(`bash -c ${sq(dumpScript(dir, token))}`, {
      quiet: true,
      maxOutputLines: 200_000,
      timeoutMs: 120_000
    })
    return decodeDump(out, token)
  }

  /**
   * There is no `supabase functions deploy` for self-hosted: the folder is rsynced
   * and the edge runtime container is restarted.
   */
  async deployFunctions(names: string[], log: LogFn): Promise<void> {
    if (names.length === 0) return
    if (!this.env.functionsContainer) {
      throw new Error('No edge runtime container is configured — functions cannot be deployed.')
    }
    const localDir = paths.functionsDir(this.project)
    const remoteDir = `${this.env.remoteDir}/volumes/functions`
    const sshCmd = ['ssh', ...this.sshArgs()].join(' ')

    for (const name of names) {
      log(`rsync: ${name}`)
      const res = await run(
        'rsync',
        [
          '-az',
          '--delete',
          '-e',
          sshCmd,
          `${localDir}/${name}/`,
          `${this.env.sshHost}:${remoteDir}/${name}/`
        ],
        { stream: this.stream, timeoutMs: 10 * 60 * 1000 }
      )
      if (!res.ok) throw new Error(`${name}: ${res.error ?? res.output}`)
    }

    // the `_shared` folder is needed too, when present
    const sharedLocal = `${localDir}/_shared`
    const shared = await run('test', ['-d', sharedLocal], { quiet: true })
    if (shared.ok) {
      log('rsync: _shared')
      await run(
        'rsync',
        ['-az', '--delete', '-e', sshCmd, `${sharedLocal}/`, `${this.env.sshHost}:${remoteDir}/_shared/`],
        { stream: this.stream, timeoutMs: 5 * 60 * 1000 }
      )
    }

    log(`restart: ${this.env.functionsContainer}`)
    await this.ssh(`docker restart ${sq(this.env.functionsContainer)}`, { timeoutMs: 180_000 })
  }

  /**
   * Repair a ledger row by hand. `applied` inserts the row (when the objects really
   * are in the database), `reverted` removes it. The SQL itself applies nothing.
   */
  async repairLedger(version: string, status: 'applied' | 'reverted', log: LogFn): Promise<void> {
    const v = version.replace(/'/g, "''")
    const sql =
      status === 'applied'
        ? `insert into supabase_migrations.schema_migrations (version) values ('${v}') on conflict (version) do nothing;`
        : `delete from supabase_migrations.schema_migrations where version = '${v}';`
    log(`ledger repair: ${version} → ${status}`)
    await this.psql(sql)
  }

  /**
   * The stack's containers. Coolify names them `supabase-<service>-<id>`, so the
   * suffix of the Postgres container is the key to finding the whole stack — the
   * same trick a hand-written deploy script uses.
   */
  async listServices(): Promise<RemoteService[]> {
    const suffix = this.env.dbContainer.slice(this.env.dbContainer.lastIndexOf('-') + 1)
    if (suffix.length < 4) {
      throw new Error(
        `Could not derive the stack suffix from the Postgres container name: ${this.env.dbContainer}`
      )
    }

    const [psOut, statsOut] = await Promise.all([
      this.ssh(
        `docker ps -a --format '{{.Names}}\t{{.State}}\t{{.Status}}' | grep -- ${sq(`-${suffix}`)} || true`,
        { quiet: true }
      ),
      this.ssh(
        `docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' | grep -- ${sq(`-${suffix}`)} || true`,
        { quiet: true, timeoutMs: 60_000 }
      ).catch(() => '')
    ])

    const mem = new Map<string, { memory: number | null; memoryLimit: number | null }>()
    for (const line of statsOut.split('\n')) {
      const [name, usage] = line.split('\t')
      if (!name || !usage) continue
      const [used, limit] = usage.split('/')
      mem.set(name.trim(), {
        memory: parseBytes(used ?? ''),
        memoryLimit: parseBytes(limit ?? '')
      })
    }

    const out: RemoteService[] = []
    for (const line of psOut.split('\n')) {
      const [name, state, status] = line.split('\t')
      if (!name?.trim()) continue
      const container = name.trim()
      const m = mem.get(container) ?? { memory: null, memoryLimit: null }
      out.push({
        container,
        key: serviceKeyOf(container, suffix),
        state: (state ?? '').trim(),
        health: parseHealth(status ?? ''),
        memory: m.memory,
        memoryLimit: m.memoryLimit
      })
    }
    return out.sort((a, b) => a.key.localeCompare(b.key))
  }

  /**
   * Stop / start a container. Note: Coolify may bring it back up on the next
   * deploy — to disable it for good, remove it from the compose file.
   */
  async setServiceState(container: string, on: boolean, log: LogFn): Promise<void> {
    const suffix = this.env.dbContainer.slice(this.env.dbContainer.lastIndexOf('-') + 1)
    if (!container.endsWith(`-${suffix}`)) {
      throw new Error(`This container does not belong to the stack: ${container}`)
    }
    if (!on && container === this.env.dbContainer) {
      throw new Error('The Postgres container cannot be stopped.')
    }
    log(`docker ${on ? 'start' : 'stop'} ${container}`)
    await this.ssh(`docker ${on ? 'start' : 'stop'} ${sq(container)}`, { timeoutMs: 180_000 })
  }

  async verify(): Promise<VerifyReport> {
    const checks: VerifyReport['checks'] = []
    const targets: Array<[string, string]> = [
      ['REST', `${this.env.apiUrl.replace(/\/+$/, '')}/rest/v1/`],
      ['Auth', `${this.env.apiUrl.replace(/\/+$/, '')}/auth/v1/health`]
    ]
    if (this.env.siteUrl) targets.push(['App', this.env.siteUrl])

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

  /* ------------------------------------------------------------ SQL */

  /**
   * Free-form SQL — through `psql -q --csv`. CSV is chosen because commas, line
   * breaks and quotes inside a value survive it; `-P null=<uuid>` separates NULL
   * from an empty string (CSV renders both as an empty field).
   *
   * `-q` turns off command tags, so the output is a single result block: for a
   * MULTI-STATEMENT SCRIPT it would be wrong to show only the first block, so the
   * remote environment shows one result and the UI says so.
   */
  async runSql(sql: string, opts: RemoteSqlOpts): Promise<SqlRun> {
    const started = Date.now()
    const nullToken = `lbnull-${randomUUID()}`
    const timeout = Math.max(1000, Math.min(600_000, Math.trunc(opts.timeoutMs)))
    // Read-only is enforced SERVER-side — checking SQL with a regex is not
    // trustworthy. When psql's stdin ends the connection closes and the
    // transaction rolls back, so there is no need to write `rollback`.
    const prelude = opts.readOnly
      ? `begin read only;\nset local statement_timeout = ${timeout};\n`
      : `set statement_timeout = ${timeout};\n`
    try {
      const out = await this.psql(
        `${prelude}${sql}`,
        ['-q', '--csv', '-P', `null=${nullToken}`],
        // the result must not be truncated: the default 200-line log limit would corrupt data
        { maxOutputLines: 200_000, timeoutMs: timeout + 30_000 }
      )
      const parsed = parsePsqlCsv(out, nullToken)
      const truncated = parsed.rows.length > opts.maxRows
      return {
        ok: true,
        results: [
          {
            command: null,
            columns: parsed.columns.map((name) => ({ name, typeOid: 0, typeName: 'text' })),
            rows: truncated ? parsed.rows.slice(0, opts.maxRows) : parsed.rows,
            rowCount: parsed.rows.length,
            truncated
          }
        ],
        durationMs: Date.now() - started,
        readOnly: opts.readOnly,
        error: null
      }
    } catch (err) {
      const parsed = parsePsqlError((err as Error).message)
      return {
        ok: false,
        results: [],
        durationMs: Date.now() - started,
        readOnly: opts.readOnly,
        error: {
          message: parsed.message,
          code: null,
          severity: null,
          detail: parsed.detail,
          hint: parsed.hint,
          // psql gives no `position` — the caret marker only shows up locally
          position: null,
          where: null,
          table: null,
          column: null,
          constraint: null
        }
      }
    }
  }

  /**
   * An internal query. `json_agg` collects the whole result into one cell: that
   * preserves types (bool, number, null) without passing through CSV's text world.
   */
  async queryJson<T>(sql: string): Promise<T[]> {
    // The alias is deliberately an odd name: it must not collide with the wrapped query's own CTE names
    const wrapped = `select coalesce(json_agg(__lbq), '[]'::json)::text from (${sql}) __lbq;`
    const out = await this.psql(wrapped, ['-q', '-A', '-t'], { maxOutputLines: 200_000 })
    const text = out.trim()
    if (!text) return []
    try {
      return JSON.parse(text) as T[]
    } catch {
      throw new Error(`The result did not parse as JSON: ${text.slice(0, 200)}`)
    }
  }
}
