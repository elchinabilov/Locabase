/**
 * Auth: the OAuth providers on the Configuration screen, and the GoTrue user table behind the Users screen.
 */

import type { FieldValue } from './config.js'

export interface AuthProviderMeta {
  /** the name in `config.toml`, e.g. `linkedin_oidc` */
  id: string
  label: string
  /** which fields to show */
  fields: Array<
    'client_id' | 'secret' | 'url' | 'redirect_uri' | 'skip_nonce_check' | 'email_optional'
  >
  /** explains where the callback URL goes in the provider's console */
  hint?: string
  docs?: string
}

export interface AuthProviderState {
  id: string
  enabled: boolean
  values: Record<string, FieldValue>
}

/** One row of the GoTrue user table, as the Users screen shows it. */
export interface AuthUser {
  id: string
  email: string | null
  phone: string | null
  /** Every provider this user has an identity for; empty when the stack has none. */
  providers: string[]
  createdAt: string | null
  lastSignInAt: string | null
  /** null = never confirmed (email or phone, whichever the stack tracks) */
  confirmedAt: string | null
  /** A timestamp in the future means the user is banned right now. */
  bannedUntil: string | null
  isAnonymous: boolean
  isSso: boolean
}

export type AuthUserStatus = 'all' | 'confirmed' | 'unconfirmed' | 'anonymous' | 'banned'

export type AuthUserSort =
  'created_desc' | 'created_asc' | 'signin_desc' | 'signin_asc' | 'email_asc'

export interface AuthUsersQuery {
  envId: string | null
  /** Matched against email, phone and the id as text. */
  search?: string
  /** A provider id from `providers` in the previous page's response. */
  provider?: string | null
  status?: AuthUserStatus
  sort?: AuthUserSort
  page?: number
  pageSize?: number
}

export interface AuthUsersPage {
  rows: AuthUser[]
  total: number
  /** The providers this database has actually seen — the filter list. */
  providers: string[]
}

export interface AuthIdentity {
  provider: string
  providerId: string | null
  email: string | null
  createdAt: string | null
  lastSignInAt: string | null
}

export interface AuthUserDetail extends AuthUser {
  updatedAt: string | null
  /** Pretty-printed JSON, or null when the column is empty. */
  appMetadata: string | null
  userMetadata: string | null
  identities: AuthIdentity[]
}

export interface DbCompletion {
  tables: Array<{ schema: string; table: string; columns: string[] }>
}
