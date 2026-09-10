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

export function readRaw(path: string): { text: string; entries: RawEntry[] } {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const entries: RawEntry[] = []
  text.split('\n').forEach((line, i) => {
    if (/^\s*(#|$)/.test(line)) return
    const m = LINE_RE.exec(line)
    if (!m) return
    const { value, quote } = unquote(m[4]!)
    entries.push({ key: m[2]!, value, line: i, quote })
  })
  return { text, entries }
}

export function readMap(path: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of readRaw(path).entries) out.set(e.key, e.value)
  return out
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
