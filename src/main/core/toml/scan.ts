/**
 * `config.toml` üçün minimal, mövqe-saxlayan skaner.
 *
 * Məqsəd tam TOML parseri deyil — oxuma işini `smol-toml` görür. Buranın işi
 * hər açarın **dəyərinin faylda harada başlayıb harada bitdiyini** tapmaqdır ki,
 * yamaqlayıcı yalnız həmin aralığı əvəz etsin və şərhlər toxunulmaz qalsın.
 */

export interface TomlEntry {
  /** nöqtəli tam yol, məs. `auth.external.google.client_id` */
  path: string
  /** cədvəl yolu (`auth.external.google`) — kök səviyyə üçün boş sətir */
  table: string
  /** açarın fayldakı başlanğıc offset-i */
  keyStart: number
  /** dəyərin ilk simvolunun offset-i */
  valueStart: number
  /** dəyərin son simvolundan sonrakı offset (trailing şərh daxil deyil) */
  valueEnd: number
  /** açarın sətirinin başlanğıcı (girinti daxil) */
  lineStart: number
  /** sətirin sonu — trailing şərh daxil, sətir sonu simvolu daxil deyil */
  lineEnd: number
}

export interface TomlTable {
  /** `[a.b]` → `a.b`. Array-of-tables (`[[x]]`) üçün `x#0`, `x#1`, ... */
  path: string
  headerStart: number
  headerEnd: number
  /** bu cədvələ aid sonuncu açarın `lineEnd`-i; açar yoxdursa `headerEnd` */
  lastEntryEnd: number
}

export interface TomlScan {
  text: string
  entries: TomlEntry[]
  tables: TomlTable[]
  byPath: Map<string, TomlEntry>
  tableByPath: Map<string, TomlTable>
  /** faylın sətir sonu üslubu */
  eol: '\n' | '\r\n'
}

const isWs = (c: string): boolean => c === ' ' || c === '\t'
const isNl = (c: string): boolean => c === '\n' || c === '\r'

/** Verilmiş offset-dən sətir sonuna qədər atla (sətir sonu simvolunu yemədən). */
function toEol(text: string, i: number): number {
  while (i < text.length && !isNl(text[i]!)) i++
  return i
}

/** Sətir sonu simvol(lar)ını ye. */
function eatEol(text: string, i: number): number {
  if (text[i] === '\r' && text[i + 1] === '\n') return i + 2
  if (isNl(text[i] ?? '')) return i + 1
  return i
}

/**
 * String literalının sonunu tap. `i` açılış dırnağının üstündədir.
 * Qapanmayan string üçün sətir/fayl sonunu qaytarır — skaner heç vaxt ilişmir.
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
    if (isNl(c)) return j // qapanmayıb: sətir bitdi
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
 * Dəyərin sonunu tap. Massiv/inline-table dərinliyini sayır, ona görə çoxsətirli
 * dəyərlər də düzgün tutulur; dərinlik 0-da `#` şərh başlanğıcıdır.
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
  // trailing boşluqları geri qaytar
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
      // bağlayan mötərizəyə qədər — dırnaqlı açarları nəzərə alaraq
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
      // `=` yoxdur — bu sətri olduğu kimi buraxırıq
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
