/**
 * Containment checks for paths that come from outside this process.
 *
 * THE RULE: a relative path supplied by the renderer (or read back from the
 * registry, which the renderer can write to) is never handed to `fs` before it
 * has been through here. `join()` happily resolves `..`, so it is not a
 * boundary on its own.
 */
import { isAbsolute, join, resolve, sep } from 'node:path'

export class PathError extends Error {}

/**
 * Resolve `relative` inside `dir` and prove the result stayed there.
 *
 * `startsWith(dir)` alone would accept a sibling `queries-evil/`, so the
 * separator is checked along with it, and the resolved path is compared against
 * the naive join so a `..` segment cannot slip through unnoticed.
 */
export function containedPath(dir: string, relative: string): string {
  if (relative.length === 0) throw new PathError('Empty path')
  if (relative.includes('\0')) throw new PathError('A path cannot contain a NUL byte')
  if (isAbsolute(relative)) throw new PathError(`The path must be relative: ${relative}`)

  const base = resolve(dir)
  const file = resolve(base, relative)
  if (file !== join(base, relative) || !file.startsWith(base + sep)) {
    throw new PathError(`The path escapes its folder: ${relative}`)
  }
  return file
}

/** `true` when `containedPath` would accept the pair — for validation schemas. */
export function isContained(dir: string, relative: string): boolean {
  try {
    containedPath(dir, relative)
    return true
  } catch {
    return false
  }
}
