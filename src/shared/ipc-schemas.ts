/**
 * Runtime validation for the IPC boundary.
 *
 * `IpcContract` in `ipc.ts` is erased at build time, so on its own it proves
 * nothing about what actually arrives from the renderer — and these payloads go
 * on to reach `spawn` argv arrays, filesystem paths and SQL identifier quoting.
 * Every channel therefore has a schema here, and `registerIpc` parses before it
 * dispatches.
 *
 * The map is typed `Record<IpcChannel, ZodType>`, so adding a channel to the
 * contract without adding a schema is a compile error rather than a hole.
 */
import { z } from 'zod'
import type { IpcChannel } from './ipc.js'

/* ------------------------------------------------------------- primitives */

/** Channels take no payload; the renderer sends `undefined`. */
const none = z.undefined().or(z.null()).transform(() => undefined)

const id = z.string().min(1).max(200)
const envId = z.string().min(1).max(200)
const envIdOrLocal = z.string().min(1).max(200).nullable()
const name = z.string().min(1).max(512)
/** SQL text and dump output are the only genuinely large payloads. */
const sqlText = z.string().max(5_000_000)
const count = z.number().int().nonnegative().max(1_000_000_000)

const configValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])

const configPatch = z.object({
  path: z.string().min(1).max(200),
  value: z.union([configValue, z.object({ env: z.string().max(200) }), z.undefined()])
})

const dbOp = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'isnull', 'notnull'])

const dbFilter = z.object({
  column: name,
  op: dbOp,
  value: z.string().max(100_000).nullable()
})

const dbOrder = z.object({ column: name, dir: z.enum(['asc', 'desc']) })

/** A row's cells. `null` is SQL NULL; a missing key means "use the default". */
const dbCells = z.record(z.string().max(512), z.string().max(1_000_000).nullable())

const backupScope = z.enum(['full', 'schema', 'data'])

const managedEnv = z.object({
  id: envId,
  name,
  kind: z.literal('managed'),
  projectRef: z.string().min(1).max(100),
  hasToken: z.boolean()
})

/**
 * `sshHost` and `sshKeyPath` end up in an `ssh`/`rsync` argv, where a leading
 * `-` is read as an option. `projects.upsertEnv` enforces the same rule; this is
 * the outer layer, so a bad value never reaches the registry at all.
 */
