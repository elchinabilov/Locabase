import { describe, expect, it } from 'vitest'
import {
  allowList,
  authDirty,
  buildAuthDiff,
  desiredAuthVars,
  gotrueVarName,
  type AuthTargets,
  type LocalProvider
} from '../src/shared/gotrue.js'

const provider = (over: Partial<LocalProvider> = {}): LocalProvider => ({
  id: 'google',
  enabled: true,
  fields: { client_id: 'cid.apps.googleusercontent.com', secret: 'shh' },
  ...over
})

const API = 'https://api.example.com'
const APP = 'https://app.example.com'

const targets = (over: Partial<AuthTargets> = {}): AuthTargets => ({
  apiUrl: API,
  appUrl: APP,
  currentAllowList: '',
  ...over
})

/** The vars as a plain map — the order is an implementation detail. */
const asMap = (
  providers: LocalProvider[],
  over: Partial<AuthTargets> = {}
): Record<string, string> =>
  Object.fromEntries(desiredAuthVars(providers, targets(over)).vars.map((v) => [v.name, v.value]))

describe('gotrueVarName', () => {
  it('spells the name GoTrue reads', () => {
    expect(gotrueVarName('google', 'enabled')).toBe('GOTRUE_EXTERNAL_GOOGLE_ENABLED')
    expect(gotrueVarName('google', 'client_id')).toBe('GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID')
  })

  it('keeps the underscore in a two-word provider', () => {
    expect(gotrueVarName('linkedin_oidc', 'secret')).toBe('GOTRUE_EXTERNAL_LINKEDIN_OIDC_SECRET')
  })

  it('is null for a field GoTrue has no key for', () => {
    expect(gotrueVarName('twitter', 'email_optional')).toBeNull()
  })
})

