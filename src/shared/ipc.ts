/**
 * The IPC contract. Channel names and the input/output types of every channel
 * live here, in one place — the main handler and the renderer call see the same type.
 */
import type {
  AuthUserDetail,
  AuthUsersPage,
  AuthUsersQuery,
  BackupInfo,
  BackupOptions,
  BackupRecord,
  DbCells,
  DbColumn,
  DbCompletion,
  DbFilter,
  DbOrder,
  DbRow,
  DbRowsPage,
  DbSchema,
  DbTable,
  ConfigDocument,
  ConfigPatch,
  DeployPlan,
  EnvEntry,
  FunctionDiff,
  FunctionInfo,
  HealthReport,
  Job,
  JobInput,
  LogLine,
  MigrationReport,
  PatchPreview,
  PortConflict,
  Project,
  RemoteEnv,
  RestoreOptions,
  RestoreResult,
  RemoteService,
  SavedQuery,
  SqlRun,
  StackStatus,
  StorageConnection,
  StorageConnectionInput,
  StorageObject,
  StorageTestReport,
  SyncReport,
  TaskResult,
  VerifyReport
} from './types/index.js'

export interface IpcContract {
  /* --- projects --- */
  'projects:list': { req: void; res: Project[] }
  'projects:add': { req: { path: string }; res: Project }
  /** Runs `supabase init` from scratch in the chosen folder and registers the project */
  'projects:create': {
    req: { path: string; name?: string; portBase?: number }
    res: Project
  }
  'projects:remove': { req: { id: string }; res: void }
  'projects:update': { req: { id: string; patch: Partial<Project> }; res: Project }
  /** Folder picker dialog; null when cancelled */
  'projects:pickFolder': { req: void; res: string | null }
  /** Whether the folder has `supabase/config.toml`, and what `project_id` is */
  'projects:inspect': {
    req: { path: string }
    res: { valid: boolean; projectId: string | null; reason: string | null }
  }

  /* --- stack --- */
  'stack:status': { req: { id: string; withStats?: boolean }; res: StackStatus }
  /** Write the `<service>.enabled` key in `config.toml`; needs a restart */
  'stack:setService': {
    req: { id: string; configPath: string; on: boolean }
    res: { restartRequired: true }
  }
  'stack:start': { req: { id: string }; res: TaskResult }
  'stack:stop': { req: { id: string; noBackup?: boolean }; res: TaskResult }
  'stack:restart': { req: { id: string }; res: TaskResult }
  'stack:reset': { req: { id: string; confirm: string }; res: TaskResult }
  'stack:openUrl': { req: { url: string }; res: void }
  /** Start/stop streaming container logs as `log:line` events */
  'stack:tailLogs': { req: { id: string; container: string; on: boolean }; res: void }

  /* --- ports --- */
  'ports:conflicts': { req: void; res: PortConflict[] }
  /** Suggest a free block of 100, e.g. 573 → 573xx */
  'ports:suggestRange': { req: void; res: number }

  /* --- config.toml --- */
  'config:read': { req: { id: string }; res: ConfigDocument }
  'config:preview': { req: { id: string; patches: ConfigPatch[] }; res: PatchPreview }
  'config:write': { req: { id: string; patches: ConfigPatch[] }; res: PatchPreview }

  /* --- .env --- */
  'env:read': { req: { id: string; reveal?: boolean }; res: EnvEntry[] }
  'env:write': { req: { id: string; entries: Array<{ key: string; value: string }> }; res: void }
  'env:delete': { req: { id: string; key: string }; res: void }

  /* --- migrations --- */
  'migrations:report': { req: { id: string; envId: string | null }; res: MigrationReport }
  'migrations:new': { req: { id: string; name: string }; res: { file: string } }
  'migrations:up': { req: { id: string }; res: TaskResult }
  'migrations:diff': { req: { id: string }; res: { sql: string } }
  'migrations:repair': {
    req: { id: string; envId: string; version: string; status: 'applied' | 'reverted' }
    res: TaskResult
  }

  /* --- functions --- */
  'functions:list': { req: { id: string; envId: string | null }; res: FunctionInfo[] }
  /** The local ↔ remote content diff of one function (file by file) */
  'functions:diff': { req: { id: string; envId: string; name: string }; res: FunctionDiff }
  'functions:create': { req: { id: string; name: string }; res: { path: string } }
  'functions:setVerifyJwt': { req: { id: string; name: string; verifyJwt: boolean }; res: void }
  'functions:serve': { req: { id: string; on: boolean }; res: void }

