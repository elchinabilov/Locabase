/**
 * A minimal, position-preserving scanner for `config.toml`.
 *
 * The goal is not a full TOML parser — `smol-toml` does the reading. This file's
 * job is to find **where each key's value starts and ends in the file**, so the
 * patcher can replace only that range and leave comments untouched.
 */

export interface TomlEntry {
  /** full dotted path, e.g. `auth.external.google.client_id` */
  path: string
  /** table path (`auth.external.google`) — empty string at the root level */
  table: string
  /** the key's start offset in the file */
  keyStart: number
  /** offset of the value's first character */
  valueStart: number
  /** offset just past the value's last character (excludes a trailing comment) */
  valueEnd: number
  /** start of the key's line (including indentation) */
  lineStart: number
  /** end of the line — includes a trailing comment, excludes the newline itself */
  lineEnd: number
}

export interface TomlTable {
  /** `[a.b]` → `a.b`. For arrays of tables (`[[x]]`): `x#0`, `x#1`, … */
  path: string
  headerStart: number
  headerEnd: number
  /** `lineEnd` of the last key in this table; `headerEnd` when it has none */
  lastEntryEnd: number
}

export interface TomlScan {
  text: string
  entries: TomlEntry[]
  tables: TomlTable[]
  byPath: Map<string, TomlEntry>
  tableByPath: Map<string, TomlTable>
  /** the file's line-ending style */
  eol: '\n' | '\r\n'
}

const isWs = (c: string): boolean => c === ' ' || c === '\t'
const isNl = (c: string): boolean => c === '\n' || c === '\r'

/** Skip from the given offset to the end of the line (without eating the newline). */
function toEol(text: string, i: number): number {
  while (i < text.length && !isNl(text[i]!)) i++
  return i
}

/** Eat the newline character(s). */
function eatEol(text: string, i: number): number {
  if (text[i] === '\r' && text[i + 1] === '\n') return i + 2
  if (isNl(text[i] ?? '')) return i + 1
  return i
}

/**
 * Find the end of a string literal. `i` sits on the opening quote.
 * For an unterminated string it returns the end of line/file — the scanner never hangs.
 */
function skipString(text: string, i: number): number {
  const q = text[i]!
  const triple = text[i + 1] === q && text[i + 2] === q
  if (triple) {
    const close = text.indexOf(q + q + q, i + 3)
    return close === -1 ? text.length : close + 3
  }
  let j = i + 1
  while (j < text.length) {
    const c = text[j]!
    if (isNl(c)) return j // unterminated: the line ended
    if (q === '"' && c === '\\') {
      j += 2
      continue
    }
    if (c === q) return j + 1
    j++
  }
  return text.length
}

/**
 * Find the end of a value. Array/inline-table depth is tracked, so multi-line
 * values are captured correctly; at depth 0 a `#` starts a comment.
 */
function findValueEnd(text: string, start: number): number {
  let i = start
  let depth = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '"' || c === "'") {
      i = skipString(text, i)
      continue
    }
    if (c === '#') {
      if (depth === 0) break
      i = toEol(text, i)
      continue
    }
    if (c === '[' || c === '{') {
      depth++
      i++
      continue
    }
    if (c === ']' || c === '}') {
      if (depth === 0) break
      depth--
      i++
      continue
    }
    if (isNl(c)) {
      if (depth === 0) break
      i++
      continue
    }
    i++
  }
  // give the trailing whitespace back
  while (i > start && isWs(text[i - 1] ?? '')) i--
  return i
}

/** `a.b."c d"` → `['a','b','c d']` */
function splitKey(raw: string): string[] {
  const parts: string[] = []
  let cur = ''
  let i = 0
  while (i < raw.length) {
    const c = raw[i]!
    if (c === '"' || c === "'") {
      const end = skipString(raw, i)
      cur += raw.slice(i + 1, Math.max(i + 1, end - 1))
      i = end
      continue
    }
    if (c === '.') {
      parts.push(cur.trim())
      cur = ''
      i++
      continue
    }
    cur += c
    i++
  }
  parts.push(cur.trim())
  return parts.filter((p) => p.length > 0)
}

export function scanToml(text: string): TomlScan {
  const entries: TomlEntry[] = []
  const tables: TomlTable[] = []
  const eol: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n'

  const root: TomlTable = { path: '', headerStart: 0, headerEnd: 0, lastEntryEnd: 0 }
  tables.push(root)
  let current = root
  const arrayCounts = new Map<string, number>()

  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (isWs(c) || isNl(c)) {
      i++
      continue
    }
    if (c === '#') {
      i = eatEol(text, toEol(text, i))
      continue
    }
    if (c === '[') {
      const headerStart = i
      const isArray = text[i + 1] === '['
      let j = i + (isArray ? 2 : 1)
      // up to the closing bracket — accounting for quoted keys
      while (j < text.length && text[j] !== ']' && !isNl(text[j]!)) {
        if (text[j] === '"' || text[j] === "'") {
          j = skipString(text, j)
          continue
        }
        j++
      }
      const inner = text.slice(i + (isArray ? 2 : 1), j)
      let path = splitKey(inner).join('.')
      if (isArray) {
        const n = arrayCounts.get(path) ?? 0
        arrayCounts.set(path, n + 1)
        path = `${path}#${n}`
      }
      const headerEnd = toEol(text, j)
      const table: TomlTable = { path, headerStart, headerEnd, lastEntryEnd: headerEnd }
      tables.push(table)
      current = table
      i = eatEol(text, headerEnd)
      continue
    }

    // key = value
    const lineStart = i
    let j = i
    let eq = -1
    while (j < text.length && !isNl(text[j]!)) {
      const ch = text[j]!
      if (ch === '"' || ch === "'") {
        j = skipString(text, j)
        continue
      }
      if (ch === '=') {
        eq = j
        break
      }
      if (ch === '#') break
      j++
    }
    if (eq === -1) {
      // no `=` — leave this line as it is
      i = eatEol(text, toEol(text, i))
      continue
    }

    const keyRaw = text.slice(lineStart, eq)
    const segs = splitKey(keyRaw)
    let valueStart = eq + 1
    while (valueStart < text.length && isWs(text[valueStart]!)) valueStart++
    const valueEnd = findValueEnd(text, valueStart)
    const lineEnd = toEol(text, valueEnd)

    const path = current.path === '' ? segs.join('.') : `${current.path}.${segs.join('.')}`
    entries.push({
      path,
      table: current.path,
      keyStart: lineStart,
      valueStart,
      valueEnd,
      lineStart,
      lineEnd
    })
    current.lastEntryEnd = lineEnd
    i = eatEol(text, lineEnd)
  }

  const byPath = new Map(entries.map((e) => [e.path, e]))
  const tableByPath = new Map(tables.map((t) => [t.path, t]))
  return { text, entries, tables, byPath, tableByPath, eol }
}