const selfHostedEnv = z.object({
  id: envId,
  name,
  kind: z.literal('self-hosted'),
  sshHost: z.string().regex(/^[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?$/, 'Invalid SSH host'),
  sshPort: z.number().int().min(1).max(65535),
  sshKeyPath: z.string().max(4096).refine((v) => !v.startsWith('-'), 'may not start with `-`'),
  dbContainer: z.string().max(255),
  remoteDir: z.string().max(4096),
  functionsContainer: z.string().max(255),
  apiUrl: z.string().max(2048),
  siteUrl: z.string().max(2048),
  backupDir: z.string().max(4096),
  backupRetentionDays: z.number().int().min(0).max(36500)
})

const remoteEnv = z.discriminatedUnion('kind', [managedEnv, selfHostedEnv])

const scheduleSpec = z.object({
  kind: z.enum(['interval', 'daily', 'weekly', 'cron']),
  everyMinutes: z.number().int().min(1).max(525600).optional(),
  at: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  expr: z.string().max(200).optional()
})

const jobInput = z.object({
  id: z.string().max(200).optional(),
  projectId: id,
  name,
  type: z.literal('backup'),
  enabled: z.boolean(),
  envId: envIdOrLocal,
  schedule: scheduleSpec,
  scope: backupScope,
  storageId: z.string().max(200).nullable(),
  keepLocal: z.boolean(),
  retentionDays: z.number().int().min(0).max(36500),
  retentionCount: z.number().int().min(0).max(100000)
})

const storageConnectionInput = z.object({
  id: z.string().max(200).optional(),
  name,
  provider: z.literal('r2'),
  accountId: z.string().max(200),
  bucket: z.string().max(255),
  region: z.string().max(64).optional(),
  prefix: z.string().max(1024).optional(),
  accessKeyId: z.string().max(512),
  secretAccessKey: z.string().max(512).optional()
})

const deployPlan = z.object({
  envId,
  steps: z.array(z.enum(['backup', 'migrations', 'functions', 'secrets', 'auth', 'verify'])),
  migrations: z.array(z.string().max(512)),
  functions: z.array(z.string().max(512)),
  secrets: z.array(z.string().max(512)),
  dryRun: z.boolean()
})

/**
 * `projects:update` is the one patch the renderer can send at a project. It is
 * deliberately narrow: `path`, `projectId`, `id` and `addedAt` are the
 * registry's own, and `envFile` is joined onto the project root before it is
 * handed to `fs`, so it must stay relative (`projects.update` proves
 * containment as well).
 */
const projectPatch = z.object({
  name: name.optional(),
  envFile: z
    .string()
    .min(1)
    .max(1024)
    .refine((v) => !v.includes('\0'), 'may not contain a NUL byte')
    .optional(),
  environments: z.array(remoteEnv).max(100).optional()
})

/* ---------------------------------------------------------------- schemas */

export const IPC_SCHEMAS = {
  /* --- projects --- */
  'projects:list': none,
  'projects:add': z.object({ path: z.string().min(1).max(4096) }),
  'projects:create': z.object({
    path: z.string().min(1).max(4096),
    name: name.optional(),
    portBase: z.number().int().min(1).max(655).optional()
  }),
  'projects:remove': z.object({ id }),
  'projects:update': z.object({ id, patch: projectPatch }),
  'projects:pickFolder': none,
  'projects:inspect': z.object({ path: z.string().min(1).max(4096) }),

  /* --- stack --- */
  'stack:status': z.object({ id, withStats: z.boolean().optional() }),
  'stack:setService': z.object({ id, configPath: z.string().min(1).max(200), on: z.boolean() }),
  'stack:start': z.object({ id }),
  'stack:stop': z.object({ id, noBackup: z.boolean().optional() }),
  'stack:restart': z.object({ id }),
  'stack:reset': z.object({ id, confirm: z.string().max(512) }),
  'stack:openUrl': z.object({ url: z.string().url().max(2048) }),
  'stack:tailLogs': z.object({ id, container: z.string().min(1).max(255), on: z.boolean() }),

  /* --- ports --- */
  'ports:conflicts': none,
  'ports:suggestRange': none,

  /* --- config.toml --- */
  'config:read': z.object({ id }),
  'config:preview': z.object({ id, patches: z.array(configPatch).max(500) }),
  'config:write': z.object({ id, patches: z.array(configPatch).max(500) }),

  /* --- .env --- */
  'env:read': z.object({ id, reveal: z.boolean().optional() }),
  'env:write': z.object({
    id,
    entries: z
      .array(z.object({ key: z.string().min(1).max(512), value: z.string().max(1_000_000) }))
      .max(1000)
  }),
  'env:delete': z.object({ id, key: z.string().min(1).max(512) }),

  /* --- migrations --- */
  'migrations:report': z.object({ id, envId: envIdOrLocal }),
  'migrations:new': z.object({ id, name }),
  'migrations:up': z.object({ id }),
  'migrations:diff': z.object({ id }),
  'migrations:repair': z.object({
    id,
    envId,
    version: z.string().min(1).max(200),
    status: z.enum(['applied', 'reverted'])
  }),

  /* --- functions --- */
  'functions:list': z.object({ id, envId: envIdOrLocal }),
  'functions:diff': z.object({ id, envId, name }),
  'functions:create': z.object({ id, name }),
  'functions:setVerifyJwt': z.object({ id, name, verifyJwt: z.boolean() }),
  'functions:serve': z.object({ id, on: z.boolean() }),

  /* --- environments --- */
  'envs:upsert': z.object({ id, env: remoteEnv }),
  'envs:remove': z.object({ id, envId }),
  'envs:setToken': z.object({ id, envId, token: z.string().max(8192) }),
  'envs:ping': z.object({ id, envId }),

  /* --- sync / deploy --- */
  'sync:report': z.object({ id, envId }),
  'sync:deploy': z.object({ id, plan: deployPlan, confirm: z.string().max(512) }),
  'remote:backup': z.object({ id, envId }),
  'remote:verify': z.object({ id, envId }),
  'remote:services': z.object({ id, envId }),
  'remote:setService': z.object({
    id,
    envId,
    container: z.string().min(1).max(255),
    on: z.boolean()
  }),

  /* --- SQL editor --- */
  'sql:execute': z.object({
    id,
    envId: envIdOrLocal,
    sql: sqlText,
    readOnly: z.boolean(),
    maxRows: z.number().int().min(1).max(1_000_000),
    timeoutMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
    token: z.string().max(200).optional()
  }),
  'sql:cancel': z.object({ id, token: z.string().min(1).max(200) }),
  'sql:saveAsMigration': z.object({ id, name, sql: sqlText }),

  /* --- saved queries --- */
  'queries:list': z.object({ id }),
  'queries:read': z.object({ id, name }),
  'queries:write': z.object({ id, name, sql: sqlText }),
  'queries:rename': z.object({ id, name, to: name }),
  'queries:remove': z.object({ id, name }),

  /* --- table editor --- */
  'db:schemas': z.object({ id, envId: envIdOrLocal, includeSystem: z.boolean().optional() }),
  'db:tables': z.object({ id, envId: envIdOrLocal, schema: name }),
  'db:columns': z.object({ id, envId: envIdOrLocal, schema: name, table: name }),
  'db:completion': z.object({ id, envId: envIdOrLocal }),
  'db:rows': z.object({
    id,
    envId: envIdOrLocal,
    schema: name,
    table: name,
    limit: z.number().int().min(1).max(100_000),
    offset: count,
    orderBy: dbOrder.nullable(),
    filters: z.array(dbFilter).max(100),
    exactCount: z.boolean().optional()
  }),
  'db:insertRow': z.object({ id, envId: envIdOrLocal, schema: name, table: name, values: dbCells }),
  'db:updateRow': z.object({
    id,
    envId: envIdOrLocal,
    schema: name,
    table: name,
    pk: dbCells,
    patch: dbCells
  }),
  'db:deleteRows': z.object({
    id,
    envId: envIdOrLocal,
    schema: name,
    table: name,
    pks: z.array(dbCells).max(10_000)
  }),

  /* --- auth --- */
  'auth:users': z.object({
    id,
    envId: envIdOrLocal,
    search: z.string().max(512).optional(),
    provider: z.string().max(100).nullable().optional(),
    status: z.enum(['all', 'confirmed', 'unconfirmed', 'anonymous', 'banned']).optional(),
    sort: z
      .enum(['created_desc', 'created_asc', 'signin_desc', 'signin_asc', 'email_asc'])
      .optional(),
    page: z.number().int().min(0).max(1_000_000).optional(),
    pageSize: z.number().int().min(1).max(1000).optional()
  }),
  'auth:user': z.object({ id, envId: envIdOrLocal, userId: z.string().min(1).max(200) }),
  'auth:setBanned': z.object({
    id,
    envId: envIdOrLocal,
    userId: z.string().min(1).max(200),
    banned: z.boolean()
  }),
  'auth:deleteUser': z.object({ id, envId: envIdOrLocal, userId: z.string().min(1).max(200) }),

  /* --- storage connections --- */
  'storage:list': none,
  'storage:upsert': z.object({
    conn: storageConnectionInput,
    secretAccessKey: z.string().max(512).optional()
  }),
  'storage:remove': z.object({ storageId: z.string().min(1).max(200) }),
  'storage:test': z.object({ storageId: z.string().min(1).max(200) }),
  'storage:objects': z.object({
    storageId: z.string().min(1).max(200),
    prefix: z.string().max(1024).optional(),
    limit: z.number().int().min(1).max(10_000).optional()
  }),

  /* --- backups --- */
  'backups:list': z.object({ id }),
  'backups:run': z.object({
    id,
    envId: envIdOrLocal,
    scope: backupScope.optional(),
    storageId: z.string().max(200).nullable().optional(),
    keepLocal: z.boolean().optional(),
    retentionDays: z.number().int().min(0).max(36500).optional(),
    retentionCount: z.number().int().min(0).max(100_000).optional()
  }),
  'backups:remove': z.object({
    backupId: z.string().min(1).max(200),
    deleteFile: z.boolean()
  }),
  'backups:reveal': z.object({ backupId: z.string().min(1).max(200) }),
  'backups:upload': z.object({
    backupId: z.string().min(1).max(200),
    storageId: z.string().min(1).max(200)
  }),
  'backups:restore': z.object({
    backupId: z.string().min(1).max(200),
    envId: envIdOrLocal,
    clean: z.boolean(),
    confirm: z.string().max(512)
  }),

  /* --- scheduler jobs --- */
  'jobs:list': z.object({ id }),
  'jobs:upsert': z.object({ job: jobInput }),
  'jobs:remove': z.object({ jobId: z.string().min(1).max(200) }),
  'jobs:setEnabled': z.object({ jobId: z.string().min(1).max(200), enabled: z.boolean() }),
  'jobs:runNow': z.object({ jobId: z.string().min(1).max(200) }),

  /* --- system --- */
  'system:doctor': none,
  'system:setTheme': z.object({ theme: z.enum(['system', 'dark', 'light']) })
} satisfies Record<IpcChannel, z.ZodTypeAny>

export type IpcSchemas = typeof IPC_SCHEMAS

/**
 * Parse a payload for one channel. Throws a `ZodError` whose message is already
 * readable — `registerIpc` turns it into the usual `{ ok: false, error }`.
 */
export function parseIpcRequest(channel: IpcChannel, req: unknown): unknown {
  return IPC_SCHEMAS[channel].parse(req)
}

/** A one-line summary of what was wrong — the full Zod dump is too noisy for a toast. */
export function describeIpcError(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
}
