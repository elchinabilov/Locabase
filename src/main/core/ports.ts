/**
 * Port manager. Several local Supabase stacks run side by side on one machine
 * and each project claims its own block of 100 (543xx, 553xx, 563xx…). That
 * split used to live as a comment in a document — here it is computed.
 */
import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import type { ConfigPatch, PortConflict, PortUsage, Project } from '@shared/types/index.js'
import { list as listProjects, paths } from './projects.js'

/** Supabase's default port base: 543xx. */
export const DEFAULT_PORT_BASE = 543

/**
 * `edge_runtime.inspector_port` defaults to 8083 — outside the 543xx block. For
 * a new project we move it into the project's own block too, so stacks running
 * side by side don't claim each other's inspector port.
 */
const INSPECTOR_PATH = 'edge_runtime.inspector_port'
const INSPECTOR_OFFSET = 83

/** The keys in `config.toml` that hold ports. */
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
      out.push({
        port: v,
        key: p.replace(/\.port$/, '').replace(/\./g, ' '),
        projectId: project.id
      })
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
 * Returns the base of a free block of 100: 543 → 543xx. Supabase's default is
 * 543, so the search starts there.
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
 * Patches that move a fresh `supabase init`'s 543xx ports into the `base`xx block.
 * `parsed` is the parsed `config.toml`; only keys that **exist** in the file are
 * returned, so a key absent from this CLI version is never added.
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
