/**
 * Sorğunun hara getdiyi: lokal Postgres, yoxsa uzaq mühit.
 *
 * Fərq yalnız NƏQLİYYATDADIR — sorğu mətnləri eynidir:
 *  - lokal: `pg` sürücüsü, `$n` parametrləri;
 *  - uzaq: Management API / `psql`, `$n` bağlana bilmir, ona görə çağırışdan
 *    əvvəl `inlineParams()` ilə literal yapışdırılır.
 */
import { poolFor } from './pool.js'
import { inlineParams } from './ident.js'
import { get as getProject, getEnv } from '../projects.js'
import { adapterFor, type RemoteAdapter } from '../remote/index.js'

export interface Target {
  id: string
  envId: string | null
  /** UI-da görünən ad — xəta mesajlarında işlənir */
  label: string
  adapter: RemoteAdapter | null
}

export function targetFor(id: string, envId: string | null): Target {
  if (!envId) return { id, envId: null, label: 'lokal', adapter: null }
  const project = getProject(id)
  const env = getEnv(id, envId)
  return { id, envId, label: env.name, adapter: adapterFor(project, env) }
}

export const isRemote = (t: Target): boolean => t.adapter !== null

/**
 * Daxili sorğu: nəticə obyekt sətirləri kimi qayıdır və tiplər qorunur
 * (lokal `pg` parserləri, uzaqda `json_agg`).
 *
 * `int8` iki tərəfdə fərqli gəlir — lokalda sətir, uzaqda ədəd — ona görə
 * çağıran həmişə `Number()` ilə oxuyur.
 */
export async function rowsOf<T extends Record<string, unknown>>(
  target: Target,
  sql: string,
  params: Array<string | null | boolean> = []
): Promise<T[]> {
  if (!target.adapter) {
    const res = await poolFor(target.id).query<T>(sql, params)
    return res.rows
  }
  const literals = params.map((p) => (typeof p === 'boolean' ? String(p) : p))
  return target.adapter.queryJson<T>(inlineParams(sql, literals))
}
