/**
 * Sync — lokal ilə remote arasındakı fərqin bir yerdə toplanması, sonra da
 * seçilmişlərin deploy-u.
 *
 * Deploy ardıcıllığı sabitdir: **backup → miqrasiyalar → funksiyalar →
 * secrets → verify**. Sxem dəyişikliyi tətbiq koduna toxunduqda əvvəlcə
 * miqrasiya getməlidir, ona görə funksiyalar sonradır.
 */
import { readMap } from './envfile.js'
import { logBus } from './log.js'
import { listFiles, report as migrationReport } from './migrations.js'
import { list as listFunctions } from './functions.js'
import { get as getProject, getEnv, paths } from './projects.js'
import { adapterFor } from './remote/index.js'
import { diff as schemaDiff } from './migrations.js'
import type {
  DeployPlan,
  FunctionInfo,
  MigrationRow,
  SecretDiff,
  SyncAxis,
  SyncReport,
  TaskResult
} from '@shared/types.js'

function axis<T>(items: T[], dirty: boolean, error: string | null = null): SyncAxis<T> {
  return { items, dirty, error }
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<[T, string | null]> {
  try {
    return [await fn(), null]
  } catch (err) {
    return [fallback, (err as Error).message]
  }
}

export async function report(id: string, envId: string): Promise<SyncReport> {
  const project = getProject(id)
  const env = getEnv(id, envId)
  const adapter = adapterFor(project, env)

  /* --- miqrasiyalar --- */
  const migrations = await migrationReport(id, envId)
  const pending = migrations.rows.filter((r) => r.state === 'pending-remote' || r.state === 'remote-only')

  /* --- sxem diffi --- */
  const [schema, schemaErr] = await safe(async () => (await schemaDiff(id)).sql, '')
  const schemaClean = schema.trim().length === 0 || /no schema changes found/i.test(schema)

  /* --- funksiyalar --- */
  const [functions, fnErr] = await safe(() => listFunctions(id, envId), [] as FunctionInfo[])
  // Yalnız məzmunu fərqlənən (və ya uzaqda olmayan) funksiyalar «çirkli»dir;
  // `unknown` — uzaq tərəf fayl vermir, fərq tələb üzərinə hesablanır.
  const fnDirty = functions.filter(
    (f) => f.path !== '' && (f.drift === 'local-only' || f.drift === 'changed')
  )

  /* --- secret adları --- */
  const localNames = [...readMap(paths.envFile(project)).keys()]
  const [remoteNames, secretErr] = await safe(() => adapter.listSecretNames(), [] as string[])
  const secretDiff: SecretDiff[] = []
  const remoteSet = new Set(remoteNames)
  for (const key of localNames) {
    secretDiff.push({ key, where: remoteSet.has(key) ? 'both' : 'local-only' })
  }
  for (const key of remoteNames) {
    if (!localNames.includes(key)) secretDiff.push({ key, where: 'remote-only' })
  }

  return {
    envId,
    migrations: axis<MigrationRow>(migrations.rows, pending.length > 0, migrations.error),
    schema: axis([{ sql: schema }], !schemaClean, schemaErr),
    functions: axis(functions, fnDirty.length > 0, fnErr),
    secrets: axis(
      secretDiff.sort((a, b) => a.key.localeCompare(b.key)),
      secretDiff.some((s) => s.where !== 'both'),
      secretErr
    ),
    authConfig: axis(
      [],
      false,
      env.kind === 'self-hosted'
        ? 'Self-hosted-də auth ayarları serverin .env-indədir — Secrets oxu ilə müqayisə olunur.'
        : 'Auth konfiqurasiyası `supabase config push` ilə göndərilir.'
    ),
    generatedAt: new Date().toISOString()
  }
}

/* ------------------------------------------------------------- deploy */

export async function deploy(id: string, plan: DeployPlan, confirm: string): Promise<TaskResult> {
  const project = getProject(id)
  if (confirm !== project.name) {
    return {
      ok: false,
      code: null,
      output: '',
      error: `Təsdiq uyğun gəlmir — «${project.name}» yazılmalıdır.`
    }
  }
  const env = getEnv(id, plan.envId)
  const adapter = adapterFor(project, env)
  const stream = `deploy:${env.name}`
  const log = (text: string): void => logBus.push(stream, 'info', text)
  const done: string[] = []

  try {
    if (plan.dryRun) {
      log('QURU REJİM — heç nə dəyişdirilmir')
      log(`miqrasiyalar: ${plan.migrations.join(', ') || 'yoxdur'}`)
      log(`funksiyalar: ${plan.functions.join(', ') || 'yoxdur'}`)
      log(`secrets: ${plan.secrets.join(', ') || 'yoxdur'}`)
      return { ok: true, code: 0, output: 'dry-run tamamlandı', error: null }
    }

    if (plan.steps.includes('backup')) {
      const info = await adapter.backup(log)
      log(`yedək hazırdır: ${info.path} (${info.size})`)
      done.push('backup')
    }

    if (plan.steps.includes('migrations') && plan.migrations.length > 0) {
      const files = listFiles(project.path).filter((f) => plan.migrations.includes(f.version))
      await adapter.applyMigrations(files, log)
      done.push(`miqrasiyalar (${files.length})`)
    }

    if (plan.steps.includes('functions') && plan.functions.length > 0) {
      await adapter.deployFunctions(plan.functions, log)
      done.push(`funksiyalar (${plan.functions.length})`)
    }

    if (plan.steps.includes('secrets') && plan.secrets.length > 0) {
      const local = readMap(paths.envFile(project))
      const kv: Record<string, string> = {}
      for (const key of plan.secrets) {
        const value = local.get(key)
        if (value === undefined) throw new Error(`${key} lokal .env-də yoxdur`)
        kv[key] = value
      }
      await adapter.setSecrets(kv, log)
      done.push(`secrets (${plan.secrets.length})`)
    }

    if (plan.steps.includes('verify')) {
      const v = await adapter.verify()
      for (const c of v.checks) {
        logBus.push(stream, c.ok ? 'info' : 'error', `${c.label}: ${c.info}`)
      }
      if (!v.ok) throw new Error('Yoxlama uğursuz oldu — loglara bax')
      done.push('verify')
    }

    return { ok: true, code: 0, output: `Tamamlandı: ${done.join(' · ')}`, error: null }
  } catch (err) {
    const message = (err as Error).message
    logBus.push(stream, 'error', message)
    return {
      ok: false,
      code: null,
      output: done.length > 0 ? `Tamamlanan addımlar: ${done.join(' · ')}` : '',
      error: message
    }
  }
}