  /* --- environments --- */
  'envs:upsert': { req: { id: string; env: RemoteEnv }; res: Project }
  'envs:remove': { req: { id: string; envId: string }; res: Project }
  'envs:setToken': { req: { id: string; envId: string; token: string }; res: void }
  'envs:ping': { req: { id: string; envId: string }; res: HealthReport }

  /* --- sync / deploy --- */
  'sync:report': { req: { id: string; envId: string }; res: SyncReport }
  'sync:deploy': { req: { id: string; plan: DeployPlan; confirm: string }; res: TaskResult }
  'remote:backup': { req: { id: string; envId: string }; res: BackupInfo }
  'remote:verify': { req: { id: string; envId: string }; res: VerifyReport }
  /** Containers on the remote server — state and RAM */
  'remote:services': { req: { id: string; envId: string }; res: RemoteService[] }
  /** Stop / start a remote container */
  'remote:setService': {
    req: { id: string; envId: string; container: string; on: boolean }
    res: TaskResult
  }

  /* --- SQL editor --- */
  /**
   * Execute SQL. A failing query DOES NOT THROW — the error is in `res.error` so
   * that `position`/`hint`/`detail` survive (the router only returns `string`).
   */
  'sql:execute': {
    req: {
      id: string
      /** null = the local Postgres; otherwise an environment from `Project.environments` */
      envId: string | null
      sql: string
      readOnly: boolean
      maxRows: number
      timeoutMs: number
      /** A random token for cancellation. Local only. */
      token?: string
    }
    res: SqlRun
  }
  'sql:cancel': { req: { id: string; token: string }; res: { cancelled: boolean } }
  /** Write the SQL from the editor into a new timestamped migration file */
  'sql:saveAsMigration': { req: { id: string; name: string; sql: string }; res: { file: string } }

  /* --- saved queries (supabase/.locabase/queries) --- */
  'queries:list': { req: { id: string }; res: SavedQuery[] }
  'queries:read': { req: { id: string; name: string }; res: { name: string; sql: string } }
  'queries:write': { req: { id: string; name: string; sql: string }; res: SavedQuery }
  'queries:rename': { req: { id: string; name: string; to: string }; res: SavedQuery }
  'queries:remove': { req: { id: string; name: string }; res: void }

  /* --- table editor --- */
  'db:schemas': {
    req: { id: string; envId: string | null; includeSystem?: boolean }
    res: DbSchema[]
  }
  'db:tables': { req: { id: string; envId: string | null; schema: string }; res: DbTable[] }
  'db:columns': {
    req: { id: string; envId: string | null; schema: string; table: string }
    res: DbColumn[]
  }
  /** Every schema/table/column name, for autocompletion */
  'db:completion': { req: { id: string; envId: string | null }; res: DbCompletion }
  'db:rows': {
    req: {
      id: string
      envId: string | null
      schema: string
      table: string
      limit: number
      offset: number
      orderBy: DbOrder | null
      filters: DbFilter[]
      /** On a large table `count(*)` only runs when explicitly requested */
      exactCount?: boolean
    }
    res: DbRowsPage
  }
  'db:insertRow': {
    req: { id: string; envId: string | null; schema: string; table: string; values: DbCells }
    res: { row: DbRow }
  }
  'db:updateRow': {
    req: {
      id: string
      envId: string | null
      schema: string
      table: string
      pk: DbCells
      patch: DbCells
    }
    res: { row: DbRow }
  }
  'db:deleteRows': {
    req: { id: string; envId: string | null; schema: string; table: string; pks: DbCells[] }
    res: { deleted: number }
  }

  /* --- auth --- */
  /** The GoTrue user table, filtered and paged */
  'auth:users': { req: { id: string } & AuthUsersQuery; res: AuthUsersPage }
  /** One user with metadata and identities, for the detail panel */
  'auth:user': { req: { id: string; envId: string | null; userId: string }; res: AuthUserDetail }
  /** Ban (a far-future `banned_until`) or lift a ban; a ban also drops sessions */
  'auth:setBanned': {
    req: { id: string; envId: string | null; userId: string; banned: boolean }
    res: { bannedUntil: string | null }
  }
  /** Delete the user. Fails loudly if an application table still references them. */
  'auth:deleteUser': {
    req: { id: string; envId: string | null; userId: string }
    res: { deleted: number }
  }

  /* --- storage connections (app-wide, not per project) --- */
  'storage:list': { req: void; res: StorageConnection[] }
  /** Create or update; the secret key is only sent when it changes. */
  'storage:upsert': {
    req: { conn: StorageConnectionInput; secretAccessKey?: string }
    res: StorageConnection
  }
  'storage:remove': { req: { storageId: string }; res: void }
  /** Signs a real request against the bucket — credentials are checked, not guessed. */
  'storage:test': { req: { storageId: string }; res: StorageTestReport }
  'storage:objects': {
    req: { storageId: string; prefix?: string; limit?: number }
    res: StorageObject[]
  }

