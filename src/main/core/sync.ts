/**
 * Sync — collecting the differences between local and remote in one place, then
 * deploying the selected ones.
 *
 * The deploy order is fixed: **backup → migrations → functions → secrets → auth →
 * verify**. Auth comes after secrets because both write the same remote `.env`,
 * and the auth step is the one that recreates a container. When a schema change touches application code the migration has to
 * land first, which is why functions come after it.
 */
import type {
  AuthVarDiff,
  DeployPlan,
  FunctionInfo,
  MigrationRow,
  RemoteEnv,
  RemoteSecret,
  SecretDiff,
  SyncAxis,
  SyncReport,
  TaskResult
} from '@shared/types/index.js'
import { authDirty } from '@shared/gotrue.js'
import type { DesiredAuth } from '@shared/gotrue.js'
import { describeProblems, desiredFor, diffRows, valuesFor } from './authconfig.js'
import { readMap } from './envfile.js'
import { logBus } from './log.js'
import { listFiles, report as migrationReport } from './migrations.js'
import { list as listFunctions } from './functions.js'
import { get as getProject, getEnv, paths } from './projects.js'
import { adapterFor } from './remote/index.js'
import type { RemoteAdapter } from './remote/index.js'
import { buildSecretDiff, remoteNameOf, secretsDirty } from './secret-diff.js'
import { diff as schemaDiff } from './migrations.js'

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

/**
 * The provider axis.
 *
 * Managed projects push `[auth.external.*]` with `supabase config push`, so there
 * is nothing to derive there and the axis stays empty with a note. On a
 * self-hosted stack nothing carries the local file to the server at all, which is
 * the whole reason this axis exists: `config.toml` says Google is on, GoTrue is
 * never told, and the login answers `provider is not enabled`.
 *
 * A gap in the compose file is reported as the axis error rather than as clean
 * rows — pushing variables the auth container is not handed would report success
 * and change nothing.
 */
async function authAxis(
  id: string,
  env: RemoteEnv,
  adapter: RemoteAdapter,
  remoteSecrets: RemoteSecret[]
): Promise<SyncAxis<AuthVarDiff>> {
  if (env.kind !== 'self-hosted') {
    return axis([], false, 'Auth configuration is pushed with `supabase config push`.')
  }

  const empty: DesiredAuth = { vars: [], problems: [] }
  const [desired, desiredErr] = await safe(async () => desiredFor(id, env.apiUrl), empty)
  if (desiredErr !== null) return axis<AuthVarDiff>([], false, desiredErr)

  const remote = new Map(remoteSecrets.map((s) => [s.name, s.value ?? '']))
  const rows = diffRows(desired.vars, remote)

  const notes: string[] = []
  if (desired.problems.length > 0) {
    notes.push(
      `Enabled locally but incomplete in config.toml, so not pushed: ${describeProblems(desired.problems)}.`
    )
  }

  // Only worth asking about the variables we would actually write.
  const pending = rows.filter((r) => r.where !== 'both').map((r) => r.name)
  if (pending.length > 0) {
    const [gaps] = await safe(() => adapter.authEnvGaps(pending), null)
    if (gaps !== null && gaps.missing.length > 0) {
      const head = gaps.missing.slice(0, 3).join(', ')
      notes.push(
        `${gaps.composePath ?? 'The compose file'} does not hand ${gaps.service ?? 'the auth service'} ` +
          `${gaps.missing.length} of these variables (${head}${gaps.missing.length > 3 ? ', …' : ''}). ` +
          'Deploying the auth step adds the lines and recreates the container; on Coolify paste the ' +
          'same lines into its compose editor so the next deploy keeps them.'
      )
    }
  }

  return axis(rows, authDirty(rows), notes.length > 0 ? notes.join(' ') : null)
}

