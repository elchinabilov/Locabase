/**
 * Domain types — shared between main and renderer.
 * There must be NO Electron/Node import here: this file also reaches the browser side.
 */

/* --------------------------------------------------------------- project */

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

/* ---------------------------------------------------------------- stack */

export interface ServiceStatus {
  /** `db`, `auth`, `rest`, ... */
  key: string
  container: string
  /** docker state: running / exited / created / ... */
  state: string
  /** healthcheck varsa: healthy / unhealthy / starting */
  health: string | null
  /** bytes; null when not measured */
  memory: number | null
  /** the host's total memory — for computing a percentage */
  memoryLimit: number | null
}

/** A single container on the remote server. */
export interface RemoteService {
  container: string
  /** `supabase-db-xxxx` → `db`; the container name when unrecognized */
  key: string
  state: string
  health: string | null
  memory: number | null
  memoryLimit: number | null
}

export interface StackStatus {
  projectId: string
  /** at least one container is running */
  running: boolean
  services: ServiceStatus[]
  /** the output of `supabase status -o json` — empty when the stack is down */
  vars: Record<string, string>
  error: string | null
  checkedAt: string
}

export interface PortUsage {
  port: number
  /** `api`, `db`, `studio`, `local_smtp`, ... */
  key: string
  projectId: string
}

export interface PortConflict {
  port: number
  holders: PortUsage[]
}

/* ---------------------------------------------------------------- config */

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

/* ---------------------------------------------------------------- auth */

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

/* ---------------------------------------------------------------- env */

export interface EnvEntry {
  key: string
  /** fields with `secret: true` reach the UI masked */
  value: string
  masked: boolean
  /** the keys in `config.toml` that reference this variable */
  referencedBy: string[]
}

/* ---------------------------------------------------------------- migrations */

export type MigrationState =
  'synced' | 'pending-local' | 'pending-remote' | 'remote-only' | 'local-only'

export interface MigrationRow {
  version: string
  name: string
  /** file path — when absent, the row exists in the ledger but has no file */
  file: string | null
  inFiles: boolean
  appliedLocal: boolean
  /** null = the remote is not configured or is unreachable */
  appliedRemote: boolean | null
  state: MigrationState
}

export interface MigrationReport {
  rows: MigrationRow[]
  localReachable: boolean
  remoteReachable: boolean
  error: string | null
}

/* ---------------------------------------------------------------- functions */

export interface FunctionInfo {
  name: string
  path: string
  entrypoint: string
  /** sha256 of every file in the folder */
  hash: string
  verifyJwt: boolean
  files: number
  remote: RemoteFunctionInfo | null
  /**
   * The **content** difference between local and remote. `unknown` means the
   * remote gives no file listing (managed: only a version number), so the diff is
   * computed on demand through "View diff".
   */
  drift: FunctionDrift
}

export type FunctionDrift = 'same' | 'changed' | 'local-only' | 'remote-only' | 'unknown'

/** A file fetched from the remote. `content` null — binary or too large. */
export interface RemoteFile {
  path: string
  content: string | null
  binary: boolean
}

/** A remote file and its md5 — for computing the diff cheaply, in one call. */
export interface RemoteFileChecksum {
  path: string
  md5: string
}

export interface RemoteFunctionInfo {
  name: string
  version: number | null
  status: string | null
  updatedAt: string | null
  verifyJwt: boolean | null
  /** null — the remote transport gives no file listing */
  files: RemoteFileChecksum[] | null
}

/* -------------------------------------------------------- function diff */

export interface FunctionFileDiff {
  path: string
  status: 'same' | 'changed' | 'local-only' | 'remote-only'
  /** text content; null for binary or very large files */
  local: string | null
  remote: string | null
  binary: boolean
}

export interface FunctionDiff {
  name: string
  files: FunctionFileDiff[]
  /** number of changed/added/removed files */
  changed: number
}

/* ---------------------------------------------------------------- remote */

export interface HealthReport {
  ok: boolean
  kind: RemoteKind
  details: Array<{ label: string; ok: boolean; info: string }>
}

export interface BackupInfo {
  path: string
  size: string
  createdAt: string
}

export interface VerifyReport {
  ok: boolean
  checks: Array<{ label: string; ok: boolean; info: string }>
}

/* ---------------------------------------------------------------- sync */

export interface SyncAxis<T> {
  /** whether this axis has any difference */
  dirty: boolean
  items: T[]
  error: string | null
}

export interface SecretDiff {
  key: string
  where: 'local-only' | 'remote-only' | 'both'
}

export interface SyncReport {
  envId: string
  migrations: SyncAxis<MigrationRow>
  schema: SyncAxis<{ sql: string }>
  functions: SyncAxis<FunctionInfo>
  secrets: SyncAxis<SecretDiff>
  authConfig: SyncAxis<{ path: string; local: string; remote: string }>
  generatedAt: string
}

