/**
 * Domain tipləri — main və renderer arasında paylaşılır.
 * Burada Electron/Node importu OLMAMALIDIR: fayl brauzer tərəfə də girir.
 */

/* ---------------------------------------------------------------- layihə */

export type RemoteKind = 'managed' | 'self-hosted'

export interface ManagedEnv {
  id: string
  name: string
  kind: 'managed'
  /** supabase.co layihə referensi, məs. `odbyilfpdvzaccrfzsfw` */
  projectRef: string
  /** Access token safeStorage-dədir; burada yalnız onun mövcudluğu saxlanılır. */
  hasToken: boolean
}

export interface SelfHostedEnv {
  id: string
  name: string
  kind: 'self-hosted'
  /** `root@host` formatında */
  sshHost: string
  sshPort: number
  /** Boşdursa ssh-agent / default açarlar sınanır. */
  sshKeyPath: string
  /** `docker ps` ilə tapılan Postgres konteynerinin adı */
  dbContainer: string
  /** Coolify servis qovluğu — funksiyalar bura rsync olunur */
  remoteDir: string
  /** Edge runtime konteyneri; boşdursa funksiya deploy-u söndürülür */
  functionsContainer: string
  apiUrl: string
  siteUrl: string
  backupDir: string
  backupRetentionDays: number
}

export type RemoteEnv = ManagedEnv | SelfHostedEnv

export interface Project {
  id: string
  /** UI-da görünən ad */
  name: string
  /** repo kökü — içində `supabase/` qovluğu var */
  path: string
  /** `config.toml`-dakı `project_id`; konteyner adlarının şəkilçisi budur */
  projectId: string
  /** `env()` referenslərinin oxunduğu fayl, repo kökünə nisbətən. Default: `.env` */
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
  /** bayt; ölçülməyibsə null */
  memory: number | null
  /** host-un ümumi yaddaşı — faiz hesablamaq üçün */
  memoryLimit: number | null
}

/** Uzaq serverdəki bir konteyner. */
export interface RemoteService {
  container: string
  /** `supabase-db-xxxx` → `db`; tanınmasa konteyner adı */
  key: string
  state: string
  health: string | null
  memory: number | null
  memoryLimit: number | null
}

