/**
 * The root `.env` file — every `env(...)` reference in `config.toml` is
 * resolved from here. Patching is as surgical as it is for TOML: only the value
 * part of an existing line is replaced, comments and ordering survive.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export interface RawEntry {
  key: string
  value: string
  /** the line's index in the file */
  line: number
  /** quote style: '', '"' or "'" */
  quote: string
}

const LINE_RE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/

function unquote(raw: string): { value: string; quote: string } {
  const trimmed = raw.trim()
  if (trimmed.length >= 2) {
    const q = trimmed[0]!
    if ((q === '"' || q === "'") && trimmed.endsWith(q)) {
      const inner = trimmed.slice(1, -1)
      return {
        value: q === '"' ? inner.replace(/\\n/g, '\n').replace(/\\"/g, '"') : inner,
        quote: q
      }
    }
  }
  // an unquoted value may carry an inline comment: `KEY=value # comment`
  const hash = trimmed.indexOf(' #')
  return { value: (hash === -1 ? trimmed : trimmed.slice(0, hash)).trim(), quote: '' }
}

function quoteValue(value: string, preferred: string): string {
  if (preferred === "'" && !value.includes("'")) return `'${value}'`
  if (preferred === '' && /^[A-Za-z0-9_./:@-]*$/.test(value) && value.length > 0) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/**
 * Split `.env` text into entries. Separate from `readRaw` because the same
 * format arrives from places that are not a local file — a self-hosted stack's
 * remote `.env` is read over ssh and parsed with exactly these rules.
 */
export function parseEntries(text: string): RawEntry[] {
  const entries: RawEntry[] = []
  text.split('\n').forEach((line, i) => {
    if (/^\s*(#|$)/.test(line)) return
    const m = LINE_RE.exec(line)
    if (!m) return
    const { value, quote } = unquote(m[4]!)
    entries.push({ key: m[2]!, value, line: i, quote })
  })
  return entries
}

/**
 * A value that can live on one `.env` line, or `null` if it cannot.
 *
 * Multi-line JSON (a Google service-account key pasted as-is) is the common
 * case: re-serialised compactly it means exactly the same to whatever parses
 * it, and the `\n` inside `private_key` stays an escape, not a line break.
 *
 * `unquote` has already turned every `\n` of a double-quoted value into a real
 * line break — including the ones inside JSON strings, which `JSON.parse`
 * rejects. `escapeBreaksInStrings` puts those back first.
 */
export function singleLineValue(value: string): string | null {
  if (!value.includes('\n')) return value
  try {
    return JSON.stringify(JSON.parse(escapeBreaksInStrings(value)))
  } catch {
    return null
  }
}

/** Raw CR/LF inside JSON string literals → `\r`/`\n` escapes; outside, untouched. */
function escapeBreaksInStrings(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (!inString) {
      if (c === '"') inString = true
      out += c
      continue
    }
    if (c === '\\') {
      const next = text[i + 1]
      // `\\n` in the file became backslash + line break: that was meant as `\n`
      if (next === '\n') out += '\\n'
      else if (next === '\r') out += '\\r'
      else out += c + (next ?? '')
      i++
    } else if (c === '\n') out += '\\n'
    else if (c === '\r') out += '\\r'
    else {
      if (c === '"') inString = false
      out += c
    }
  }
  return out
}

/** `.env` text → key/value map; a repeated key keeps its last value. */
export function parseMap(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of parseEntries(text)) out.set(e.key, e.value)
  return out
}

export function readRaw(path: string): { text: string; entries: RawEntry[] } {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  return { text, entries: parseEntries(text) }
}

export function readMap(path: string): Map<string, string> {
  return parseMap(readRaw(path).text)
}

/** Write/update keys. A key that doesn't exist is appended to the file. */
export function writeKeys(path: string, kv: Array<{ key: string; value: string }>): void {
  const { text, entries } = readRaw(path)
  const lines = text === '' ? [] : text.split('\n')
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const additions: string[] = []

  for (const { key, value } of kv) {
    const existing = byKey.get(key)
    if (existing) {
      const line = lines[existing.line]!
      const m = LINE_RE.exec(line)
      if (!m) continue
      lines[existing.line] = `${m[1]}${m[2]}${m[3]}${quoteValue(value, existing.quote)}`
    } else {
      additions.push(`${key}=${quoteValue(value, '')}`)
    }
  }

  let out = lines.join('\n')
  if (additions.length > 0) {
    if (out.length > 0 && !out.endsWith('\n')) out += '\n'
    out += `${additions.join('\n')}\n`
  }
  writeFileSync(path, out, { mode: 0o600 })
}

export function deleteKey(path: string, key: string): void {
  const { text, entries } = readRaw(path)
  const target = entries.find((e) => e.key === key)
  if (!target) return
  const lines = text.split('\n')
  lines.splice(target.line, 1)
  writeFileSync(path, lines.join('\n'), { mode: 0o600 })
}

/** The masked view sent to the UI. */
export function mask(value: string): string {
  if (value.length === 0) return ''
  if (value.length <= 8) return '•'.repeat(value.length)
  return `${value.slice(0, 3)}${'•'.repeat(Math.min(value.length - 6, 24))}${value.slice(-3)}`
}
