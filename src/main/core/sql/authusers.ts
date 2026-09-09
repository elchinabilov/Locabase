/**
 * Reading the GoTrue user table.
 *
 * Two things make this more than a `select *`:
 *
 *  1. `auth.users` has grown columns over the years — `is_anonymous`,
 *     `banned_until` and `is_sso_user` do not exist on older stacks, and asking
 *     for one that isn't there fails the whole query. The projection is
 *     therefore assembled from what `information_schema` actually reports.
 *  2. "Which provider did this user come from" is not a column. It lives in
 *     `auth.identities`, one row per provider, so it is aggregated per user —
 *     with a fallback for the rows that have no identity at all (an
 *     admin-created user, or an anonymous sign-in on an older stack).
 */
import { rowsOf, targetFor, type Target } from './target.js'
import { clampInt } from './build.js'
import type { AuthUser, AuthUserDetail, AuthUsersPage, AuthUsersQuery } from '@shared/types.js'

/** Sorting is never interpolated from the request — only these are allowed through. */
const SORTS: Record<string, string> = {
  created_desc: 'u.created_at desc nulls last',
  created_asc: 'u.created_at asc nulls last',
  signin_desc: 'u.last_sign_in_at desc nulls last',
  signin_asc: 'u.last_sign_in_at asc nulls last',
  email_asc: 'u.email asc nulls last'
}

async function columnsOf(target: Target, table: string): Promise<Set<string>> {
  const rows = await rowsOf<{ column_name: string }>(
    target,
    `select column_name from information_schema.columns
     where table_schema = 'auth' and table_name = $1`,
    [table]
  )
  return new Set(rows.map((r) => r.column_name))
}

/** `col` when the stack has it, otherwise a typed null so the shape never changes. */
function optional(has: Set<string>, col: string, cast: string, alias = 'u'): string {
  return has.has(col) ? `${alias}.${col}` : `null::${cast}`
}

/**
 * Timestamps as ISO-8601 text.
 *
 * The local `pg` driver parses `timestamptz` into a `Date` while the remote
 * transports return whatever their JSON encoder produced — two shapes for one
 * field. `to_json(x)#>>'{}'` pins both to the same ISO string, which is also
 * the one format `new Date()` parses identically everywhere.
 */
function ts(expr: string): string {
  return `to_json(${expr}) #>> '{}'`
}

/**
 * "Confirmed" is a generated column on current stacks and absent on old ones;
 * where it is missing, email confirmation is the closest honest answer.
 */
function confirmedExpr(has: Set<string>): string {
  if (has.has('confirmed_at')) return 'u.confirmed_at'
  if (has.has('email_confirmed_at')) return 'u.email_confirmed_at'
  return 'null::timestamptz'
}

interface Row extends Record<string, unknown> {
  id: string
  email: string | null
  phone: string | null
  created_at: string | null
  last_sign_in_at: string | null
  confirmed_at: string | null
  banned_until: string | null
  is_anonymous: boolean | null
  is_sso: boolean | null
  providers: string[] | null
}

function toUser(r: Row): AuthUser {
  return {
    id: r.id,
    email: r.email,
    phone: r.phone,
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at,
    confirmedAt: r.confirmed_at,
    bannedUntil: r.banned_until,
    isAnonymous: r.is_anonymous === true,
    isSso: r.is_sso === true,
    providers: r.providers ?? []
  }
}

/**
 * The provider list per user. `auth.identities` is the source of truth; a user
 * with no identity row is reported by what the row itself says — anonymous, or
 * a password user created straight through the admin API.
 */
const PROVIDERS_EXPR = `coalesce(
  (select array_agg(distinct i.provider order by i.provider)
     from auth.identities i where i.user_id = u.id),
  case when {anon} then array['anonymous']
       when u.email is not null then array['email']
       when u.phone is not null then array['phone']
       else array[]::text[] end
)`

