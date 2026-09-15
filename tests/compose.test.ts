import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addServiceEnv, findAuthService, serviceEnv, serviceNames } from '../src/shared/compose.js'

/** The compose a Coolify Supabase service really ships with. */
const COOLIFY = readFileSync(
  join(import.meta.dirname, 'fixtures/coolify-supabase.docker-compose.yml'),
  'utf8'
)

describe('findAuthService', () => {
  it('finds GoTrue by image, not by name', () => {
    expect(findAuthService(COOLIFY)).toBe('supabase-auth')
  })

  it('finds it under any service name', () => {
    const text = 'services:\n  gotrue:\n    image: supabase/gotrue:v2.186.0\n'
    expect(findAuthService(text)).toBe('gotrue')
  })

  it('falls back to an `-auth` service when no image says gotrue', () => {
    const text = 'services:\n  supabase-auth:\n    image: ghcr.io/mirror/auth:1\n'
    expect(findAuthService(text)).toBe('supabase-auth')
  })

  it('is null when there is no auth service at all', () => {
    const text = 'services:\n  db:\n    image: postgres:16\n'
    expect(findAuthService(text)).toBeNull()
  })
})

describe('serviceEnv', () => {
  it('reads the names the auth container is handed', () => {
    const env = serviceEnv(COOLIFY, 'supabase-auth')
    expect(env.found).toBe(true)
    expect(env.names.has('GOTRUE_EXTERNAL_EMAIL_ENABLED')).toBe(true)
    expect(env.names.has('API_EXTERNAL_URL')).toBe(true)
    expect(env.envFile).toBe(false)
  })

  it('is the whole point: the stock stack names nothing about OAuth', () => {
    const env = serviceEnv(COOLIFY, 'supabase-auth')
    expect(env.names.has('GOTRUE_EXTERNAL_GOOGLE_ENABLED')).toBe(false)
    expect(env.names.has('GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID')).toBe(false)
  })

  it('does not leak another service’s variables into this one', () => {
    const env = serviceEnv(COOLIFY, 'supabase-auth')
    expect(env.names.has('PG_META_PORT')).toBe(false)
    expect(env.names.has('POSTGRES_HOST')).toBe(false)
  })

  it('reads the mapping form too', () => {
    const text =
      'services:\n  auth:\n    image: supabase/gotrue\n    environment:\n      FOO: bar\n      BAZ: "1"\n'
    expect([...serviceEnv(text, 'auth').names].sort()).toEqual(['BAZ', 'FOO'])
  })

  it('reports env_file, which hands the whole file over', () => {
    const text = 'services:\n  auth:\n    image: supabase/gotrue\n    env_file:\n      - .env\n'
    expect(serviceEnv(text, 'auth').envFile).toBe(true)
  })

  it('says so when the service is not in the file', () => {
    expect(serviceEnv(COOLIFY, 'nope').found).toBe(false)
  })
})

describe('addServiceEnv', () => {
  const names = ['GOTRUE_EXTERNAL_GOOGLE_ENABLED', 'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID']

  it('adds the missing names to the right service', () => {
    const out = addServiceEnv(COOLIFY, 'supabase-auth', names)
    const env = serviceEnv(out, 'supabase-auth')
    for (const n of names) expect(env.names.has(n)).toBe(true)
  })

  it('copies the indentation and quoting already in the file', () => {
    const out = addServiceEnv(COOLIFY, 'supabase-auth', ['GOTRUE_EXTERNAL_GOOGLE_ENABLED'])
    expect(out).toContain(
      "      - 'GOTRUE_EXTERNAL_GOOGLE_ENABLED=${GOTRUE_EXTERNAL_GOOGLE_ENABLED}'"
    )
  })

  it('touches nothing else — only the new lines are added', () => {
    const out = addServiceEnv(COOLIFY, 'supabase-auth', names)
    const before = COOLIFY.split('\n')
    const after = out.split('\n')
    expect(after.filter((l) => !l.includes('GOOGLE'))).toEqual(before)
    expect(after.length).toBe(before.length + names.length)
  })

  it('leaves the other services alone', () => {
    const out = addServiceEnv(COOLIFY, 'supabase-auth', names)
    expect([...serviceEnv(out, 'supabase-db').names].sort()).toEqual(
      [...serviceEnv(COOLIFY, 'supabase-db').names].sort()
    )
  })

  it('is a no-op for names the service already has', () => {
    expect(addServiceEnv(COOLIFY, 'supabase-auth', ['API_EXTERNAL_URL'])).toBe(COOLIFY)
  })

  it('creates the block when the service has no environment at all', () => {
    const text = 'services:\n  auth:\n    image: supabase/gotrue\n'
    const out = addServiceEnv(text, 'auth', ['GOTRUE_EXTERNAL_GOOGLE_ENABLED'])
    expect(serviceEnv(out, 'auth').names.has('GOTRUE_EXTERNAL_GOOGLE_ENABLED')).toBe(true)
  })

  it('refuses a service the file does not have', () => {
    expect(() => addServiceEnv(COOLIFY, 'nope', names)).toThrow(/no service named/)
  })
})

describe('serviceNames', () => {
  it('lists the services in file order', () => {
    expect(serviceNames(COOLIFY)).toEqual([
      'supabase-kong',
      'supabase-db',
      'supabase-auth',
      'supabase-meta'
    ])
  })

  /**
   * The guard that catches a half-transferred file. Reading the compose over ssh
   * means base64 wrapped at 76 characters, and a line cap that keeps the TAIL
   * drops the head — what decodes then is not a shorter file but a byte-shifted
   * one. It has no `services:` block, and without this check that is
   * indistinguishable from a stack with no auth service in it.
   */
  it('is empty for text that decoded from a truncated transfer', () => {
    const b64 = Buffer.from(COOLIFY, 'utf8').toString('base64')
    const headless = b64.slice(Math.floor(b64.length / 3))
    const decoded = Buffer.from(headless, 'base64').toString('utf8')
    expect(serviceNames(decoded)).toEqual([])
    expect(findAuthService(decoded)).toBeNull()
  })

  it('is empty when there is no services block at all', () => {
    expect(serviceNames('volumes:\n  data: {}\n')).toEqual([])
  })
})
