/**
 * IPC kontraktı. Kanal adları və hər kanalın giriş/çıxış tipləri burada,
 * bir yerdə saxlanılır — main handler-i və renderer çağırışı eyni tipi görür.
 */
import type {
  BackupInfo,
  ConfigDocument,
  ConfigPatch,
  DeployPlan,
  EnvEntry,
  FunctionInfo,
  HealthReport,
  LogLine,
  MigrationReport,
  PatchPreview,
  PortConflict,
  Project,
  RemoteEnv,
  RemoteService,
  StackStatus,
  SyncReport,
  TaskResult,
  VerifyReport
} from './types.js'

export interface IpcContract {
  /* --- layihələr --- */
  'projects:list': { req: void; res: Project[] }
  'projects:add': { req: { path: string }; res: Project }
  'projects:remove': { req: { id: string }; res: void }
  'projects:update': { req: { id: string; patch: Partial<Project> }; res: Project }
  /** Qovluq seçimi dialoqu; ləğv edilsə null */
  'projects:pickFolder': { req: void; res: string | null }
  /** Qovluqda `supabase/config.toml` varmı, `project_id` nədir */
  'projects:inspect': {
    req: { path: string }
    res: { valid: boolean; projectId: string | null; reason: string | null }
  }

  /* --- stack --- */
  'stack:status': { req: { id: string; withStats?: boolean }; res: StackStatus }
  /** `config.toml`-dakı `<servis>.enabled` açarını yaz; restart tələb edir */
  'stack:setService': {
    req: { id: string; configPath: string; on: boolean }
    res: { restartRequired: true }
  }
  'stack:start': { req: { id: string }; res: TaskResult }
  'stack:stop': { req: { id: string; noBackup?: boolean }; res: TaskResult }
  'stack:restart': { req: { id: string }; res: TaskResult }
  'stack:reset': { req: { id: string; confirm: string }; res: TaskResult }
  'stack:openUrl': { req: { url: string }; res: void }
  /** Konteyner loglarını `log:line` hadisəsi kimi axıtmağa başla/dayan */
  'stack:tailLogs': { req: { id: string; container: string; on: boolean }; res: void }

  /* --- portlar --- */
  'ports:conflicts': { req: void; res: PortConflict[] }
  /** Boş 100-lük aralıq təklif et, məs. 573 → 573xx */
  'ports:suggestRange': { req: void; res: number }

  /* --- config.toml --- */
  'config:read': { req: { id: string }; res: ConfigDocument }
  'config:preview': { req: { id: string; patches: ConfigPatch[] }; res: PatchPreview }
  'config:write': { req: { id: string; patches: ConfigPatch[] }; res: PatchPreview }

  /* --- .env --- */
  'env:read': { req: { id: string; reveal?: boolean }; res: EnvEntry[] }
  'env:write': { req: { id: string; entries: Array<{ key: string; value: string }> }; res: void }
  'env:delete': { req: { id: string; key: string }; res: void }

  /* --- miqrasiyalar --- */
  'migrations:report': { req: { id: string; envId: string | null }; res: MigrationReport }
  'migrations:new': { req: { id: string; name: string }; res: { file: string } }
  'migrations:up': { req: { id: string }; res: TaskResult }
  'migrations:diff': { req: { id: string }; res: { sql: string } }
  'migrations:repair': {
    req: { id: string; envId: string; version: string; status: 'applied' | 'reverted' }
    res: TaskResult
  }

  /* --- funksiyalar --- */
  'functions:list': { req: { id: string; envId: string | null }; res: FunctionInfo[] }
  'functions:create': { req: { id: string; name: string }; res: { path: string } }
  'functions:setVerifyJwt': { req: { id: string; name: string; verifyJwt: boolean }; res: void }
  'functions:serve': { req: { id: string; on: boolean }; res: void }

  /* --- mühitlər --- */
  'envs:upsert': { req: { id: string; env: RemoteEnv }; res: Project }
  'envs:remove': { req: { id: string; envId: string }; res: Project }
  'envs:setToken': { req: { id: string; envId: string; token: string }; res: void }
  'envs:ping': { req: { id: string; envId: string }; res: HealthReport }

  /* --- sync / deploy --- */
  'sync:report': { req: { id: string; envId: string }; res: SyncReport }
  'sync:deploy': { req: { id: string; plan: DeployPlan; confirm: string }; res: TaskResult }
  'remote:backup': { req: { id: string; envId: string }; res: BackupInfo }
  'remote:verify': { req: { id: string; envId: string }; res: VerifyReport }
  /** Uzaq serverdəki konteynerlər — vəziyyət və RAM */
  'remote:services': { req: { id: string; envId: string }; res: RemoteService[] }
  /** Uzaq konteyneri dayandır / başlat */
  'remote:setService': {
    req: { id: string; envId: string; container: string; on: boolean }
    res: TaskResult
  }

  /* --- sistem --- */
  'system:doctor': {
    req: void
    res: Array<{ label: string; ok: boolean; info: string }>
  }
}

export type IpcChannel = keyof IpcContract
export type IpcReq<C extends IpcChannel> = IpcContract[C]['req']
export type IpcRes<C extends IpcChannel> = IpcContract[C]['res']

/** main → renderer push hadisələri */
export interface IpcEvents {
  'log:line': LogLine
  'stack:changed': { projectId: string }
  'task:progress': { stream: string; step: string; pct: number | null }
}

export type IpcEventName = keyof IpcEvents

export const IPC_CHANNELS: IpcChannel[] = [
  'projects:list',
  'projects:add',
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
  'system:doctor'
]

export const IPC_EVENTS: IpcEventName[] = ['log:line', 'stack:changed', 'task:progress']