export interface StackStatus {
  projectId: string
  /** ən azı bir konteyner işləyir */
  running: boolean
  services: ServiceStatus[]
  /** `supabase status -o json` çıxışı — stack qalxmayıbsa boş */
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

/** `config.toml`-un bir açarının UI metadata-sı. Formalar bundan doğulur. */
export interface ConfigField {
  /** nöqtəli yol, məs. `auth.jwt_expiry` */
  path: string
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'enum'
  group: ConfigGroup
  label: string
  help?: string
  /** `type: 'enum'` üçün */
  options?: string[]
  default?: ConfigValue
  /** dəyişiklik `supabase stop && start` tələb edir */
  restartRequired?: boolean
  /** dəyər `env(VAR)` ola bilər */
  envAllowed?: boolean
  /** bu açar sirrdir — UI-da maskalanır */
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

/** UI-a verilən dəyər: ya literal, ya da `env(VAR)` referensi. */
export interface FieldValue {
  kind: 'literal' | 'env'
  /** kind === 'literal' üçün dəyər; 'env' üçün dəyişənin adı */
  value: ConfigValue
  /** kind === 'env' olduqda `.env`-dəki hazırkı dəyər (maskalana bilər) */
  envValue?: string | null
  present: boolean
}

export interface ConfigDocument {
  path: string
  raw: string
  values: Record<string, FieldValue>
}

/** Bir yamaq əməliyyatı: `undefined` value = açarı sil. */
export interface ConfigPatch {
  path: string
  value: ConfigValue | { env: string } | undefined
}

export interface PatchPreview {
  before: string
  after: string
  /** dəyişən sətirlərin sayı */
  changedLines: number
  restartRequired: boolean
}

/* ---------------------------------------------------------------- auth */

export interface AuthProviderMeta {
  /** `config.toml`-dakı ad, məs. `linkedin_oidc` */
  id: string
  label: string
  /** hansı sahələr göstərilsin */
  fields: Array<'client_id' | 'secret' | 'url' | 'redirect_uri' | 'skip_nonce_check' | 'email_optional'>
  /** provider konsolunda callback URL-in harada yazıldığını izah edir */
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
  /** `secret: true` olan sahələr üçün UI-a maskalanmış gəlir */
  value: string
  masked: boolean
  /** `config.toml`-da bu dəyişənə istinad edən açarlar */
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
  /** fayl yolu — yoxdursa ledger-də olub faylı olmayan sətirdir */
  file: string | null
  inFiles: boolean
  appliedLocal: boolean
  /** null = remote konfiqurasiya olunmayıb və ya əlçatmazdır */
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
  /** qovluğun bütün fayllarının sha256-sı */
  hash: string
  verifyJwt: boolean
  files: number
  remote: RemoteFunctionInfo | null
}

export interface RemoteFunctionInfo {
  name: string
  version: number | null
  status: string | null
  updatedAt: string | null
  verifyJwt: boolean | null
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
  /** bu ox üzrə fərq varmı */
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
  /** hansı iş axını — `stack:next-cv`, `deploy:prod`, `fn:serve:notify-message` */
  stream: string
  level: LogLevel
  text: string
  at: string
}

export interface TaskResult {
  ok: boolean
  code: number | null
  /** birləşdirilmiş stdout+stderr, sonuncu 200 sətir */
  output: string
  error: string | null
}

/* ---------------------------------------------------------------- sql */

/** Bir sətir — bütün xanalar mətndir (bax: `sql/build.ts` TEXT_TYPES). */
export type DbRow = Array<string | null>
/** Sütun adı → dəyər. `null` = SQL NULL; açar yoxdursa = «default». */
export type DbCells = Record<string, string | null>

export interface SqlColumn {
  name: string
  typeOid: number
  /** `pg_type.typname`; tanınmasa `oid:<n>` */
  typeName: string
}

export interface SqlResult {
  /** `SELECT`, `INSERT`, `CREATE TABLE`, … */
  command: string | null
  columns: SqlColumn[]
  rows: DbRow[]
  rowCount: number | null
  /** `maxRows` limitinə görə kəsilib */
  truncated: boolean
}

export interface SqlErrorInfo {
  message: string
  code: string | null
  severity: string | null
  detail: string | null
  hint: string | null
  /** 0-əsaslı simvol ofseti — redaktorda səhv tokeni işarələmək üçün */
  position: number | null
  where: string | null
  table: string | null
  column: string | null
  constraint: string | null
}

export interface SqlRun {
  ok: boolean
  /** Çoxifadəli skript üçün hər ifadəyə bir nəticə */
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
  /** `pg_*`, `information_schema` və Supabase-in daxili sxemləri */
  system: boolean
}

/** r=cədvəl p=partisiyalı v=görünüş m=materializə f=xarici */
export type DbRelKind = 'r' | 'p' | 'v' | 'm' | 'f'

export interface DbTable {
  schema: string
  name: string
  kind: DbRelKind
  /** `reltuples` təxmini; PG14+ analiz olunmayıbsa -1 */
  estimate: number
  bytes: number
  rls: boolean
  comment: string | null
  editable: boolean
  /** `editable: false` olduqda səbəb, məs. «PK yoxdur» */
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
  /** null = PK-nın hissəsi deyil; rəqəm = PK-dakı sırası */
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
  /** `isnull`/`notnull` üçün nəzərə alınmır */
  value: string | null
}

export interface DbOrder {
  column: string
  dir: 'asc' | 'desc'
}

export interface DbRowsPage {
  columns: DbColumn[]
  rows: DbRow[]
  /** null = dəqiq say hesablanmadı (cədvəl böyükdür) */
  total: number | null
  editable: boolean
  editableReason: string | null
}

export interface DbCompletion {
  tables: Array<{ schema: string; table: string; columns: string[] }>
}