describe('desiredAuthVars', () => {
  it('enables the provider — the variable whose absence says «provider is not enabled»', () => {
    expect(asMap([provider()])['GOTRUE_EXTERNAL_GOOGLE_ENABLED']).toBe('true')
  })

  it('carries the client id and secret across', () => {
    const map = asMap([provider()])
    expect(map['GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID']).toBe('cid.apps.googleusercontent.com')
    expect(map['GOTRUE_EXTERNAL_GOOGLE_SECRET']).toBe('shh')
  })

  it('derives the callback from the remote API url, never from the local file', () => {
    const local = provider({
      fields: {
        client_id: 'c',
        secret: 's',
        redirect_uri: 'http://127.0.0.1:54321/auth/v1/callback'
      }
    })
    expect(asMap([local])['GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI']).toBe(
      'https://api.example.com/auth/v1/callback'
    )
  })

  it('sets API_EXTERNAL_URL, without which no provider round trip can come back', () => {
    expect(asMap([provider()])['API_EXTERNAL_URL']).toBe(API)
  })

  it('marks the secret so it can be masked', () => {
    const vars = desiredAuthVars([provider()], targets()).vars
    expect(vars.find((v) => v.name.endsWith('_SECRET'))?.secret).toBe(true)
    expect(vars.find((v) => v.name.endsWith('_CLIENT_ID'))?.secret).toBe(false)
  })

  it('writes only the off switch for a disabled provider', () => {
    const map = asMap([provider({ enabled: false })])
    expect(map['GOTRUE_EXTERNAL_GOOGLE_ENABLED']).toBe('false')
    expect(map['GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID']).toBeUndefined()
  })

  it('reports an enabled provider with no credentials instead of writing half of it', () => {
    const { vars, problems } = desiredAuthVars([provider({ fields: { client_id: '' } })], targets())
    expect(problems).toEqual([
      { provider: 'google', field: 'client_id' },
      { provider: 'google', field: 'secret' }
    ])
    expect(vars.some((v) => v.name === 'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID')).toBe(false)
    // the enable flag still goes, so the diff shows what the file asks for
    expect(vars.some((v) => v.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')).toBe(true)
  })

  it('passes `url` through for the self-hosted providers', () => {
    const kc = provider({
      id: 'keycloak',
      fields: { client_id: 'c', secret: 's', url: 'https://kc.example.com/realms/main' }
    })
    expect(asMap([kc])['GOTRUE_EXTERNAL_KEYCLOAK_URL']).toBe('https://kc.example.com/realms/main')
  })

  it('omits a field the local file does not set', () => {
    expect(asMap([provider()])['GOTRUE_EXTERNAL_GOOGLE_SKIP_NONCE_CHECK']).toBeUndefined()
  })

  it('writes no urls when the environment has no API url yet', () => {
    const map = asMap([provider()], { apiUrl: '   ' })
    expect(map['API_EXTERNAL_URL']).toBeUndefined()
    expect(map['GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI']).toBeUndefined()
  })
})

describe('buildAuthDiff', () => {
  const desired = desiredAuthVars([provider()], targets()).vars
  /** The remote's answer, however the caller got hold of it. */
  const from =
    (m: Map<string, string>) =>
    (name: string): string | undefined =>
      m.get(name)

  it('calls a variable the remote has never seen local-only', () => {
    const rows = buildAuthDiff(desired, from(new Map()))
    expect(rows.find((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')?.where).toBe('local-only')
    expect(authDirty(rows)).toBe(true)
  })

  it('calls a differing value changed, and shows both sides', () => {
    const rows = buildAuthDiff(
      desired,
      from(new Map([['GOTRUE_EXTERNAL_GOOGLE_ENABLED', 'false']]))
    )
    const row = rows.find((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')!
    expect(row.where).toBe('changed')
    expect(row.remote).toBe('false')
    expect(row.local).toBe('true')
  })

  it('is clean when the remote already agrees', () => {
    const remote = new Map(desired.map((v) => [v.name, v.value]))
    const rows = buildAuthDiff(desired, from(remote))
    expect(rows.every((r) => r.where === 'both')).toBe(true)
    expect(authDirty(rows)).toBe(false)
  })

  it('does not ask to turn off a provider the remote never turned on', () => {
    const off = desiredAuthVars([provider({ enabled: false })], targets()).vars
    const rows = buildAuthDiff(off, from(new Map()))
    expect(rows.some((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')).toBe(false)
  })

  it('does ask when the remote has it on and the local file has it off', () => {
    const off = desiredAuthVars([provider({ enabled: false })], targets()).vars
    const rows = buildAuthDiff(off, from(new Map([['GOTRUE_EXTERNAL_GOOGLE_ENABLED', 'true']])))
    const row = rows.find((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')!
    expect(row.where).toBe('changed')
    expect(row.local).toBe('false')
  })
})

describe('allowList', () => {
  it('adds the app URL and its glob form', () => {
    expect(allowList('https://app.example.com', '')).toBe(
      'https://app.example.com,https://app.example.com/**'
    )
  })

  /**
   * The list is the stack's open-redirect surface, and a self-hosted one carries
   * entries this app never hears about. Replacing it would be a security change
   * dressed as a config sync.
   */
  it('keeps what the remote already has, in place and in order', () => {
    const current = 'https://staging.example.com/**,myapp://login'
    expect(allowList('https://app.example.com', current)).toBe(
      'https://staging.example.com/**,myapp://login,https://app.example.com,https://app.example.com/**'
    )
  })

  it('adds nothing twice', () => {
    const current = 'https://app.example.com/**'
    expect(allowList('https://app.example.com', current)).toBe(
      'https://app.example.com/**,https://app.example.com'
    )
  })

  it('is idempotent — a second run changes nothing', () => {
    const once = allowList('https://app.example.com', 'https://staging.example.com/**')
    expect(allowList('https://app.example.com', once)).toBe(once)
  })

  it('handles a mobile scheme without mangling it into `myapp:`', () => {
    expect(allowList('myapp://', '')).toBe('myapp://,myapp://**')
    expect(allowList('myapp://login', '')).toBe('myapp://login,myapp://login/**')
  })

  it('tolerates a trailing slash and stray spacing in the remote list', () => {
    expect(allowList('https://app.example.com/', ' a , , b ')).toBe(
      'a,b,https://app.example.com,https://app.example.com/**'
    )
  })

  it('leaves the remote list alone when there is no app URL', () => {
    expect(allowList('  ', 'https://kept.example.com/**')).toBe('https://kept.example.com/**')
  })
})

describe('site URL and allow list as desired vars', () => {
  it('sets GOTRUE_SITE_URL from the app URL — the variable that decides where login lands', () => {
    expect(asMap([provider()])['GOTRUE_SITE_URL']).toBe(APP)
  })

  it('merges the allow list rather than replacing it', () => {
    const map = asMap([provider()], { currentAllowList: 'https://old.example.com/**' })
    expect(map['GOTRUE_URI_ALLOW_LIST']).toBe(
      'https://old.example.com/**,https://app.example.com,https://app.example.com/**'
    )
  })

  it('accepts an app scheme as the app URL', () => {
    const map = asMap([provider()], { appUrl: 'myapp://login' })
    expect(map['GOTRUE_SITE_URL']).toBe('myapp://login')
    expect(map['GOTRUE_URI_ALLOW_LIST']).toBe('myapp://login,myapp://login/**')
  })

  it('derives neither when the environment has no app URL', () => {
    const map = asMap([provider()], { appUrl: '' })
    expect(map['GOTRUE_SITE_URL']).toBeUndefined()
    expect(map['GOTRUE_URI_ALLOW_LIST']).toBeUndefined()
  })
})

describe('buildAuthDiff with a remapped .env key', () => {
  const desired = desiredAuthVars([provider()], targets()).vars
  const envKeyOf = (name: string): string =>
    name === 'GOTRUE_URI_ALLOW_LIST' ? 'ADDITIONAL_REDIRECT_URLS' : name
  const fromEnv = (m: Map<string, string>) => (name: string) => m.get(envKeyOf(name))

  it('compares against the key the compose file actually reads', () => {
    const remote = new Map([['ADDITIONAL_REDIRECT_URLS', 'https://app.example.com']])
    const row = buildAuthDiff(desired, fromEnv(remote), envKeyOf).find(
      (r) => r.name === 'GOTRUE_URI_ALLOW_LIST'
    )!
    expect(row.envKey).toBe('ADDITIONAL_REDIRECT_URLS')
    expect(row.mapped).toBe(true)
    expect(row.remote).toBe('https://app.example.com')
    expect(row.where).toBe('changed')
  })

  it('would have called it local-only under the GoTrue name — the bug this prevents', () => {
    const remote = new Map([['ADDITIONAL_REDIRECT_URLS', 'https://app.example.com']])
    const naive = buildAuthDiff(desired, (n) => remote.get(n)).find(
      (r) => r.name === 'GOTRUE_URI_ALLOW_LIST'
    )!
    expect(naive.where).toBe('local-only')
    expect(naive.mapped).toBe(false)
  })
})