export type DeployStep = 'backup' | 'migrations' | 'functions' | 'secrets' | 'auth' | 'verify'

export interface DeployPlan {
  envId: string
  steps: DeployStep[]
  migrations: string[]
  functions: string[]
  secrets: string[]
  dryRun: boolean
}

/* ---------------------------------------------------------------- run/log */

export type LogLevel = 'info' | 'warn' | 'error' | 'stdout' | 'stderr'

export interface LogLine {
  /** which workflow — `stack:my-app`, `deploy:prod`, `fn:serve:notify-message` */
  stream: string
  level: LogLevel
  text: string
  at: string
}

export interface TaskResult {
  ok: boolean
  code: number | null
  /** combined stdout+stderr, the last 200 lines */
  output: string
  error: string | null
}

/* ---------------------------------------------------------------- sql */

/** One row — every cell is text (see `TEXT_TYPES` in `sql/build.ts`). */
export type DbRow = Array<string | null>
/** Column name → value. `null` = SQL NULL; a missing key = "default". */
export type DbCells = Record<string, string | null>

export interface SqlColumn {
  name: string
  typeOid: number
  /** `pg_type.typname`; `oid:<n>` when unrecognized */
  typeName: string
}

export interface SqlResult {
  /** `SELECT`, `INSERT`, `CREATE TABLE`, … */
  command: string | null
  columns: SqlColumn[]
  rows: DbRow[]
  rowCount: number | null
  /** truncated because of the `maxRows` limit */
  truncated: boolean
}

export interface SqlErrorInfo {
  message: string
  code: string | null
  severity: string | null
  detail: string | null
  hint: string | null
  /** 0-based character offset — to mark the offending token in the editor */
  position: number | null
  where: string | null
  table: string | null
  column: string | null
  constraint: string | null
}

export interface SqlRun {
  ok: boolean
  /** one result per statement, for a multi-statement script */
  results: SqlResult[]
  durationMs: number
  readOnly: boolean
  error: SqlErrorInfo | null
}

export interface SavedQuery {
  name: string
  path: string
  bytes: number
  updatedAt: string
}

/* --------------------------------------------------------- introspection */

export interface DbSchema {
  name: string
  owner: string
  comment: string | null
  /** `pg_*`, `information_schema` and Supabase's internal schemas */
  system: boolean
}

/** r=table p=partitioned v=view m=materialized f=foreign */
export type DbRelKind = 'r' | 'p' | 'v' | 'm' | 'f'

export interface DbTable {
  schema: string
  name: string
  kind: DbRelKind
  /** the `reltuples` estimate; -1 on PG14+ when never analyzed */
  estimate: number
  bytes: number
  rls: boolean
  comment: string | null
  editable: boolean
  /** the reason when `editable: false`, e.g. «No PK» */
  editableReason: EditableReason | null
}

export interface DbColumn {
  position: number
  name: string
  dataType: string
  typeOid: number
  nullable: boolean
  defaultExpr: string | null
  isIdentity: boolean
  isGenerated: boolean
  /** null = not part of the PK; a number = its position in the PK */
  pkOrd: number | null
  refSchema: string | null
  refTable: string | null
  refColumn: string | null
  comment: string | null
}

export type DbOp =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'isnull' | 'notnull'

export interface DbFilter {
  column: string
  op: DbOp
  /** ignored for `isnull`/`notnull` */
  value: string | null
}

export interface DbOrder {
  column: string
  dir: 'asc' | 'desc'
}

/**
 * Why a relation cannot be edited. A CODE, not a sentence: the main process has
 * no locale, so the wording belongs to the renderer's dictionary.
 */
export type EditableReason = 'no-pk' | 'view' | 'foreign-table'

export interface DbRowsPage {
  columns: DbColumn[]
  rows: DbRow[]
  /** null = no exact count was computed (the table is large) */
  total: number | null
  editable: boolean
  editableReason: EditableReason | null
}

/* ------------------------------------------------------------------- auth */

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

/* --------------------------------------------------------------- storage */

/**
 * A connected object store. Only Cloudflare R2 for now — the shape is already
 * S3-flavoured, so another S3-compatible provider is a new id plus an endpoint,
 * not a new model.
 */
export type StorageProviderId = 'r2'

export interface StorageConnection {
  id: string
  name: string
  provider: StorageProviderId
  /** R2 account id — the endpoint is derived from it */
  accountId: string
  bucket: string
  /** R2 always answers on `auto`; kept for the next provider */
  region: string
  /** Key prefix inside the bucket, e.g. `locabase/backups`. May be empty. */
  prefix: string
  accessKeyId: string
  /** The secret key lives in safeStorage; only its presence is stored here. */
  hasSecret: boolean
  createdAt: string
}

/** What the connection form sends; `secretAccessKey` never comes back out. */
export interface StorageConnectionInput {
  id?: string
  name: string
  provider: StorageProviderId
  accountId: string
  bucket: string
  region?: string
  prefix?: string
  accessKeyId: string
  /** Omitted on edit = keep the stored secret. */
  secretAccessKey?: string
}

