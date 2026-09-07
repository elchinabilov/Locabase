/**
 * Self-hosted mühit — Coolify/Contabo üzərində qalxmış Supabase.
 *
 * `next-cv/self-hosted/prod.sh`-in məntiqi burada TypeScript-dədir. Bağlantı
 * üçün sistemin `ssh` binarı işlədilir (ssh2 kitabxanası yox): belədə
 * `~/.ssh/config`-dəki Host alias-ları, ssh-agent və `known_hosts` olduğu kimi
 * işləyir — istifadəçinin terminalda gördüyü davranışın eynisi.
 */
import { basename } from 'node:path'
import { run } from '../cli.js'
import { paths } from '../projects.js'
import type {
  BackupInfo,
  HealthReport,
  Project,
  RemoteFunctionInfo,
  SelfHostedEnv,
  VerifyReport
} from '@shared/types.js'
import type { MigrationFile } from '../migrations.js'
import { readMigration } from '../migrations.js'
import type { LedgerRow, LogFn, RemoteAdapter } from './index.js'

/** Uzaq shell üçün təhlükəsiz sətir. */
function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
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

  /** Uzaqda əmr icra et. `input` varsa stdin-ə ötürülür. */
  private async ssh(
    command: string,
    opts: { input?: string; timeoutMs?: number; quiet?: boolean } = {}
  ): Promise<string> {
    const res = await run('ssh', [...this.sshArgs(), this.env.sshHost, command], {
      stream: this.stream,
      input: opts.input,
      timeoutMs: opts.timeoutMs ?? 120_000,
      quiet: opts.quiet
    })
    if (!res.ok) throw new Error(res.error ?? (res.output.trim() || 'ssh əmri uğursuz oldu'))
    return res.output
  }

  /** `docker exec -i <db> psql ...` — prod.sh-dəki `psql_remote` funksiyası. */
  private psql(sql: string, flags: string[] = []): Promise<string> {
    const cmd = [
      'docker exec -i',
      sq(this.env.dbContainer),
      'psql -U postgres -d postgres -v ON_ERROR_STOP=1',
      ...flags
    ].join(' ')
    return this.ssh(cmd, { input: sql, quiet: true })
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
   * Hər miqrasiya **öz tranzaksiyasında**, ledger sətri ilə birlikdə tətbiq
   * olunur — yarımçıq tətbiq qalmır (prod.sh-dəki eyni yanaşma).
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
    log('Yedək alınır…')
    const out = await this.ssh(`bash -s`, { input: script, timeoutMs: 30 * 60 * 1000 })
    const line = out.trim().split('\n').filter(Boolean).pop() ?? ''
    const parts = line.split(/\s+/)
    return {
      path: parts[parts.length - 1] ?? `${dir}/${prefix}.dump`,
      size: parts[4] ?? '?',
      createdAt: new Date().toISOString()
    }
  }

  /** Uzaq `.env` faylının açar adları — dəyərlər gətirilmir. */
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
   * Uzaq `.env`-i yenilə. Dəyərlər **stdin ilə** gedir — `ps` siyahısında və
   * shell tarixçəsində görünmür.
   */
  async setSecrets(kv: Record<string, string>, log: LogFn): Promise<void> {
    const entries = Object.entries(kv)
    if (entries.length === 0) return
    for (const [k, v] of entries) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`yararsız dəyişən adı: ${k}`)
      if (v.includes('\n')) throw new Error(`${k}: çoxsətirli dəyər dəstəklənmir`)
    }
    const file = `${this.env.remoteDir}/.env`
    log(`${entries.length} dəyişən yenilənir: ${entries.map(([k]) => k).join(', ')}`)

    // Skript uzaq əmrin özündədir, stdin isə **dəyərlərdir** — belədə heç bir
    // secret nə arqumentə, nə də shell tarixçəsinə düşür.
    const script = [
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
    ].join('; ')

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
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((name) => ({ name, version: null, status: null, updatedAt: null, verifyJwt: null }))
  }

  /**
   * Self-hosted-də `supabase functions deploy` yoxdur: qovluq rsync olunur və
   * edge runtime konteyneri yenidən başladılır.
   */
  async deployFunctions(names: string[], log: LogFn): Promise<void> {
    if (names.length === 0) return
    if (!this.env.functionsContainer) {
      throw new Error('Edge runtime konteyneri təyin edilməyib — funksiya deploy-u mümkün deyil.')
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

    // `_shared` qovluğu varsa o da lazımdır
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
   * Ledger sətrini əl ilə düzəlt. `applied` sətri əlavə edir (obyektlər həqiqətən
   * bazadadırsa), `reverted` isə silir. SQL-in özü heç nə tətbiq etmir.
   */
  async repairLedger(version: string, status: 'applied' | 'reverted', log: LogFn): Promise<void> {
    const v = version.replace(/'/g, "''")
    const sql =
      status === 'applied'
        ? `insert into supabase_migrations.schema_migrations (version) values ('${v}') on conflict (version) do nothing;`
        : `delete from supabase_migrations.schema_migrations where version = '${v}';`
    log(`ledger təmiri: ${version} → ${status}`)
    await this.psql(sql)
  }

  async verify(): Promise<VerifyReport> {
    const checks: VerifyReport['checks'] = []
    const targets: Array<[string, string]> = [
      ['REST', `${this.env.apiUrl.replace(/\/+$/, '')}/rest/v1/`],
      ['Auth', `${this.env.apiUrl.replace(/\/+$/, '')}/auth/v1/health`]
    ]
    if (this.env.siteUrl) targets.push(['Tətbiq', this.env.siteUrl])

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
}
