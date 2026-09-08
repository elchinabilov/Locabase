/**
 * Reading a folder file by file: kept in one place so the function diff works
 * the same way over a local tree and over one fetched from a remote.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { RemoteFile, RemoteFileChecksum } from '@shared/types.js'

/** Files larger than this are not shown — diffing a bundle or asset is pointless. */
export const MAX_FILE_BYTES = 512 * 1024

/** Relative file paths, sorted. Dot-prefixed entries are dropped. */
export function walk(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, base))
    else out.push(relative(base, full))
  }
  return out.sort()
}

export function readTree(dir: string): RemoteFile[] {
  return walk(dir).map((path) => {
    const full = join(dir, path)
    if (statSync(full).size > MAX_FILE_BYTES) return { path, content: null, binary: true }
    const buf = readFileSync(full)
    const binary = buf.includes(0)
    return { path, content: binary ? null : buf.toString('utf8'), binary }
  })
}

export function checksums(dir: string): RemoteFileChecksum[] {
  return walk(dir).map((path) => ({
    path,
    md5: createHash('md5').update(readFileSync(join(dir, path))).digest('hex')
  }))
}
