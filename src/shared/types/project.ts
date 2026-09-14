/**
 * Projects in the registry and the remote environments attached to them.
 */

export type RemoteKind = 'managed' | 'self-hosted'

/**
 * Local `.env` key → the name the same secret has on the remote. Only the keys
 * whose names actually differ belong here; everything else is pushed 1:1.
 *
 * It exists because a self-hosted stack rarely uses the CLI's names: a Coolify
 * Supabase service calls Google's client id `GOOGLE_CLIENT_ID`, while
 * `config.toml` refers to it as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`.
 * Without the mapping a push writes a key nothing reads.
 */
export type SecretMap = Record<string, string>

export interface ManagedEnv {
  id: string
  name: string
  kind: 'managed'
  /** the supabase.co project ref, e.g. `abcdefghijklmnopqrst` */
  projectRef: string
  /** The access token lives in safeStorage; only its presence is stored here. */
  hasToken: boolean
  /** Optional — environments stored before the mapping existed have no field. */
  secretMap?: SecretMap
}

export interface SelfHostedEnv {
  id: string
  name: string
  kind: 'self-hosted'
  /** in `root@host` form */
  sshHost: string
  sshPort: number
  /** When empty, ssh-agent / the default keys are tried. */
  sshKeyPath: string
  /** Name of the Postgres container as found by `docker ps` */
  dbContainer: string
  /**
   * The Coolify service folder — `.env` and `volumes/functions` are read from
   * and written under it. Required: an empty value used to silently resolve to
   * the server root, so the app read `/.env` instead of the service's own.
   */
  remoteDir: string
  /** Edge runtime container; when empty, function deploys are disabled */
  functionsContainer: string
  apiUrl: string
  siteUrl: string
  backupDir: string
  backupRetentionDays: number
  /** Optional — environments stored before the mapping existed have no field. */
  secretMap?: SecretMap
}

export type RemoteEnv = ManagedEnv | SelfHostedEnv

export interface Project {
  id: string
  /** the name shown in the UI */
  name: string
  /** repo root — it contains the `supabase/` folder */
  path: string
  /** the `project_id` from `config.toml`; the suffix of the container names */
  projectId: string
  /** the file `env()` references are read from, relative to the repo root. Default: `.env` */
  envFile: string
  environments: RemoteEnv[]
  addedAt: string
}
