/**
 * A Coolify Supabase service is identified by one id, and everything the app
 * needs to reach it is that id in three different shapes:
 *
 *     supabase-db-<id>              the Postgres container
 *     supabase-edge-functions-<id>  the edge runtime container
 *     /data/coolify/services/<id>   the service folder holding .env
 *
 * Typing the same id three times is how they end up disagreeing, so the form
 * asks for it once and derives the rest here. The three fields stay editable —
 * a plain VPS is not laid out this way.
 */

export const COOLIFY_SERVICES_ROOT = '/data/coolify/services'

const DB_PREFIX = 'supabase-db-'
const FUNCTIONS_PREFIX = 'supabase-edge-functions-'

/** Coolify ids are url-safe; anything else is not an id we can build paths from. */
const ID_RE = /^[A-Za-z0-9_-]+$/

export interface ServicePaths {
  dbContainer: string
  functionsContainer: string
  remoteDir: string
}

export function isServiceId(value: string): boolean {
  return ID_RE.test(value)
}

export function servicePaths(serviceId: string): ServicePaths {
  const id = serviceId.trim()
  return {
    dbContainer: `${DB_PREFIX}${id}`,
    functionsContainer: `${FUNCTIONS_PREFIX}${id}`,
    remoteDir: `${COOLIFY_SERVICES_ROOT}/${id}`
  }
}

function idFrom(value: string, prefix: string): string | null {
  if (!value.startsWith(prefix)) return null
  const id = value.slice(prefix.length)
  return isServiceId(id) ? id : null
}

/**
 * The id an already-configured environment was built from, or `''` when it was
 * not built from one.
 *
 * Every field that has a value has to agree. A single hand-edited path means we
 * can no longer claim the environment follows the layout, and showing an id that
 * only describes two fields out of three would be worse than showing none.
 */
export function serviceIdOf(env: Partial<ServicePaths>): string {
  const found = new Set<string>()
  const fields: Array<[string | undefined, (v: string) => string | null]> = [
    [env.dbContainer, (v) => idFrom(v, DB_PREFIX)],
    [env.functionsContainer, (v) => idFrom(v, FUNCTIONS_PREFIX)],
    [env.remoteDir, (v) => idFrom(v.replace(/\/+$/, ''), `${COOLIFY_SERVICES_ROOT}/`)]
  ]

  for (const [raw, extract] of fields) {
    const value = (raw ?? '').trim()
    if (value === '') continue
    const id = extract(value)
    if (id === null) return ''
    found.add(id)
  }

  return found.size === 1 ? [...found][0]! : ''
}
