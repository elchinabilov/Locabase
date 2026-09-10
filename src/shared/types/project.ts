/**
 * Projects in the registry and the remote environments attached to them.
 */

export type RemoteKind = 'managed' | 'self-hosted'

export interface ManagedEnv {
  id: string
  name: string
  kind: 'managed'
  /** the supabase.co project ref, e.g. `abcdefghijklmnopqrst` */
  projectRef: string
  /** The access token lives in safeStorage; only its presence is stored here. */
  hasToken: boolean
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
  /** The Coolify service folder — functions are rsynced here */
  remoteDir: string
  /** Edge runtime container; when empty, function deploys are disabled */
  functionsContainer: string
  apiUrl: string
  siteUrl: string
  backupDir: string
  backupRetentionDays: number
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
