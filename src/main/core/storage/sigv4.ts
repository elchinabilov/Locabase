/**
 * AWS Signature V4 — enough of it to talk to an S3-compatible bucket.
 *
 * Cloudflare R2 speaks the S3 API, and the S3 SDK is ~4 MB of dependency for the
 * five requests this app makes (PUT, GET, HEAD, DELETE, list). The signing
 * algorithm itself is a hundred lines of hashing, so it lives here instead.
 *
 * This module is pure: it takes a request description and returns the headers to
 * send. No sockets, no clock of its own — `now` is an argument, so the result is
 * reproducible in a test.
 */
import { createHash, createHmac } from 'node:crypto'

export interface SignInput {
  method: string
  /** The full URL, query string included. */
  url: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  /** Headers to sign. `host` is filled in from the URL when missing. */
  headers: Record<string, string>
  /** Hex sha256 of the body, or `UNSIGNED-PAYLOAD` for a streamed one. */
  payloadHash: string
  now: Date
}

export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'
export const EMPTY_SHA256 = createHash('sha256').update('').digest('hex')

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac('sha256', key).update(data).digest()

/**
 * RFC 3986 encoding. `encodeURIComponent` leaves `!'()*` alone and S3 expects
 * them percent-encoded; `/` stays literal inside a path.
 */
export function uriEncode(value: string, keepSlash = false): string {
  let out = ''
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (keepSlash && ch === '/')) {
      out += ch
      continue
    }
    for (const byte of Buffer.from(ch, 'utf8')) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

/** `20240131T090501Z` and its date half — the two stamps SigV4 asks for. */
export function stamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

/**
 * The canonical request — the exact bytes both sides hash. Exported because it
 * is where signing goes wrong, and a mismatch here is invisible in a 403.
 */
export function canonicalRequest(input: SignInput, amzDate: string): {
  text: string
  signedHeaders: string
  headers: Record<string, string>
} {
  const url = new URL(input.url)

  const headers: Record<string, string> = { ...input.headers }
  headers['host'] ??= url.host
  headers['x-amz-date'] = amzDate
  headers['x-amz-content-sha256'] = input.payloadHash

  const normalized = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase().trim(), v.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const canonicalHeaders = normalized.map(([k, v]) => `${k}:${v}\n`).join('')
  const signedHeaders = normalized.map(([k]) => k).join(';')

  // The path is already percent-encoded in the URL; decode once so we don't
  // double-encode a key that contains a space or a `+`.
  const path = decodeURIComponent(url.pathname)
  const canonicalUri = path === '' ? '/' : uriEncode(path, true)

  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const text = [
    input.method.toUpperCase(),
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash
  ].join('\n')

  return { text, signedHeaders, headers }
}

/** The `aws4_request` signing key — derived per day, per region, per service. */
export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, 'aws4_request')
}

/** The headers to put on the wire, `authorization` included. */
export function signRequest(input: SignInput): Record<string, string> {
  const { amzDate, dateStamp } = stamps(input.now)
  const canonical = canonicalRequest(input, amzDate)
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonical.text)
  ].join('\n')
  const signature = createHmac(
    'sha256',
    signingKey(input.secretAccessKey, dateStamp, input.region, input.service)
  )
    .update(stringToSign)
    .digest('hex')

  return {
    ...canonical.headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${canonical.signedHeaders}, Signature=${signature}`
  }
}
