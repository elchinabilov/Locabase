import { describe, expect, it } from 'vitest'
import {
  canonicalRequest,
  signRequest,
  signingKey,
  stamps,
  uriEncode
} from '../src/main/core/storage/sigv4.js'
import { parseListXml } from '../src/main/core/storage/s3.js'

const NOW = new Date('2026-01-31T09:05:01.512Z')

const base = {
  method: 'PUT',
  url: 'https://acc123.r2.cloudflarestorage.com/backups/locabase/app-prod.dump',
  region: 'auto',
  service: 's3',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret-key',
  headers: { 'content-type': 'application/octet-stream' },
  payloadHash: 'UNSIGNED-PAYLOAD',
  now: NOW
}

describe('uriEncode', () => {
  it('percent-encodes what encodeURIComponent leaves behind', () => {
    expect(uriEncode("a b!'()*")).toBe('a%20b%21%27%28%29%2A')
  })

  it('keeps unreserved characters', () => {
    expect(uriEncode('Ab9-._~')).toBe('Ab9-._~')
  })

  it('only keeps slashes when asked', () => {
    expect(uriEncode('a/b')).toBe('a%2Fb')
    expect(uriEncode('a/b', true)).toBe('a/b')
  })

  it('encodes non-ASCII per UTF-8 byte', () => {
    expect(uriEncode('ə')).toBe('%C9%99')
  })
})

describe('stamps', () => {
  it('produces the two SigV4 timestamps', () => {
    expect(stamps(NOW)).toEqual({ amzDate: '20260131T090501Z', dateStamp: '20260131' })
  })
})

describe('canonicalRequest', () => {
  it('lays out the six lines S3 expects', () => {
    const { text, signedHeaders } = canonicalRequest(base, '20260131T090501Z')
    expect(text.split('\n').slice(0, 3)).toEqual([
      'PUT',
      '/backups/locabase/app-prod.dump',
      ''
    ])
    expect(signedHeaders).toBe('content-type;host;x-amz-content-sha256;x-amz-date')
    expect(text.endsWith('UNSIGNED-PAYLOAD')).toBe(true)
  })

  it('adds host, date and the payload hash to the headers itself', () => {
    const { headers } = canonicalRequest(base, '20260131T090501Z')
    expect(headers['host']).toBe('acc123.r2.cloudflarestorage.com')
    expect(headers['x-amz-date']).toBe('20260131T090501Z')
    expect(headers['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD')
  })

  it('sorts the query string by key', () => {
    const { text } = canonicalRequest(
      { ...base, method: 'GET', url: 'https://h.example/b?prefix=a%2Fb&list-type=2&max-keys=1' },
      '20260131T090501Z'
    )
    expect(text.split('\n')[2]).toBe('list-type=2&max-keys=1&prefix=a%2Fb')
  })

  it('encodes a key with a space exactly once', () => {
    const { text } = canonicalRequest(
      { ...base, url: 'https://h.example/bucket/my%20dump.sql' },
      '20260131T090501Z'
    )
    expect(text.split('\n')[1]).toBe('/bucket/my%20dump.sql')
  })
})

describe('signingKey', () => {
  it('is deterministic and scoped to date, region and service', () => {
    const a = signingKey('secret', '20260131', 'auto', 's3').toString('hex')
    expect(signingKey('secret', '20260131', 'auto', 's3').toString('hex')).toBe(a)
    expect(signingKey('secret', '20260201', 'auto', 's3').toString('hex')).not.toBe(a)
    expect(signingKey('secret', '20260131', 'us-east-1', 's3').toString('hex')).not.toBe(a)
  })
})

describe('signRequest', () => {
  it('builds an AWS4-HMAC-SHA256 header with the credential scope', () => {
    const auth = signRequest(base)['authorization'] ?? ''
    expect(auth).toContain('AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20260131/auto/s3/aws4_request')
    expect(auth).toContain('SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date')
    expect(/Signature=[0-9a-f]{64}$/.test(auth)).toBe(true)
  })

  it('changes the signature when anything signed changes', () => {
    const first = signRequest(base)['authorization']
    const other = signRequest({ ...base, url: `${base.url}2` })['authorization']
    expect(other).not.toBe(first)
  })
})

describe('parseListXml', () => {
  const XML = `<?xml version="1.0"?>
    <ListBucketResult>
      <Contents>
        <Key>locabase/app &amp; co/db.dump</Key>
        <LastModified>2026-01-30T22:00:00.000Z</LastModified>
        <Size>2048</Size>
      </Contents>
      <Contents>
        <Key>locabase/other.dump</Key>
        <LastModified>2026-01-29T22:00:00.000Z</LastModified>
        <Size>10</Size>
      </Contents>
    </ListBucketResult>`

  it('reads key, size and timestamp out of each entry', () => {
    expect(parseListXml(XML)).toEqual([
      { key: 'locabase/app & co/db.dump', bytes: 2048, updatedAt: '2026-01-30T22:00:00.000Z' },
      { key: 'locabase/other.dump', bytes: 10, updatedAt: '2026-01-29T22:00:00.000Z' }
    ])
  })

  it('returns nothing for an empty listing', () => {
    expect(parseListXml('<ListBucketResult></ListBucketResult>')).toEqual([])
  })
})
