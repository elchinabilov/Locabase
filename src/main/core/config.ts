/**
 * `config.toml`-un UI görünüşü: hər sahə üçün ya literal dəyər, ya da
 * `env(VAR)` referensi + həmin dəyişənin `.env`-dəki hazırkı dəyəri.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import { applyPatches } from './toml/patch.js'
import { scanToml } from './toml/scan.js'
import { mask, readMap } from './envfile.js'
import { get as getProject, paths } from './projects.js'
import { CONFIG_FIELDS, FIELD_BY_PATH, needsRestart } from '@shared/config-schema.js'
import { AUTH_PROVIDERS } from '@shared/providers.js'
import type {
  ConfigDocument,
  ConfigPatch,
  ConfigValue,
  FieldValue,
  PatchPreview
} from '@shared/types.js'

const ENV_REF = /^env\(([A-Za-z_][A-Za-z0-9_]*)\)$/

function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/** UI-ın idarə etdiyi bütün yollar: sxem sahələri + provider sahələri + secrets. */
export function knownPaths(configText: string): string[] {
  const out = new Set(CONFIG_FIELDS.map((f) => f.path))
  for (const p of AUTH_PROVIDERS) {
    out.add(`auth.external.${p.id}.enabled`)
    for (const f of p.fields) out.add(`auth.external.${p.id}.${f}`)
  }
  // `[edge_runtime.secrets]` açarları sərbəstdir — fayldan oxunur
  for (const entry of scanToml(configText).entries) {
    if (entry.path.startsWith('edge_runtime.secrets.')) out.add(entry.path)
  }
  return [...out]
}

function toFieldValue(
  raw: unknown,
  env: Map<string, string>,
  secret: boolean
): FieldValue {
  if (raw === undefined) return { kind: 'literal', value: '', present: false }
  if (typeof raw === 'string') {
    const m = ENV_REF.exec(raw)
    if (m) {
      const varName = m[1]!
      const actual = env.get(varName)
      return {
        kind: 'env',
        value: varName,
        envValue: actual === undefined ? null : secret ? mask(actual) : actual,
        present: true
      }
    }
    return { kind: 'literal', value: secret && raw ? mask(raw) : raw, present: true }
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return { kind: 'literal', value: raw, present: true }
  }
  if (Array.isArray(raw)) {
    return { kind: 'literal', value: raw.map(String), present: true }
  }
  return { kind: 'literal', value: '', present: false }
}

export function read(projectId: string): ConfigDocument {
  const project = getProject(projectId)
  const path = paths.configToml(project)
  const raw = readFileSync(path, 'utf8')
  const parsed = parseToml(raw)
  const env = readMap(paths.envFile(project))

  const values: Record<string, FieldValue> = {}
  for (const p of knownPaths(raw)) {
    const isSecret = FIELD_BY_PATH.get(p)?.secret === true || /secret|token|key|pass/i.test(p)
    values[p] = toFieldValue(pick(parsed, p), env, isSecret)
  }
  return { path, raw, values }
}

/** Yamağın nəticəsini yazmadan göstər. */
export function preview(projectId: string, patches: ConfigPatch[]): PatchPreview {
  const project = getProject(projectId)
  const path = paths.configToml(project)
  const before = readFileSync(path, 'utf8')
  const result = applyPatches(before, patches)
  return {
    before,
    after: result.text,
    changedLines: result.changedLines,
    restartRequired: needsRestart(patches.map((p) => p.path))
  }
}

/**
 * Yaz. Yazmadan əvvəl `.bak` nüsxəsi götürülür; `applyPatches` özü nəticəni
 * yenidən parse edib yoxlayır, ona görə bu nöqtəyə çatan mətn həmişə etibarlıdır.
 */
export function write(projectId: string, patches: ConfigPatch[]): PatchPreview {
  const result = preview(projectId, patches)
  if (result.before === result.after) return result
  const project = getProject(projectId)
  const path = paths.configToml(project)
  if (existsSync(path)) copyFileSync(path, `${path}.bak`)
  writeFileSync(path, result.after, 'utf8')
  return result
}

/** Layihənin lokal API ünvanı — callback URL-ləri bundan hesablanır. */
export function localApiUrl(projectId: string): string {
  const project = getProject(projectId)
  const parsed = parseToml(readFileSync(paths.configToml(project), 'utf8'))
  const port = pick(parsed, 'api.port')
  const tls = pick(parsed, 'api.tls.enabled') === true
  return `${tls ? 'https' : 'http'}://127.0.0.1:${typeof port === 'number' ? port : 54321}`
}

export type { ConfigValue }
