/**
 * Connected object stores — today Cloudflare R2, tomorrow whatever else speaks
 * S3. Connections are **app-wide**, not per project: one bucket usually holds
 * every project's backups, and a second project shouldn't mean re-entering keys.
 *
 * The access key id is ordinary configuration and lives in the store; the secret
 * key goes to `secrets.ts` (safeStorage), same as the remote access tokens.
 */
import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import type {
  StorageConnection,
  StorageConnectionInput,
  StorageObject,
  StorageTestReport
} from '@shared/types.js'
import * as secrets from '../secrets.js'
import { logBus } from '../log.js'
import {
  deleteObject as s3Delete,
  checkBucket,
  getFile,
  listObjects,
  putFile,
  StorageError,
  type S3Target
} from './s3.js'

interface Shape {
  connections: StorageConnection[]
}

/** Lazy for the same reason as the project registry: `app.setName()` runs first. */
let _store: Store<Shape> | null = null
function store(): Store<Shape> {
  _store ??= new Store<Shape>({ name: 'storage', defaults: { connections: [] } })
  return _store
}

export const STREAM = 'storage'

const secretKey = (id: string): string => secrets.keys.storageSecret(id)

export function list(): StorageConnection[] {
  return store()
    .get('connections')
    .map((c) => ({ ...c, hasSecret: secrets.has(secretKey(c.id)) }))
}

export function get(id: string): StorageConnection {
  const found = list().find((c) => c.id === id)
  if (!found) throw new StorageError(`Storage connection not found: ${id}`)
  return found
}

/** `null` rather than a throw — a job may point at a deleted connection. */
export function find(id: string | null): StorageConnection | null {
  if (!id) return null
  return list().find((c) => c.id === id) ?? null
}

function clean(value: string): string {
  return value.trim()
}

/** A bucket prefix is a path, not a key: no leading slash, exactly one trailing one. */
export function normalizePrefix(prefix: string): string {
  const trimmed = clean(prefix).replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed
}

export function upsert(input: StorageConnectionInput, secretAccessKey?: string): StorageConnection {
  const name = clean(input.name)
  const accountId = clean(input.accountId)
  const bucket = clean(input.bucket)
  const accessKeyId = clean(input.accessKeyId)

  if (!name) throw new StorageError('A name is required')
  if (input.provider !== 'r2') throw new StorageError(`Unknown provider: ${String(input.provider)}`)
  if (!/^[a-f0-9]{8,}$/i.test(accountId)) throw new StorageError('The R2 account id looks wrong')
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
    throw new StorageError('Invalid bucket name')
  if (!accessKeyId) throw new StorageError('An access key id is required')

  const existing = input.id
    ? store()
        .get('connections')
        .find((c) => c.id === input.id)
    : undefined
  if (input.id && !existing) throw new StorageError(`Storage connection not found: ${input.id}`)

  const id = existing?.id ?? randomUUID()
  const conn: StorageConnection = {
    id,
    name,
    provider: 'r2',
    accountId,
    bucket,
    region: clean(input.region ?? '') || 'auto',
    prefix: normalizePrefix(input.prefix ?? ''),
    accessKeyId,
    hasSecret: false,
    createdAt: existing?.createdAt ?? new Date().toISOString()
  }

  if (secretAccessKey && secretAccessKey.trim()) {
    secrets.set(secretKey(id), secretAccessKey.trim())
  }
  if (!secrets.has(secretKey(id))) {
    throw new StorageError('A secret access key is required')
  }

  const rest = store()
    .get('connections')
    .filter((c) => c.id !== id)
  store().set('connections', [...rest, conn])
  return { ...conn, hasSecret: true }
}

export function remove(id: string): void {
  secrets.remove(secretKey(id))
  store().set(
    'connections',
    store()
      .get('connections')
      .filter((c) => c.id !== id)
  )
}

/** The signing target — throws when the secret is gone (a re-keyed machine). */
export function targetFor(id: string): S3Target {
  const conn = get(id)
  const secret = secrets.get(secretKey(id))
  if (!secret) {
    throw new StorageError(`${conn.name}: the secret access key is missing — re-enter it`)
  }
  return {
    endpoint: endpointFor(conn),
    bucket: conn.bucket,
    region: conn.region || 'auto',
    accessKeyId: conn.accessKeyId,
    secretAccessKey: secret
  }
}

export function endpointFor(conn: StorageConnection): string {
  return `https://${conn.accountId}.r2.cloudflarestorage.com`
}

/** Join the connection prefix with a key, without doubling or dropping slashes. */
export function keyWithPrefix(conn: StorageConnection, key: string): string {
  const rest = key.replace(/^\/+/, '')
  return conn.prefix ? `${conn.prefix}/${rest}` : rest
}

/** Signs and sends a real list request — the only honest way to check keys. */
export async function test(id: string): Promise<StorageTestReport> {
  const conn = get(id)
  const checks: StorageTestReport['checks'] = [
    { label: 'Endpoint', ok: true, info: endpointFor(conn) }
  ]
  try {
    const target = targetFor(id)
    await checkBucket(target)
    checks.push({ label: 'Bucket', ok: true, info: `${conn.bucket} — reachable` })
    return { ok: true, checks }
  } catch (err) {
    const e = err as StorageError
    checks.push({
      label: 'Bucket',
      ok: false,
      info: e.status ? `${e.message} (HTTP ${e.status})` : e.message
    })
    return { ok: false, checks }
  }
}

export async function objects(id: string, prefix = '', limit = 200): Promise<StorageObject[]> {
  const conn = get(id)
  const full = prefix ? keyWithPrefix(conn, prefix) : conn.prefix
  const rows = await listObjects(targetFor(id), full, limit)
  return rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

/** Upload a local file; returns the full key it landed on. */
export async function upload(
  id: string,
  file: string,
  key: string
): Promise<{ key: string; bytes: number }> {
  const conn = get(id)
  const fullKey = keyWithPrefix(conn, key)
  logBus.push(STREAM, 'info', `${conn.name}: uploading → ${conn.bucket}/${fullKey}`)
  const res = await putFile(targetFor(id), fullKey, file)
  logBus.push(STREAM, 'info', `${conn.name}: uploaded ${fullKey}`)
  return { key: fullKey, bytes: res.bytes }
}

/** Pull an object back down — a restore whose local copy is long gone. */
export async function download(id: string, key: string, dest: string): Promise<{ bytes: number }> {
  const conn = get(id)
  logBus.push(STREAM, 'info', `${conn.name}: downloading ${key}`)
  return getFile(targetFor(id), key, dest)
}

export async function removeObject(id: string, key: string): Promise<void> {
  await s3Delete(targetFor(id), key)
  logBus.push(STREAM, 'info', `${get(id).name}: deleted ${key}`)
}

export { StorageError }
