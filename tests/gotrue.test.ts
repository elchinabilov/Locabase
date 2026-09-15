import { describe, expect, it } from 'vitest'
import {
  authDirty,
  buildAuthDiff,
  desiredAuthVars,
  gotrueVarName,
  type LocalProvider
} from '../src/shared/gotrue.js'

const provider = (over: Partial<LocalProvider> = {}): LocalProvider => ({
  id: 'google',
  enabled: true,
  fields: { client_id: 'cid.apps.googleusercontent.com', secret: 'shh' },
  ...over
})

const API = 'https://api.example.com'

/** The vars as a plain map — the order is an implementation detail. */
const asMap = (providers: LocalProvider[], apiUrl = API): Record<string, string> =>
  Object.fromEntries(desiredAuthVars(providers, apiUrl).vars.map((v) => [v.name, v.value]))

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
    const vars = desiredAuthVars([provider()], API).vars
    expect(vars.find((v) => v.name.endsWith('_SECRET'))?.secret).toBe(true)
    expect(vars.find((v) => v.name.endsWith('_CLIENT_ID'))?.secret).toBe(false)
  })

  it('writes only the off switch for a disabled provider', () => {
    const map = asMap([provider({ enabled: false })])
    expect(map['GOTRUE_EXTERNAL_GOOGLE_ENABLED']).toBe('false')
    expect(map['GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID']).toBeUndefined()
  })

  it('reports an enabled provider with no credentials instead of writing half of it', () => {
    const { vars, problems } = desiredAuthVars([provider({ fields: { client_id: '' } })], API)
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
    const map = asMap([provider()], '   ')
    expect(map['API_EXTERNAL_URL']).toBeUndefined()
    expect(map['GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI']).toBeUndefined()
  })
})

describe('buildAuthDiff', () => {
  const desired = desiredAuthVars([provider()], API).vars

  it('calls a variable the remote has never seen local-only', () => {
    const rows = buildAuthDiff(desired, new Map())
    expect(rows.find((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')?.where).toBe('local-only')
    expect(authDirty(rows)).toBe(true)
  })

  it('calls a differing value changed, and shows both sides', () => {
    const rows = buildAuthDiff(desired, new Map([['GOTRUE_EXTERNAL_GOOGLE_ENABLED', 'false']]))
    const row = rows.find((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')!
    expect(row.where).toBe('changed')
    expect(row.remote).toBe('false')
    expect(row.local).toBe('true')
  })

  it('is clean when the remote already agrees', () => {
    const remote = new Map(desired.map((v) => [v.name, v.value]))
    const rows = buildAuthDiff(desired, remote)
    expect(rows.every((r) => r.where === 'both')).toBe(true)
    expect(authDirty(rows)).toBe(false)
  })

  it('does not ask to turn off a provider the remote never turned on', () => {
    const off = desiredAuthVars([provider({ enabled: false })], API).vars
    const rows = buildAuthDiff(off, new Map())
    expect(rows.some((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')).toBe(false)
  })

  it('does ask when the remote has it on and the local file has it off', () => {
    const off = desiredAuthVars([provider({ enabled: false })], API).vars
    const rows = buildAuthDiff(off, new Map([['GOTRUE_EXTERNAL_GOOGLE_ENABLED', 'true']]))
    const row = rows.find((r) => r.name === 'GOTRUE_EXTERNAL_GOOGLE_ENABLED')!
    expect(row.where).toBe('changed')
    expect(row.local).toBe('false')
  })
})
