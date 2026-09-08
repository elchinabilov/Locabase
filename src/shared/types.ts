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
  fields: Array<'client_id' | 'secret' | 'url' | 'redirect_uri' | 'skip_nonce_check' | 'email_optional'>
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
  | 'synced'
  | 'pending-local'
  | 'pending-remote'
  | 'remote-only'
  | 'local-only'

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

/* ---------------------------------------------------------------- introspeksiya */

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
  editableReason: string | null
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
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'isnull'
  | 'notnull'

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

export interface DbRowsPage {
  columns: DbColumn[]
  rows: DbRow[]
  /** null = no exact count was computed (the table is large) */
  total: number | null
  editable: boolean
  editableReason: string | null
}

export interface DbCompletion {
  tables: Array<{ schema: string; table: string; columns: string[] }>
}
