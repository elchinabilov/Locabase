/**
 * The local side of the auth-provider sync: what `config.toml` says about
 * `[auth.external.*]`, expressed as the `GOTRUE_*` variables a self-hosted stack
 * needs, and the diff against what the remote `.env` holds today.
 *
 * The push itself lives in `sync.ts` — this module only reads and compares.
 */
import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import { AUTH_PROVIDERS } from '@shared/providers.js'
import {
  buildAuthDiff,
  desiredAuthVars,
  type AuthVarDiff,
  type DesiredAuth,
  type DesiredVar,
  type LocalProvider
} from '@shared/gotrue.js'
import { resolveRef } from './config.js'
import { mask, readMap } from './envfile.js'
import { get as getProject, paths } from './projects.js'

function externalTable(configText: string): Record<string, Record<string, unknown>> {
  const parsed = parseToml(configText) as Record<string, unknown>
  const auth = parsed.auth
  if (auth === null || typeof auth !== 'object') return {}
  const external = (auth as Record<string, unknown>).external
  if (external === null || typeof external !== 'object') return {}
  return external as Record<string, Record<string, unknown>>
}

/**
 * Every provider the app knows about, with the local file's answer for it.
 *
 * Providers the file never mentions are included as disabled rather than
 * skipped: "off here" is a fact worth carrying to a server that may have them
 * on, and `desiredAuthVars` drops the ones that are off on both sides.
 */
export function localProviders(projectId: string): LocalProvider[] {
  const project = getProject(projectId)
  const text = readFileSync(paths.configToml(project), 'utf8')
  const external = externalTable(text)
  const env = readMap(paths.envFile(project))

  return AUTH_PROVIDERS.map((p) => {
    const node = external[p.id] ?? {}
    const fields: Record<string, string> = {}
    for (const field of p.fields) {
      const value = resolveRef(node[field], env)
      if (value !== null) fields[field] = value
    }
    return { id: p.id, enabled: resolveRef(node.enabled, env) === 'true', fields }
  })
}

/** The variables the remote must hold for it to behave the way the local stack does. */
export function desiredFor(projectId: string, apiUrl: string): DesiredAuth {
  return desiredAuthVars(localProviders(projectId), apiUrl)
}

/** The values for the named variables — for the push. Never logged. */
export function valuesFor(
  projectId: string,
  apiUrl: string,
  names: string[]
): Record<string, string> {
  const wanted = new Set(names)
  const kv: Record<string, string> = {}
  for (const v of desiredFor(projectId, apiUrl).vars) {
    if (wanted.has(v.name)) kv[v.name] = v.value
  }
  const missing = names.filter((n) => !(n in kv))
  if (missing.length > 0) {
    throw new Error(
      `The local configuration no longer produces ${missing.join(', ')} — recompute the diff.`
    )
  }
  return kv
}

/** The diff rows, with secret values masked for the screen. */
export function diffRows(desired: DesiredVar[], remote: Map<string, string>): AuthVarDiff[] {
  return buildAuthDiff(desired, remote).map((row) =>
    row.secret
      ? { ...row, local: mask(row.local), remote: row.remote === '' ? '' : mask(row.remote) }
      : row
  )
}

/** `google: client id` — for the message that says why a provider was left out. */
export function describeProblems(problems: DesiredAuth['problems']): string {
  return problems.map((p) => `${p.provider}.${p.field}`).join(', ')
}