export async function report(id: string, envId: string): Promise<SyncReport> {
  const project = getProject(id)
  const env = getEnv(id, envId)
  const adapter = adapterFor(project, env)

  /* --- migrations --- */
  const migrations = await migrationReport(id, envId)
  const pending = migrations.rows.filter(
    (r) => r.state === 'pending-remote' || r.state === 'remote-only'
  )

  /* --- sxem diffi --- */
  const [schema, schemaErr] = await safe(async () => (await schemaDiff(id)).sql, '')
  const schemaClean = schema.trim().length === 0 || /no schema changes found/i.test(schema)

  /* --- functions --- */
  const [functions, fnErr] = await safe(() => listFunctions(id, envId), [] as FunctionInfo[])
  // Only functions whose content differs (or that are missing remotely) are "dirty";
  // `unknown` means the remote gives no file listing, so the diff is computed on demand.
  const fnDirty = functions.filter(
    (f) => f.path !== '' && (f.drift === 'local-only' || f.drift === 'changed')
  )

  /* --- secrets --- */
  const [remoteSecrets, secretErr] = await safe(() => adapter.listSecrets(), [] as RemoteSecret[])
  const secretDiff: SecretDiff[] = buildSecretDiff(
    readMap(paths.envFile(project)),
    remoteSecrets,
    env.secretMap
  )

  /* --- auth providers --- */
  const auth = await authAxis(id, env, adapter, remoteSecrets)

  return {
    envId,
    migrations: axis<MigrationRow>(migrations.rows, pending.length > 0, migrations.error),
    schema: axis([{ sql: schema }], !schemaClean, schemaErr),
    functions: axis(functions, fnDirty.length > 0, fnErr),
    secrets: axis(secretDiff, secretsDirty(secretDiff), secretErr),
    authConfig: auth,
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
      error: `Confirmation does not match — «${project.name}» must be typed.`
    }
  }
  const env = getEnv(id, plan.envId)
  const adapter = adapterFor(project, env)
  const stream = `deploy:${env.name}`
  const log = (text: string): void => logBus.push(stream, 'info', text)
  const done: string[] = []

  try {
    if (plan.dryRun) {
      log('DRY RUN — nothing is changed')
      log(`migrations: ${plan.migrations.join(', ') || 'none'}`)
      log(`functions: ${plan.functions.join(', ') || 'none'}`)
      log(`secrets: ${plan.secrets.join(', ') || 'none'}`)
      log(`secret deletes: ${plan.secretDeletes.join(', ') || 'none'}`)
      log(`auth variables: ${plan.authVars.join(', ') || 'none'}`)
      return { ok: true, code: 0, output: 'dry run finished', error: null }
    }

    if (plan.steps.includes('backup')) {
      const info = await adapter.backup(log)
      log(`backup ready: ${info.path} (${info.size})`)
      done.push('backup')
    }

    if (plan.steps.includes('migrations') && plan.migrations.length > 0) {
      const files = listFiles(project.path).filter((f) => plan.migrations.includes(f.version))
      await adapter.applyMigrations(files, log)
      done.push(`migrations (${files.length})`)
    }

    if (plan.steps.includes('functions') && plan.functions.length > 0) {
      await adapter.deployFunctions(plan.functions, log)
      done.push(`functions (${plan.functions.length})`)
    }

    if (plan.steps.includes('secrets')) {
      // `plan.secrets` holds LOCAL keys; the adapter is given remote names. The
      // mapping is applied here and nowhere else, so an adapter never has to know
      // that the two sides may spell a secret differently.
      const local = readMap(paths.envFile(project))
      const kv: Record<string, string> = {}
      for (const key of plan.secrets) {
        const value = local.get(key)
        if (value === undefined) throw new Error(`${key} is missing from the local .env`)
        kv[remoteNameOf(env.secretMap, key)] = value
      }
      if (plan.secrets.length > 0) {
        await adapter.setSecrets(kv, log)
        done.push(`secrets (${plan.secrets.length})`)
      }
      if (plan.secretDeletes.length > 0) {
        await adapter.unsetSecrets(plan.secretDeletes, log)
        done.push(`secrets removed (${plan.secretDeletes.length})`)
      }
    }

    if (plan.steps.includes('auth') && plan.authVars.length > 0) {
      if (env.kind !== 'self-hosted') {
        throw new Error(
          'Auth providers are pushed to a managed project with `supabase config push`, not as variables.'
        )
      }
      // These are already GOTRUE_* names — the environment's secret mapping
      // translates local `.env` keys and must not touch them.
      const kv = valuesFor(id, env.apiUrl, plan.authVars)
      await adapter.setSecrets(kv, log)
      const applied = await adapter.applyAuthVars(plan.authVars, log)
      if (applied.composeChanged) {
        log(
          `${applied.composePath} was edited — on Coolify the file is regenerated from its ` +
            'database on the next deploy, so add the same lines in its compose editor to keep them.'
        )
      }
      done.push(`auth (${plan.authVars.length})`)
    }

    if (plan.steps.includes('verify')) {
      const v = await adapter.verify()
      for (const c of v.checks) {
        logBus.push(stream, c.ok ? 'info' : 'error', `${c.label}: ${c.info}`)
      }
      if (!v.ok) throw new Error('Verification failed — check the logs')
      done.push('verify')
    }

    return { ok: true, code: 0, output: `Finished: ${done.join(' · ')}`, error: null }
  } catch (err) {
    const message = (err as Error).message
    logBus.push(stream, 'error', message)
    return {
      ok: false,
      code: null,
      output: done.length > 0 ? `Completed steps: ${done.join(' · ')}` : '',
      error: message
    }
  }
}
