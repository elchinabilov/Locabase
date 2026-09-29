/**
 * Comparing local `.env` entries against what a remote reports, under the
 * environment's name mapping.
 *
 * Pure on purpose — no fs, no ssh, no adapter — so the rules below can be tested
 * directly. `sync.ts` only supplies the two sides.
 */
import { createHash } from 'node:crypto'
import type { RemoteSecret, SecretDiff, SecretMap } from '@shared/types/index.js'
import { singleLineValue } from './envfile.js'

/** The name `localKey` has on the remote. Unmapped keys are pushed 1:1. */
export function remoteNameOf(map: SecretMap | undefined, localKey: string): string {
  const mapped = map?.[localKey]
  return mapped !== undefined && mapped !== '' ? mapped : localKey
}

/**
 * Whether the remote value is the local one.
 *
 * `null` means "cannot tell": a managed project hands back a fingerprint rather
 * than the value, and we do not know for certain how it was derived. Both forms
 * seen in the wild are accepted — the value itself, and its sha256 — so a match
 * is trustworthy while a mismatch is not, which is why an unreadable remote is
 * reported as `null` and never as `false`.
 */
export function valueMatches(remote: RemoteSecret, local: string): boolean | null {
  if (remote.value !== null) {
    // multi-line JSON is stored flattened on a self-hosted `.env` — see `setSecrets`
    return remote.value === local || remote.value === singleLineValue(local)
  }
  if (remote.digest === null || remote.digest === '') return null
  if (remote.digest === local) return true
  if (remote.digest.toLowerCase() === createHash('sha256').update(local).digest('hex')) return true
  return null
}

/**
 * One row per local key, then every remote key no local key claims.
 *
 * A remote-only row is NOT drift on a self-hosted stack — that `.env` carries the
 * whole Docker configuration (`POSTGRES_PORT`, `KONG_*`, …) and will always hold
 * a hundred keys the project does not know about. `dirty` below reflects that.
 */
export function buildSecretDiff(
  local: Map<string, string>,
  remote: RemoteSecret[],
  map: SecretMap | undefined
): SecretDiff[] {
  const byName = new Map(remote.map((r) => [r.name, r]))
  const claimed = new Set<string>()
  const rows: SecretDiff[] = []

  for (const [key, value] of local) {
    const remoteKey = remoteNameOf(map, key)
    claimed.add(remoteKey)
    const hit = byName.get(remoteKey)
    rows.push({
      key,
      remoteKey,
      mapped: remoteKey !== key,
      where: !hit ? 'local-only' : valueMatches(hit, value) === false ? 'changed' : 'both'
    })
  }

  for (const r of remote) {
    if (claimed.has(r.name)) continue
    rows.push({ key: r.name, remoteKey: r.name, mapped: false, where: 'remote-only' })
  }

  return rows.sort((a, b) => a.key.localeCompare(b.key))
}

/** Only what the user can act on from the local side counts as drift. */
export function secretsDirty(rows: SecretDiff[]): boolean {
  return rows.some((r) => r.where === 'local-only' || r.where === 'changed')
}
