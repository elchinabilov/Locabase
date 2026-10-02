import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoolifyApi, normalizeBaseUrl } from '../src/main/core/remote/coolify-api.js'

interface Call {
  url: string
  method: string
  body: unknown
  auth: string | null
}

function stubFetch(responses: unknown[]): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        auth: new Headers(init.headers).get('Authorization')
      })
      const next = responses.shift()
      if (next instanceof Response) return next
      return new Response(next === undefined ? '' : JSON.stringify(next), { status: 200 })
    })
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('normalizeBaseUrl', () => {
  it('strips a trailing slash and an /api/v1 suffix', () => {
    expect(normalizeBaseUrl('https://c.example.com/')).toBe('https://c.example.com')
    expect(normalizeBaseUrl('https://c.example.com/api/v1/')).toBe('https://c.example.com')
  })

  it('rejects something that is not a URL', () => {
    expect(() => normalizeBaseUrl('coolify.example.com')).toThrow(/Invalid Coolify URL/)
  })
})

describe('CoolifyApi', () => {
  const api = (): CoolifyApi => new CoolifyApi('https://c.example.com', 'tok', 'svc123')

  it('lists envs, skipping preview copies and keeping hidden values as null', async () => {
    const calls = stubFetch([
      [
        { uuid: 'a', key: 'STRIPE_KEY', value: 'sk_1', is_preview: false },
        { uuid: 'b', key: 'STRIPE_KEY', value: 'preview', is_preview: true },
        { uuid: 'c', key: 'HIDDEN', is_preview: false }
      ]
    ])
    expect(await api().listEnvs()).toEqual([
      { uuid: 'a', key: 'STRIPE_KEY', value: 'sk_1' },
      { uuid: 'c', key: 'HIDDEN', value: null }
    ])
    expect(calls[0]).toMatchObject({
      url: 'https://c.example.com/api/v1/services/svc123/envs',
      method: 'GET',
      auth: 'Bearer tok'
    })
  })

  it('upserts through envs/bulk as literal values', async () => {
    const calls = stubFetch([[]])
    await api().upsertEnvs({ A: '1', B: '{"x":1}' })
    expect(calls[0]).toMatchObject({
      url: 'https://c.example.com/api/v1/services/svc123/envs/bulk',
      method: 'PATCH',
      body: {
        data: [
          { key: 'A', value: '1', is_literal: true, is_multiline: false },
          { key: 'B', value: '{"x":1}', is_literal: true, is_multiline: false }
        ]
      }
    })
  })

  it('sends nothing for an empty upsert', async () => {
    const calls = stubFetch([])
    await api().upsertEnvs({})
    expect(calls).toHaveLength(0)
  })

  it('deletes by env uuid', async () => {
    const calls = stubFetch([{ message: 'Environment variable deleted.' }])
    await api().deleteEnv('env-uuid')
    expect(calls[0]).toMatchObject({
      url: 'https://c.example.com/api/v1/services/svc123/envs/env-uuid',
      method: 'DELETE'
    })
  })

  it('sends the compose template base64-encoded', async () => {
    const calls = stubFetch([{ uuid: 'svc123' }])
    await api().updateComposeRaw('services:\n  auth: {}\n')
    const body = calls[0]!.body as { docker_compose_raw: string }
    expect(Buffer.from(body.docker_compose_raw, 'base64').toString('utf8')).toBe(
      'services:\n  auth: {}\n'
    )
  })

  it('surfaces the status and body of a failed call', async () => {
    stubFetch([new Response('{"message":"Unauthenticated."}', { status: 401 })])
    await expect(api().listEnvs()).rejects.toThrow(/Coolify API 401.*Unauthenticated/)
  })
})