export async function users(id: string, req: AuthUsersQuery): Promise<AuthUsersPage> {
  const target = targetFor(id, req.envId ?? null)
  const has = await columnsOf(target, 'users')
  if (has.size === 0) {
    throw new Error('auth.users not found — is the Auth service enabled on this database?')
  }

  const anon = has.has('is_anonymous') ? 'u.is_anonymous' : 'false'
  const confirmed = confirmedExpr(has)
  const pageSize = clampInt(req.pageSize ?? 50, 10, 500)
  const page = Math.max(0, req.page ?? 0)

  const where: string[] = []
  const params: Array<string | null | boolean> = []
  const add = (v: string | null | boolean): string => {
    params.push(v)
    return `$${params.length}`
  }

  const search = (req.search ?? '').trim()
  if (search) {
    // One pattern, three columns: the id is matched as text so a partial UUID
    // pasted from a log finds its user.
    const p = add(`%${search}%`)
    where.push(`(u.email ilike ${p} or u.phone ilike ${p} or u.id::text ilike ${p})`)
  }

  if (req.provider) {
    const p = add(req.provider)
    where.push(
      `exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = ${p})`
    )
  }

  if (req.status === 'confirmed') where.push(`${confirmed} is not null`)
  else if (req.status === 'unconfirmed') where.push(`${confirmed} is null`)
  else if (req.status === 'anonymous') where.push(`${anon} = true`)
  else if (req.status === 'banned') {
    where.push(has.has('banned_until') ? 'u.banned_until > now()' : 'false')
  }

  const filter = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const order = SORTS[req.sort ?? 'created_desc'] ?? SORTS['created_desc']!

  const listSql = `
    select
      u.id::text as id,
      u.email::text as email,
      ${has.has('phone') ? 'u.phone::text' : 'null::text'} as phone,
      ${ts('u.created_at')} as created_at,
      ${ts('u.last_sign_in_at')} as last_sign_in_at,
      ${ts(confirmed)} as confirmed_at,
      ${ts(optional(has, 'banned_until', 'timestamptz'))} as banned_until,
      ${anon} as is_anonymous,
      ${optional(has, 'is_sso_user', 'boolean')} as is_sso,
      ${PROVIDERS_EXPR.replace('{anon}', anon)} as providers
    from auth.users u
    ${filter}
    order by ${order}
    limit ${pageSize} offset ${page * pageSize}`

  const countSql = `select count(*)::text as n from auth.users u ${filter}`

  const [rows, counted, present] = await Promise.all([
    rowsOf<Row>(target, listSql, params),
    rowsOf<{ n: string }>(target, countSql, params),
    // The filter dropdown lists only providers this database has actually seen,
    // not the 19 the config file knows about.
    rowsOf<{ provider: string }>(
      target,
      `select distinct provider from auth.identities order by provider`
    ).catch(() => [])
  ])

  return {
    rows: rows.map(toUser),
    total: Number(counted[0]?.n ?? 0),
    providers: present.map((p) => p.provider)
  }
}

/** Everything about one user — for the detail panel. */
export async function user(
  id: string,
  envId: string | null,
  userId: string
): Promise<AuthUserDetail> {
  const target = targetFor(id, envId)
  const [has, hasIdentity] = await Promise.all([
    columnsOf(target, 'users'),
    columnsOf(target, 'identities')
  ])
  const anon = has.has('is_anonymous') ? 'u.is_anonymous' : 'false'
  const confirmed = confirmedExpr(has)

  const rows = await rowsOf<
    Row & { app_meta: unknown; user_meta: unknown; updated_at: string | null }
  >(
    target,
    `select
       u.id::text as id,
       u.email::text as email,
       ${has.has('phone') ? 'u.phone::text' : 'null::text'} as phone,
       ${ts('u.created_at')} as created_at,
       ${ts('u.updated_at')} as updated_at,
       ${ts('u.last_sign_in_at')} as last_sign_in_at,
       ${ts(confirmed)} as confirmed_at,
       ${ts(optional(has, 'banned_until', 'timestamptz'))} as banned_until,
       ${anon} as is_anonymous,
       ${optional(has, 'is_sso_user', 'boolean')} as is_sso,
       ${PROVIDERS_EXPR.replace('{anon}', anon)} as providers,
       u.raw_app_meta_data as app_meta,
       u.raw_user_meta_data as user_meta
     from auth.users u where u.id::text = $1`,
    [userId]
  )
  const row = rows[0]
  if (!row) throw new Error(`User not found: ${userId}`)

  const identities = await rowsOf<{
    provider: string
    provider_id: string | null
    email: string | null
    created_at: string | null
    last_sign_in_at: string | null
  }>(
    target,
    `select
       i.provider,
       ${optional(hasIdentity, 'provider_id', 'text', 'i')} as provider_id,
       ${hasIdentity.has('identity_data') ? "(i.identity_data ->> 'email')" : 'null'}::text as email,
       ${ts('i.created_at')} as created_at,
       ${ts('i.last_sign_in_at')} as last_sign_in_at
     from auth.identities i where i.user_id::text = $1 order by i.provider`,
    [userId]
  ).catch(() => [])

  return {
    ...toUser(row),
    updatedAt: row.updated_at,
    appMetadata: asJson(row.app_meta),
    userMetadata: asJson(row.user_meta),
    identities: identities.map((i) => ({
      provider: i.provider,
      providerId: i.provider_id,
      email: i.email,
      createdAt: i.created_at,
      lastSignInAt: i.last_sign_in_at
    }))
  }
}

/**
 * `jsonb` arrives parsed from the local driver and as a string from the remote
 * transports — both end up as text here, so the renderer has one thing to show.
 */
function asJson(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