export interface StorageTestReport {
  ok: boolean
  checks: Array<{ label: string; ok: boolean; info: string }>
}

export interface StorageObject {
  key: string
  bytes: number
  updatedAt: string | null
}

/* --------------------------------------------------------------- backups */

/** Where the dump came from. `local` is the Docker stack on this machine. */
export type BackupTargetKind = 'local' | 'managed' | 'self-hosted'

/**
 * `custom` — `pg_dump -Fc` (compressed, restorable with `pg_restore`);
 * `plain` — SQL text. Managed environments only produce `plain`: the dump goes
 * through `supabase db dump`, which has no custom format.
 */
export type BackupFormat = 'custom' | 'plain'

/** Managed dumps are assembled from parts; `full` = roles + schema + data. */
export type BackupScope = 'full' | 'schema' | 'data'

export type BackupTrigger = 'manual' | 'job'

export type BackupStatus = 'running' | 'ok' | 'failed'

export interface BackupRecord {
  id: string
  projectId: string
  /** null = the local stack */
  envId: string | null
  /** The environment name as it was at backup time — the env may be gone later. */
  envName: string
  kind: BackupTargetKind
  format: BackupFormat
  scope: BackupScope
  trigger: BackupTrigger
  /** the scheduler job that produced it, when it wasn't manual */
  jobId: string | null
  jobName: string | null
  status: BackupStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  /** The file on this machine; null once it has been pruned or was never kept. */
  path: string | null
  bytes: number
  /** Upload destination, when one was configured. */
  storageId: string | null
  storageName: string | null
  storageKey: string | null
  error: string | null
}

/** One backup run — the same options for the manual button and for a job. */
export interface BackupOptions {
  /** null = the local stack */
  envId: string | null
  scope?: BackupScope
  /** Upload to this connection after the dump; null = keep it local only. */
  storageId?: string | null
  /** Delete the local file once the upload succeeded. */
  keepLocal?: boolean
  /** Prune this environment's older backups. 0 = no limit. */
  retentionDays?: number
  retentionCount?: number
}

/* --------------------------------------------------------------- restore */

/**
 * Loading a dump back into a database. The target does **not** have to be where
 * the dump came from — pulling production into the local stack is the common
 * case — so it is chosen per restore, and confirmed by name.
 */
export interface RestoreOptions {
  backupId: string
  /** null = the local stack */
  envId: string | null
  /** Custom-format dumps only: drop objects before recreating them. */
  clean: boolean
  /** Must equal the target's name — the same guard `stack:reset` uses. */
  confirm: string
}

export interface RestoreResult {
  ok: boolean
  /** Where it went, as shown in the confirmation. */
  envName: string
  /** The tail of the restore output. */
  output: string
  error: string | null
  /**
   * `psql` does not stop on a failed statement (an existing role, a missing
   * owner), so a restore can finish and still have errors inside it. This counts
   * them — `ok: true` with a non-zero count means "loaded, but read the output".
   */
  failedStatements: number
  durationMs: number
  /** The dump was pulled back from object storage first. */
  fromStorage: boolean
}

/* -------------------------------------------------------------- scheduler */

/**
 * When a job runs. `cron` is the escape hatch (5 fields, standard syntax); the
 * other three are the shapes a backup schedule actually takes, so the form
 * doesn't make everyone learn cron.
 */
export type ScheduleKind = 'interval' | 'daily' | 'weekly' | 'cron'

export interface ScheduleSpec {
  kind: ScheduleKind
  /** `interval`: the gap in minutes */
  everyMinutes?: number
  /** `daily` / `weekly`: local wall-clock time, `HH:MM` */
  at?: string
  /** `weekly`: 0 = Sunday … 6 = Saturday */
  weekday?: number
  /** `cron`: minute hour day-of-month month day-of-week */
  expr?: string
}

export type JobType = 'backup'

export interface Job {
  id: string
  projectId: string
  name: string
  type: JobType
  enabled: boolean
  /** null = the local stack */
  envId: string | null
  schedule: ScheduleSpec
  scope: BackupScope
  storageId: string | null
  keepLocal: boolean
  /** 0 = keep everything */
  retentionDays: number
  retentionCount: number
  createdAt: string
  lastRunAt: string | null
  lastStatus: 'ok' | 'failed' | null
  lastError: string | null
  /** Computed by the scheduler; null when the job is off or the spec is invalid. */
  nextRunAt: string | null
  /** True while this job's run is in flight. */
  running: boolean
}

/** What the job form sends — the run bookkeeping fields are the scheduler's. */
export interface JobInput {
  id?: string
  projectId: string
  name: string
  type: JobType
  enabled: boolean
  envId: string | null
  schedule: ScheduleSpec
  scope: BackupScope
  storageId: string | null
  keepLocal: boolean
  retentionDays: number
  retentionCount: number
}
