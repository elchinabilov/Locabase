import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addServiceEnv,
  findAuthService,
  rewriteServiceEnv,
  serviceEnv,
  serviceNames
} from '../src/shared/compose.js'

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

describe('serviceEnv sources', () => {
  const sources = serviceEnv(COOLIFY, 'supabase-auth').sources

  /**
   * The trap this exists for: the container variable and the `.env` key are not
   * the same word. Writing GOTRUE_URI_ALLOW_LIST into `.env` sets a variable the
   * compose line then overwrites with ADDITIONAL_REDIRECT_URLS, and the push
   * reports success while nothing changes.
   */
  it('follows a variable fed from a differently named .env key', () => {
    expect(sources.get('GOTRUE_URI_ALLOW_LIST')).toBe('ADDITIONAL_REDIRECT_URLS')
  })

  it('reads through a `:-default`, including a nested one', () => {
    expect(sources.get('GOTRUE_SITE_URL')).toBe('GOTRUE_SITE_URL')
    expect(sources.get('API_EXTERNAL_URL')).toBe('API_EXTERNAL_URL')
    expect(sources.get('GOTRUE_EXTERNAL_PHONE_ENABLED')).toBe('ENABLE_PHONE_SIGNUP')
  })

  it('is null for a value the compose file writes itself', () => {
    expect(sources.get('GOTRUE_API_PORT')).toBeNull()
    expect(sources.get('GOTRUE_API_HOST')).toBeNull()
  })

  it('treats a bare `- NAME` as pass-through under its own name', () => {
    expect(serviceEnv(COOLIFY, 'supabase-kong').sources.get('SERVICE_URL_SUPABASEKONG_8000')).toBe(
      'SERVICE_URL_SUPABASEKONG_8000'
    )
  })

  /**
   * A reference embedded in a larger value has no single source: setting the
   * referenced key would not make the container variable what we asked for.
   */
  it('is null when the reference is only part of the value', () => {
    const text =
      'services:\n  auth:\n    image: supabase/gotrue\n    environment:\n      - ' +
      "'DB=postgres://u:${PASS}@host/db'\n"
    expect(serviceEnv(text, 'auth').sources.get('DB')).toBeNull()
  })

  it('reads sources in the mapping form too', () => {
    const text =
      'services:\n  auth:\n    image: supabase/gotrue\n    environment:\n      FOO: ${BAR}\n      LIT: 9\n'
    const map = serviceEnv(text, 'auth').sources
    expect(map.get('FOO')).toBe('BAR')
    expect(map.get('LIT')).toBeNull()
  })
})

describe('rewriteServiceEnv', () => {
  const HARDCODED =
    'services:\n' +
    '  supabase-auth:\n' +
    "    image: 'supabase/gotrue:v2.186.0'\n" +
    '    environment:\n' +
    '      - GOTRUE_API_PORT=9999\n' +
    "      - 'API_EXTERNAL_URL=https://api.example.com'\n" +
    "      - 'GOTRUE_JWT_SECRET=${SERVICE_PASSWORD_JWT}'\n"

  /**
   * A value the compose file writes itself is beyond the reach of `.env`. Leaving
   * it alone leaves the user with a variable nothing can change.
   */
  it('re-points a hardcoded value at .env under its own name', () => {
    const out = rewriteServiceEnv(HARDCODED, 'supabase-auth', ['API_EXTERNAL_URL'])
    expect(out).toContain("      - 'API_EXTERNAL_URL=${API_EXTERNAL_URL}'")
    expect(serviceEnv(out, 'supabase-auth').sources.get('API_EXTERNAL_URL')).toBe(
      'API_EXTERNAL_URL'
    )
  })

  /**
   * That key is the stack's own wiring and something else may read it — re-pointing
   * it at a different name would break whatever that is.
   */
  it('leaves a line that already reads from a .env key alone', () => {
    const out = rewriteServiceEnv(HARDCODED, 'supabase-auth', ['GOTRUE_JWT_SECRET'])
    expect(out).toBe(HARDCODED)
  })

  it('touches only the names it was given', () => {
    const out = rewriteServiceEnv(HARDCODED, 'supabase-auth', ['API_EXTERNAL_URL'])
    expect(out).toContain('      - GOTRUE_API_PORT=9999')
    expect(out.split('\n').length).toBe(HARDCODED.split('\n').length)
  })

  it('keeps the mapping form when the file uses it', () => {
    const text =
      'services:\n  auth:\n    image: supabase/gotrue\n    environment:\n      FOO: 9999\n'
    const out = rewriteServiceEnv(text, 'auth', ['FOO'])
    expect(out).toContain('      FOO: ${FOO}')
  })

  it('is a no-op for a name the service does not have', () => {
    expect(rewriteServiceEnv(HARDCODED, 'supabase-auth', ['NOPE'])).toBe(HARDCODED)
  })

  it('composes with addServiceEnv — add what is missing, re-point what is stuck', () => {
    const out = rewriteServiceEnv(
      addServiceEnv(HARDCODED, 'supabase-auth', ['GOTRUE_EXTERNAL_GOOGLE_ENABLED']),
      'supabase-auth',
      ['API_EXTERNAL_URL']
    )
    const sources = serviceEnv(out, 'supabase-auth').sources
    expect(sources.get('GOTRUE_EXTERNAL_GOOGLE_ENABLED')).toBe('GOTRUE_EXTERNAL_GOOGLE_ENABLED')
    expect(sources.get('API_EXTERNAL_URL')).toBe('API_EXTERNAL_URL')
    expect(sources.get('GOTRUE_JWT_SECRET')).toBe('SERVICE_PASSWORD_JWT')
  })
})
