/**
 * Port menecer. Bu maşında bir neçə lokal Supabase stack-i yan-yana işləyir və
 * hər layihə öz 100-lük aralığını tutur (543xx, 553xx, 563xx...). Aralıq bölgüsü
 * indiyə qədər sənəddəki şərh kimi yaşayırdı — burada hesablanır.
 */
import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import { list as listProjects, paths } from './projects.js'
import type { ConfigPatch, PortConflict, PortUsage, Project } from '@shared/types.js'

/** Supabase-in standart port bazası: 543xx. */
export const DEFAULT_PORT_BASE = 543

/**
 * `edge_runtime.inspector_port` standartda 8083-dür — 543xx blokundan
 * kənarda. Yeni layihədə onu da layihənin öz blokuna salırıq ki, yan-yana
 * işləyən stack-lər bir-birinin inspector portunu tutmasın.
 */
const INSPECTOR_PATH = 'edge_runtime.inspector_port'
const INSPECTOR_OFFSET = 83

/** `config.toml`-da port saxlayan açarlar. */
const PORT_PATHS: string[] = [
  'api.port',
  'db.port',
  'db.shadow_port',
  'db.pooler.port',
  'studio.port',
  'local_smtp.port',
  'inbucket.port',
  'analytics.port',
  'edge_runtime.inspector_port'
]

function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

export function portsOf(project: Project): PortUsage[] {
  let parsed: unknown
  try {
    parsed = parseToml(readFileSync(paths.configToml(project), 'utf8'))
  } catch {
    return []
  }
  const out: PortUsage[] = []
  for (const p of PORT_PATHS) {
    const v = pick(parsed, p)
    if (typeof v === 'number' && v > 0) {
      out.push({ port: v, key: p.replace(/\.port$/, '').replace(/\./g, ' '), projectId: project.id })
    }
  }
  return out
}

export function conflicts(): PortConflict[] {
  const byPort = new Map<number, PortUsage[]>()
  for (const project of listProjects()) {
    for (const usage of portsOf(project)) {
      const bucket = byPort.get(usage.port) ?? []
      bucket.push(usage)
      byPort.set(usage.port, bucket)
    }
  }
  const out: PortConflict[] = []
  for (const [port, holders] of byPort) {
    const distinct = new Set(holders.map((h) => h.projectId))
    if (distinct.size > 1) out.push({ port, holders })
  }
  return out.sort((a, b) => a.port - b.port)
}

/**
 * Boş 100-lük aralığın bazasını qaytarır: 543 → 543xx. Supabase-in standartı
 * 543-dür, ona görə axtarış oradan başlayır.
 */
export function suggestRange(): number {
  const used = new Set<number>()
  for (const project of listProjects()) {
    for (const usage of portsOf(project)) used.add(Math.floor(usage.port / 100))
  }
  for (let base = DEFAULT_PORT_BASE; base < 655; base += 1) {
    if (!used.has(base)) return base
  }
  return DEFAULT_PORT_BASE
}

/**
 * Təzə `supabase init`-in 543xx portlarını `base`xx blokuna köçürən yamaqlar.
 * `parsed` — parse olunmuş `config.toml`; yalnız faylda **mövcud** açarlar
 * qaytarılır, beləcə CLI versiyasında olmayan açar əlavə edilmir.
 */
export function remapPatches(parsed: unknown, base: number): ConfigPatch[] {
  if (base === DEFAULT_PORT_BASE) return []
  const out: ConfigPatch[] = []
  for (const path of PORT_PATHS) {
    const current = pick(parsed, path)
    if (typeof current !== 'number' || current <= 0) continue
    if (path === INSPECTOR_PATH) {
      out.push({ path, value: base * 100 + INSPECTOR_OFFSET })
      continue
    }
    if (Math.floor(current / 100) !== DEFAULT_PORT_BASE) continue
    out.push({ path, value: base * 100 + (current % 100) })
  }
  return out
}
