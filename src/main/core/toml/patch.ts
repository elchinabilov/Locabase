/**
 * The comment-preserving `config.toml` patcher.
 *
 * When an existing key changes, **only the value's range** is replaced; comments,
 * ordering, indentation and blank lines stay byte-for-byte in place. A new key is
 * written at the end of its table, and a new table at the end of the file.
 */
import { parse as parseToml } from 'smol-toml'
import { scanToml, type TomlScan } from './scan.js'
import type { ConfigPatch, ConfigValue } from '@shared/types.js'

export type PatchValue = ConfigValue | { env: string } | undefined

export interface PatchResult {
  text: string
  changed: boolean
  /** number of changed lines (including added and removed ones) */
  changedLines: number
}

export class TomlPatchError extends Error {}

/* ------------------------------------------------------------- serialize */

function quote(s: string): string {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

export function serializeValue(v: PatchValue): string {
  if (v === undefined) throw new TomlPatchError('serializeValue: undefined')
  if (typeof v === 'object' && !Array.isArray(v)) return quote(`env(${v.env})`)
  if (typeof v === 'string') return quote(v)
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TomlPatchError(`non-finite number: ${v}`)
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return `[${v.map((x) => quote(String(x))).join(', ')}]`
  throw new TomlPatchError(`unsupported value type: ${typeof v}`)
}

/** The **parsed** value a patch is expected to produce — for the verification step. */
function expectedValue(v: PatchValue): unknown {
  if (v !== undefined && typeof v === 'object' && !Array.isArray(v)) return `env(${v.env})`
  return v
}

/* ------------------------------------------------------------- helpers */

function lastSegment(path: string): string {
  const i = path.lastIndexOf('.')
  return i === -1 ? path : path.slice(i + 1)
}

/** `auth.external.google.client_id` → `auth.external.google` */
function tablePath(path: string): string {
  const i = path.lastIndexOf('.')
  return i === -1 ? '' : path.slice(0, i)
}

/**
 * The target table and key name for a new key.
 *
 * The rule is simple: **the last segment is the key, the rest is the table**. We
 * don't climb to the parent table and write a dotted key like
 * `external.apple.enabled` — TOML forbids extending a table created through a
 * dotted key with a later `[header]`, and `config.toml` is all headed tables anyway.
 */
function resolveInsertion(_scan: TomlScan, path: string): { table: string; key: string } {
  return { table: tablePath(path), key: lastSegment(path) }
}

function countLines(s: string): number {
  if (s.length === 0) return 0
  return s.split('\n').length
}

/* ------------------------------------------------------------- apply */

interface Edit {
  start: number
  end: number
  text: string
}

/**
 * Apply the patches. Before the result is written it is re-parsed by `validate`
 * and compared against the expected values.
 */
export function applyPatches(source: string, patches: ConfigPatch[]): PatchResult {
  if (patches.length === 0) return { text: source, changed: false, changedLines: 0 }

  const scan = scanToml(source)
  const edits: Edit[] = []
  /** new tables created in this same call — so a second key lands in them too */
  const appended = new Map<string, { insertAt: number; lines: string[] }>()
  const tailAdditions: string[] = []

  for (const patch of patches) {
    const existing = scan.byPath.get(patch.path)

    if (patch.value === undefined) {
      if (!existing) continue // onsuz da yoxdur
      // delete the line entirely (together with its newline)
      let end = existing.lineEnd
      if (source[end] === '\r' && source[end + 1] === '\n') end += 2
      else if (source[end] === '\n') end += 1
      edits.push({ start: existing.lineStart, end, text: '' })
      continue
    }

    const rendered = serializeValue(patch.value as PatchValue)

    if (existing) {
      if (source.slice(existing.valueStart, existing.valueEnd) === rendered) continue
      edits.push({ start: existing.valueStart, end: existing.valueEnd, text: rendered })
      continue
    }

    const { table, key } = resolveInsertion(scan, patch.path)
    const line = `${key} = ${rendered}`
    const pending = appended.get(table)
    if (pending) {
      pending.lines.push(line)
      continue
    }
    const target = scan.tableByPath.get(table)
    if (target) {
      appended.set(table, { insertAt: target.lastEntryEnd, lines: [line] })
    } else {
      // no such table — append a new section at the end of the file
      const bucket = tailAdditions.findIndex((t) => t.startsWith(`[${table}]`))
      if (bucket === -1) tailAdditions.push(`[${table}]\n${line}`)
      else tailAdditions[bucket] = `${tailAdditions[bucket]}\n${line}`
    }
  }

  for (const [, ins] of appended) {
    edits.push({ start: ins.insertAt, end: ins.insertAt, text: `\n${ins.lines.join('\n')}` })
  }

  if (edits.length === 0 && tailAdditions.length === 0) {
    return { text: source, changed: false, changedLines: 0 }
  }

  // apply back to front so offsets don't shift
  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let out = source
  let changedLines = 0
  for (const e of edits) {
    changedLines += Math.max(countLines(source.slice(e.start, e.end)), countLines(e.text), 1)
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }

  if (tailAdditions.length > 0) {
    const sep = out.endsWith('\n') ? '\n' : '\n\n'
    const block = tailAdditions.join('\n\n')
    out = `${out}${sep}${block}\n`
    changedLines += countLines(block) + 1
  }

  if (scan.eol === '\r\n') out = out.replace(/(?<!\r)\n/g, '\r\n')

  validate(out, patches)
  return { text: out, changed: out !== source, changedLines }
}

/* ------------------------------------------------------------- validate */

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => String(x) === String(b[i]))
  }
  return a === b
}

/**
 * The gate before writing: the result has to parse as TOML and every patch has to
 * produce the expected value. On a mismatch nothing is written.
 */
export function validate(text: string, patches: ConfigPatch[]): void {
  let parsed: unknown
  try {
    parsed = parseToml(text)
  } catch (err) {
    throw new TomlPatchError(
      `the file did not parse as TOML after patching: ${(err as Error).message}`
    )
  }
  for (const patch of patches) {
    const actual = getPath(parsed, patch.path)
    if (patch.value === undefined) {
      if (actual !== undefined) throw new TomlPatchError(`${patch.path} was not deleted`)
      continue
    }
    const want = expectedValue(patch.value as PatchValue)
    if (!sameValue(actual, want)) {
      throw new TomlPatchError(
        `${patch.path}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`
      )
    }
  }
}
