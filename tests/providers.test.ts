import { describe, expect, it } from 'vitest'
import { AUTH_PROVIDERS, callbackUrl, envVarName } from '../src/shared/providers.js'

describe('callbackUrl', () => {
  it('appends the GoTrue callback path', () => {
    expect(callbackUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321/auth/v1/callback')
  })

  it('does not double the slash', () => {
    expect(callbackUrl('https://example.com/')).toBe('https://example.com/auth/v1/callback')
  })

  it('strips several trailing slashes', () => {
    expect(callbackUrl('https://example.com///')).toBe('https://example.com/auth/v1/callback')
  })
})

describe('envVarName', () => {
  it('builds the name the CLI expects', () => {
    expect(envVarName('google', 'secret')).toBe('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET')
  })

  it('upper-cases both halves', () => {
    expect(envVarName('azure', 'client_id')).toBe('SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID')
  })
})

describe('AUTH_PROVIDERS', () => {
  it('has no duplicate ids', () => {
    const ids = AUTH_PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every provider at least the base fields', () => {
    for (const p of AUTH_PROVIDERS) {
      expect(p.fields.length, p.id).toBeGreaterThan(0)
      expect(p.label, p.id).not.toBe('')
    }
  })

  it('uses ids that are safe in a config path and an env var', () => {
    for (const p of AUTH_PROVIDERS) expect(p.id).toMatch(/^[a-z0-9_]+$/)
  })
})
