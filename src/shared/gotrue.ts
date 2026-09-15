/**
 * `config.toml` `[auth.external.*]` → the `GOTRUE_*` variables a self-hosted
 * GoTrue actually reads.
 *
 * The local CLI and a self-hosted stack describe the same provider with two
 * different vocabularies. The CLI reads `[auth.external.google] enabled = true`
 * from `config.toml`; GoTrue has no config file at all and knows only what its
 * process environment says — `GOTRUE_EXTERNAL_GOOGLE_ENABLED`. Nothing carries
 * the first form to the second, which is why a provider that works locally
 * answers `provider is not enabled` on the server.
 *
 * Pure on purpose — no fs, no ssh. `main/core/authconfig.ts` supplies the local
 * side and masks what goes to the screen.
 */
import { callbackUrl } from './providers.js'

/**
 * `config.toml` field → the suffix GoTrue spells it with.
 *
 * `email_optional` is absent deliberately: it is a CLI-side setting with no
 * GoTrue counterpart, so pushing it would write a key nothing reads.
 */
const FIELD_SUFFIX: Record<string, string> = {
  client_id: 'CLIENT_ID',
  secret: 'SECRET',
  redirect_uri: 'REDIRECT_URI',
  url: 'URL',
  skip_nonce_check: 'SKIP_NONCE_CHECK'
}

/** The fields whose value must never appear in a log or on the screen. */
const SECRET_FIELDS = new Set(['secret'])

/** `google` + `client_id` → `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`; null when GoTrue has no such key. */
export function gotrueVarName(providerId: string, field: string): string | null {
  const suffix = field === 'enabled' ? 'ENABLED' : FIELD_SUFFIX[field]
  if (suffix === undefined) return null
  return `GOTRUE_EXTERNAL_${providerId.toUpperCase()}_${suffix}`
}

/** One provider as `config.toml` describes it, with `env()` references already resolved. */
export interface LocalProvider {
  id: string
  enabled: boolean
  /** `client_id`, `secret`, … — only the fields the file actually sets */
  fields: Record<string, string>
}

export interface DesiredVar {
  name: string
  value: string
  /** never logged, masked on screen */
  secret: boolean
  /** the provider it belongs to; `''` for a stack-level variable */
  provider: string
}

export interface DesiredAuth {
  vars: DesiredVar[]
  /**
   * Local configuration that cannot be pushed as it stands — an enabled provider
   * with no client id, say. Reported rather than written: half a provider on the
   * server fails in a way that looks like a network problem.
   */
  problems: Array<{ provider: string; field: string }>
}

/**
 * What the remote `.env` must hold for the remote to answer the way the local
 * stack does.
 *
 * `redirect_uri` is NEVER taken from `config.toml` — the local file points at
 * `127.0.0.1`, and pushing that is how an OAuth round trip ends up sending the
 * user back to their own machine. It is derived from the environment's own API
 * URL, which is also the value pasted into the provider's console.
 *
 * A disabled provider contributes only `…_ENABLED=false`. Writing its empty
 * client id and secret as well would fill the file with keys that mean nothing.
 */
export function desiredAuthVars(providers: LocalProvider[], apiUrl: string): DesiredAuth {
  const base = apiUrl.trim().replace(/\/+$/, '')
  const vars: DesiredVar[] = []
  const problems: DesiredAuth['problems'] = []

  if (base !== '') {
    // Without this GoTrue builds the callback from the internal Kong address and
    // every provider round trip dies at the redirect, enabled or not.
    vars.push({ name: 'API_EXTERNAL_URL', value: base, secret: false, provider: '' })
  }

  for (const p of providers) {
    const enabledVar = gotrueVarName(p.id, 'enabled')
    if (enabledVar === null) continue
    vars.push({
      name: enabledVar,
      value: p.enabled ? 'true' : 'false',
      secret: false,
      provider: p.id
    })
    if (!p.enabled) continue

    for (const field of ['client_id', 'secret'] as const) {
      const value = (p.fields[field] ?? '').trim()
      if (value === '') {
        problems.push({ provider: p.id, field })
        continue
      }
      vars.push({
        name: gotrueVarName(p.id, field)!,
        value,
        secret: SECRET_FIELDS.has(field),
        provider: p.id
      })
    }

    if (base !== '') {
      vars.push({
        name: gotrueVarName(p.id, 'redirect_uri')!,
        value: callbackUrl(base),
        secret: false,
        provider: p.id
      })
    }

    // The rest only when the file sets them — `url` for the self-hosted providers
    // (Keycloak, GitLab, Azure), `skip_nonce_check` for the native-SDK flows.
    for (const field of ['url', 'skip_nonce_check'] as const) {
      const raw = p.fields[field]
      if (raw === undefined || raw.trim() === '') continue
      vars.push({
        name: gotrueVarName(p.id, field)!,
        value: raw.trim(),
        secret: false,
        provider: p.id
      })
    }
  }

  return { vars, problems }
}

export type AuthVarWhere = 'local-only' | 'changed' | 'both'

export interface AuthVarDiff {
  name: string
  provider: string
  /** the value the local configuration asks for */
  local: string
  /** what the remote `.env` holds today; `''` when it holds nothing */
  remote: string
  secret: boolean
  where: AuthVarWhere
}

/**
 * One row per desired variable, minus the ones there is nothing to do about.
 *
 * `…_ENABLED=false` for a provider the remote has never heard of is dropped:
 * every provider is off by default, so writing twenty `false` lines would turn a
 * clean report into a wall of work that changes nothing.
 */
export function buildAuthDiff(desired: DesiredVar[], remote: Map<string, string>): AuthVarDiff[] {
  const rows: AuthVarDiff[] = []
  for (const v of desired) {
    const current = remote.get(v.name)
    if (current === undefined && v.value === 'false') continue
    rows.push({
      name: v.name,
      provider: v.provider,
      local: v.value,
      remote: current ?? '',
      secret: v.secret,
      where: current === undefined ? 'local-only' : current === v.value ? 'both' : 'changed'
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export function authDirty(rows: AuthVarDiff[]): boolean {
  return rows.some((r) => r.where !== 'both')
}
