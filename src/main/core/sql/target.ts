/**
 * Where a query goes: the local Postgres, or a remote environment.
 *
 * The only difference is the TRANSPORT — the query text is identical:
 *  - local: the `pg` driver, `$n` parameters;
 *  - remote: Management API / `psql`, where `$n` cannot be bound, so literals are
 *    pasted in with `inlineParams()` before the call.
 */
import { poolFor } from './pool.js'
import { inlineParams } from './ident.js'
import { get as getProject, getEnv } from '../projects.js'
import { adapterFor, type RemoteAdapter } from '../remote/index.js'

export interface Target {
  id: string
  envId: string | null
  /** The name shown in the UI — used in error messages */
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
 * An internal query: results come back as object rows with types preserved
 * (local `pg` parsers, `json_agg` remotely).
 *
 * `int8` differs between the two — a string locally, a number remotely — so the
 * caller always reads it through `Number()`.
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
