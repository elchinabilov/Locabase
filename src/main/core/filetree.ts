/**
 * Qovluğun fayl-fayl oxunması: funksiya fərqi həm lokal, həm də uzaqdan
 * gətirilmiş ağac üzərində eyni formada işləsin deyə bir yerdədir.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { RemoteFile, RemoteFileChecksum } from '@shared/types.js'

/** Bundan böyük fayl göstərilmir — bundle/asset diffi mənasızdır. */
export const MAX_FILE_BYTES = 512 * 1024

/** Nisbi fayl yolları, sıralanmış. Nöqtə ilə başlayanlar atılır. */
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
