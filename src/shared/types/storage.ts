/**
 * Object-storage connections that backups are uploaded to.
 */

/**
 * A connected object store. Only Cloudflare R2 for now — the shape is already
 * S3-flavoured, so another S3-compatible provider is a new id plus an endpoint,
 * not a new model.
 */
export type StorageProviderId = 'r2'

export interface StorageConnection {
  id: string
  name: string
  provider: StorageProviderId
  /** R2 account id — the endpoint is derived from it */
  accountId: string
  bucket: string
  /** R2 always answers on `auto`; kept for the next provider */
  region: string
  /** Key prefix inside the bucket, e.g. `locabase/backups`. May be empty. */
  prefix: string
  accessKeyId: string
  /** The secret key lives in safeStorage; only its presence is stored here. */
  hasSecret: boolean
  createdAt: string
}

/** What the connection form sends; `secretAccessKey` never comes back out. */
export interface StorageConnectionInput {
  id?: string
  name: string
  provider: StorageProviderId
  accountId: string
  bucket: string
  region?: string
  prefix?: string
  accessKeyId: string
  /** Omitted on edit = keep the stored secret. */
  secretAccessKey?: string
}

export interface StorageTestReport {
  ok: boolean
  checks: Array<{ label: string; ok: boolean; info: string }>
}

export interface StorageObject {
  key: string
  bytes: number
  updatedAt: string | null
}
