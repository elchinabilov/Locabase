/**
 * The five S3 calls this app needs, over `node:https` and the SigV4 signer.
 *
 * Uploads are **streamed** from disk with `x-amz-content-sha256: UNSIGNED-PAYLOAD`
 * — a database dump can be gigabytes, and hashing it up front would mean reading
 * the whole file twice (and holding it in memory to do so). The transport is
 * TLS, which is what the payload hash would otherwise be protecting.
 */
import { createReadStream, createWriteStream, rmSync, statSync } from 'node:fs'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import type { StorageObject } from '@shared/types.js'
import { signRequest, uriEncode, EMPTY_SHA256, UNSIGNED_PAYLOAD } from './sigv4.js'

export interface S3Target {
  /** `https://<account>.r2.cloudflarestorage.com` — no trailing slash */
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly code: string | null = null
  ) {
    super(message)
  }
}

const DEFAULT_TIMEOUT = 15 * 60 * 1000

/** `bucket/key` in path style — the form R2's S3 endpoint documents. */
function urlFor(target: S3Target, key: string, query: Record<string, string> = {}): string {
  const path = key ? `/${target.bucket}/${uriEncode(key, true)}` : `/${target.bucket}`
  const url = new URL(target.endpoint + path)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return url.toString()
}

/** `<Message>Access Denied</Message>` → the message; the raw body otherwise. */
function errorFrom(status: number, body: string): StorageError {
  const message = /<Message>([^<]*)<\/Message>/.exec(body)?.[1]
  const code = /<Code>([^<]*)<\/Code>/.exec(body)?.[1] ?? null
  return new StorageError(message ?? body.trim().slice(0, 300) ?? `HTTP ${status}`, status, code)
}

interface RawResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function send(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: { file: string; bytes: number } | Buffer | null,
  timeoutMs: number
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const opts: RequestOptions = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      headers
    }
    const req = httpsRequest(opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8')
        })
      )
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy(new StorageError(`the request timed out after ${Math.round(timeoutMs / 1000)}s`))
    })
    req.on('error', (err) => reject(err))

    if (body === null) {
      req.end()
    } else if (Buffer.isBuffer(body)) {
      req.end(body)
    } else {
      const stream = createReadStream(body.file)
      stream.on('error', (err) => {
        req.destroy(err)
        reject(err)
      })
      stream.pipe(req)
    }
  })
}

async function call(
  target: S3Target,
  method: string,
  key: string,
  opts: {
    query?: Record<string, string>
    body?: { file: string; bytes: number } | Buffer | null
    headers?: Record<string, string>
    timeoutMs?: number
  } = {}
): Promise<RawResponse> {
  const url = urlFor(target, key, opts.query)
  const body = opts.body ?? null
  const payloadHash = body === null ? EMPTY_SHA256 : UNSIGNED_PAYLOAD

  const headers: Record<string, string> = { ...opts.headers }
  if (body !== null) {
    headers['content-length'] = String(Buffer.isBuffer(body) ? body.length : body.bytes)
  }

  const signed = signRequest({
    method,
    url,
    region: target.region || 'auto',
    service: 's3',
    accessKeyId: target.accessKeyId,
    secretAccessKey: target.secretAccessKey,
    headers,
    payloadHash,
    now: new Date()
  })

  const res = await send(url, method, signed, body, opts.timeoutMs ?? DEFAULT_TIMEOUT)
  if (res.status < 200 || res.status >= 300) throw errorFrom(res.status, res.body)
  return res
}

/**
 * Does the bucket exist and do the credentials reach it? A one-key listing
 * rather than a HEAD: R2 answers HEAD on a bucket even for a key that cannot
 * read it, and "connected" has to mean the credentials actually work.
 */
export async function checkBucket(target: S3Target): Promise<void> {
  await call(target, 'GET', '', { query: { 'list-type': '2', 'max-keys': '1' }, timeoutMs: 30_000 })
}

/** Stream a local file into the bucket. */
export async function putFile(
  target: S3Target,
  key: string,
  file: string,
  contentType = 'application/octet-stream'
): Promise<{ bytes: number }> {
  const bytes = statSync(file).size
  await call(target, 'PUT', key, {
    body: { file, bytes },
    headers: { 'content-type': contentType }
  })
  return { bytes }
}

/**
 * Download an object into a local file, streamed.
 *
 * Written by hand rather than through `call()` because the response body must go
 * to disk, not into a string — a restore source is exactly as big as the dump was.
 */
export function getFile(target: S3Target, key: string, dest: string): Promise<{ bytes: number }> {
  const url = urlFor(target, key)
  const headers = signRequest({
    method: 'GET',
    url,
    region: target.region || 'auto',
    service: 's3',
    accessKeyId: target.accessKeyId,
    secretAccessKey: target.secretAccessKey,
    headers: {},
    payloadHash: EMPTY_SHA256,
    now: new Date()
  })

  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = httpsRequest(
      {
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        headers
      },
      (res) => {
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () =>
            reject(errorFrom(res.statusCode ?? 0, Buffer.concat(chunks).toString('utf8')))
          )
          return
        }
        const out = createWriteStream(dest)
        res.pipe(out)
        out.on('error', (err) => {
          rmSync(dest, { force: true })
          reject(err)
        })
        out.on('finish', () => resolve({ bytes: statSync(dest).size }))
      }
    )
    req.setTimeout(DEFAULT_TIMEOUT, () => {
      req.destroy(new StorageError('the download timed out'))
    })
    req.on('error', (err) => {
      rmSync(dest, { force: true })
      reject(err)
    })
    req.end()
  })
}

export async function deleteObject(target: S3Target, key: string): Promise<void> {
  await call(target, 'DELETE', key, { timeoutMs: 60_000 })
}

/**
 * ListObjectsV2. The response is XML; rather than pull in a parser we read the
 * three fields we use out of each `<Contents>` block.
 */
export function parseListXml(xml: string): StorageObject[] {
  const out: StorageObject[] = []
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const block = m[1] ?? ''
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1]
    if (!key) continue
    const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? 0)
    const modified = /<LastModified>([^<]*)<\/LastModified>/.exec(block)?.[1] ?? null
    out.push({ key: decodeXml(key), bytes: size, updatedAt: modified })
  }
  return out
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export async function listObjects(
  target: S3Target,
  prefix = '',
  limit = 200
): Promise<StorageObject[]> {
  const query: Record<string, string> = {
    'list-type': '2',
    'max-keys': String(Math.min(Math.max(limit, 1), 1000))
  }
  if (prefix) query['prefix'] = prefix
  const res = await call(target, 'GET', '', { query, timeoutMs: 60_000 })
  return parseListXml(res.body)
}
