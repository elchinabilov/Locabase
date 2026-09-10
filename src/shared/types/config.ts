/**
 * `config.toml` — the field metadata the form is generated from, and the patch/preview shapes.
 */

export type ConfigValue = string | number | boolean | string[]

/** The UI metadata of one `config.toml` key. Forms are generated from this. */
export interface ConfigField {
  /** dotted path, e.g. `auth.jwt_expiry` */
  path: string
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'enum'
  group: ConfigGroup
  label: string
  help?: string
  /** for `type: 'enum'` */
  options?: string[]
  default?: ConfigValue
  /** a change requires `supabase stop && start` */
  restartRequired?: boolean
  /** the value may be `env(VAR)` */
  envAllowed?: boolean
  /** this key is a secret — masked in the UI */
  secret?: boolean
  placeholder?: string
  docs?: string
}

export type ConfigGroup =
  | 'General'
  | 'API'
  | 'Database'
  | 'Auth'
  | 'Auth Email'
  | 'Auth SMS'
  | 'Auth MFA'
  | 'Auth Rate limits'
  | 'Storage'
  | 'Realtime'
  | 'Studio'
  | 'Functions'
  | 'Analytics'
  | 'Experimental'

/** The value handed to the UI: either a literal or an `env(VAR)` reference. */
export interface FieldValue {
  kind: 'literal' | 'env'
  /** the value when kind === 'literal'; the variable name when 'env' */
  value: ConfigValue
  /** when kind === 'env', the current value in `.env` (may be masked) */
  envValue?: string | null
  present: boolean
}

export interface ConfigDocument {
  path: string
  raw: string
  values: Record<string, FieldValue>
}

/** One patch operation: an `undefined` value deletes the key. */
export interface ConfigPatch {
  path: string
  value: ConfigValue | { env: string } | undefined
}

export interface PatchPreview {
  before: string
  after: string
  /** number of changed lines */
  changedLines: number
  restartRequired: boolean
}
