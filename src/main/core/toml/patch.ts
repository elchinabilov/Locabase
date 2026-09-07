/**
 * Şərh qoruyan `config.toml` yamaqlayıcısı.
 *
 * Mövcud açar dəyişəndə **yalnız dəyərin aralığı** əvəz olunur; şərhlər, sıra,
 * girinti və boş sətirlər bayt-bayt yerində qalır. Yeni açar öz cədvəlinin
 * sonuna, yeni cədvəl isə faylın sonuna yazılır.
 */
import { parse as parseToml } from 'smol-toml'
import { scanToml, type TomlScan } from './scan.js'
import type { ConfigPatch, ConfigValue } from '@shared/types.js'

export type PatchValue = ConfigValue | { env: string } | undefined

export interface PatchResult {
  text: string
  changed: boolean
  /** dəyişən (əlavə/silinən daxil) sətirlərin sayı */
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
    if (!Number.isFinite(v)) throw new TomlPatchError(`sonlu olmayan rəqəm: ${v}`)
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return `[${v.map((x) => quote(String(x))).join(', ')}]`
  throw new TomlPatchError(`dəstəklənməyən dəyər tipi: ${typeof v}`)
}

/** Yamaqdan gözlənilən **parse olunmuş** dəyər — yoxlama mərhələsi üçün. */
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
 * Yeni açar üçün hədəf cədvəl və açar adı.
 *
 * Qayda sadədir: **son seqment açardır, qalanı cədvəldir**. Ata cədvələ qalxıb
 * `external.apple.enabled` kimi nöqtəli açar yazmırıq — TOML-da nöqtəli açarla
 * yaradılmış cədvəli sonradan `[başlıq]` ilə genişləndirmək qadağandır, və
 * `config.toml` onsuz da yalnız başlıqlı cədvəllərdən ibarətdir.
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
 * Yamaqları tətbiq et. Nəticə yazılmadan əvvəl `validate` ilə yenidən parse
 * olunub gözlənilən dəyərlərlə tutuşdurulur.
 */
export function applyPatches(source: string, patches: ConfigPatch[]): PatchResult {
  if (patches.length === 0) return { text: source, changed: false, changedLines: 0 }

  const scan = scanToml(source)
  const edits: Edit[] = []
  /** eyni çağırışda yaradılan yeni cədvəllər — ikinci açar da ora düşsün */
  const appended = new Map<string, { insertAt: number; lines: string[] }>()
  const tailAdditions: string[] = []

  for (const patch of patches) {
    const existing = scan.byPath.get(patch.path)

    if (patch.value === undefined) {
      if (!existing) continue // onsuz da yoxdur
      // sətri tamamilə sil (sətir sonu ilə birlikdə)
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
      // cədvəl yoxdur — faylın sonuna yeni seksiya
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

  // sondan başa doğru tətbiq et ki, offset-lər sürüşməsin
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
 * Yazmazdan əvvəlki qapı: nəticə TOML kimi parse olunmalı və hər yamaq
 * gözlənilən dəyəri verməlidir. Uyğunsuzluqda heç nə yazılmır.
 */
export function validate(text: string, patches: ConfigPatch[]): void {
  let parsed: unknown
  try {
    parsed = parseToml(text)
  } catch (err) {
    throw new TomlPatchError(
      `yamaqdan sonra fayl TOML kimi parse olunmadı: ${(err as Error).message}`
    )
  }
  for (const patch of patches) {
    const actual = getPath(parsed, patch.path)
    if (patch.value === undefined) {
      if (actual !== undefined) throw new TomlPatchError(`${patch.path} silinmədi`)
      continue
    }
    const want = expectedValue(patch.value as PatchValue)
    if (!sameValue(actual, want)) {
      throw new TomlPatchError(
        `${patch.path}: gözlənilən ${JSON.stringify(want)}, alınan ${JSON.stringify(actual)}`
      )
    }
  }
}