  /* --- backups --- */
  /** Every backup of this project, newest first. */
  'backups:list': { req: { id: string }; res: BackupRecord[] }
  /** Take one now — the same engine the scheduler uses. */
  'backups:run': { req: { id: string } & BackupOptions; res: BackupRecord }
  'backups:remove': { req: { backupId: string; deleteFile: boolean }; res: void }
  /** Show the dump in Finder / Explorer. */
  'backups:reveal': { req: { backupId: string }; res: void }
  /** Re-upload a kept local dump to a storage connection. */
  'backups:upload': { req: { backupId: string; storageId: string }; res: BackupRecord }
  /**
   * Load a dump into a database. Destructive: `confirm` must be the target
   * environment's name. A failed restore comes back in `res.error`, not as a throw.
   */
  'backups:restore': { req: RestoreOptions; res: RestoreResult }

  /* --- scheduler jobs --- */
  'jobs:list': { req: { id: string }; res: Job[] }
  'jobs:upsert': { req: { job: JobInput }; res: Job }
  'jobs:remove': { req: { jobId: string }; res: void }
  'jobs:setEnabled': { req: { jobId: string; enabled: boolean }; res: Job }
  /** Run a job right now, outside its schedule. */
  'jobs:runNow': { req: { jobId: string }; res: BackupRecord }

  /* --- system --- */
  'system:doctor': {
    req: void
    res: Array<{ label: string; ok: boolean; info: string }>
  }
  /**
   * Mirrors the interface theme onto Electron's `nativeTheme` — the title bar,
   * the traffic lights and the native menus, which CSS cannot reach — and
   * remembers it for the next launch's very first frame.
   */
  'system:setTheme': { req: { theme: 'system' | 'dark' | 'light' }; res: void }
}

export type IpcChannel = keyof IpcContract
export type IpcReq<C extends IpcChannel> = IpcContract[C]['req']
export type IpcRes<C extends IpcChannel> = IpcContract[C]['res']

/** main → renderer push events */
export interface IpcEvents {
  'log:line': LogLine
  'stack:changed': { projectId: string }
  /** A backup started, finished or was deleted — the Backups screen reloads. */
  'backups:changed': { projectId: string }
  /** A job was saved, removed, or its run state changed. */
  'jobs:changed': { projectId: string }
  'task:progress': { stream: string; step: string; pct: number | null }
}

export type IpcEventName = keyof IpcEvents

export const IPC_CHANNELS: IpcChannel[] = [
  'projects:list',
  'projects:add',
  'projects:create',
  'projects:remove',
  'projects:update',
  'projects:pickFolder',
  'projects:inspect',
  'stack:status',
  'stack:setService',
  'stack:start',
  'stack:stop',
  'stack:restart',
  'stack:reset',
  'stack:openUrl',
  'stack:tailLogs',
  'ports:conflicts',
  'ports:suggestRange',
  'config:read',
  'config:preview',
  'config:write',
  'env:read',
  'env:write',
  'env:delete',
  'migrations:report',
  'migrations:new',
  'migrations:up',
  'migrations:diff',
  'migrations:repair',
  'functions:list',
  'functions:diff',
  'functions:create',
  'functions:setVerifyJwt',
  'functions:serve',
  'envs:upsert',
  'envs:remove',
  'envs:setToken',
  'envs:ping',
  'sync:report',
  'sync:deploy',
  'remote:backup',
  'remote:verify',
  'remote:services',
  'remote:setService',
  'sql:execute',
  'sql:cancel',
  'sql:saveAsMigration',
  'queries:list',
  'queries:read',
  'queries:write',
  'queries:rename',
  'queries:remove',
  'db:schemas',
  'db:tables',
  'db:columns',
  'db:completion',
  'db:rows',
  'db:insertRow',
  'db:updateRow',
  'db:deleteRows',
  'auth:users',
  'auth:user',
  'auth:setBanned',
  'auth:deleteUser',
  'storage:list',
  'storage:upsert',
  'storage:remove',
  'storage:test',
  'storage:objects',
  'backups:list',
  'backups:run',
  'backups:remove',
  'backups:reveal',
  'backups:upload',
  'backups:restore',
  'jobs:list',
  'jobs:upsert',
  'jobs:remove',
  'jobs:setEnabled',
  'jobs:runNow',
  'system:doctor',
  'system:setTheme'
]

export const IPC_EVENTS: IpcEventName[] = [
  'log:line',
  'stack:changed',
  'task:progress',
  'backups:changed',
  'jobs:changed'
]
