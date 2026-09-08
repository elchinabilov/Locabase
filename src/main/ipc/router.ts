/**
 * IPC marşrutlayıcısı. Hər kanal `IpcContract`-dakı tipə uyğun bir handler-dir;
 * atılan istisna renderer tərəfdə `{ ok: false, error }` kimi görünür.
 */
import { dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { IPC_CHANNELS, type IpcChannel, type IpcContract } from '@shared/ipc.js'
import { logBus } from '../core/log.js'
import * as projects from '../core/projects.js'
import * as scaffold from '../core/scaffold.js'
import * as stack from '../core/stack.js'
import * as ports from '../core/ports.js'
import * as config from '../core/config.js'
import * as envfile from '../core/envfile.js'
import * as docker from '../core/docker.js'
import * as migrations from '../core/migrations.js'
import * as functions from '../core/functions.js'
import * as sync from '../core/sync.js'
import * as secrets from '../core/secrets.js'
import * as sql from '../core/sql/index.js'
import * as queries from '../core/queries.js'
import { adapterFor } from '../core/remote/index.js'
import { logBus as bus } from '../core/log.js'
import type { EnvEntry } from '@shared/types.js'
import { scanToml } from '../core/toml/scan.js'
import { readFileSync } from 'node:fs'

type Handlers = { [C in IpcChannel]: (req: IpcContract[C]['req']) => Promise<IpcContract[C]['res']> }

/** `config.toml`-da hansı açarlar bu env dəyişəninə istinad edir. */
function envReferences(projectPath: string): Map<string, string[]> {
  const raw = readFileSync(projectPath, 'utf8')
  const scan = scanToml(raw)
  const out = new Map<string, string[]>()
  for (const entry of scan.entries) {
    const value = raw.slice(entry.valueStart, entry.valueEnd)
    const m = /^"env\(([A-Za-z_][A-Za-z0-9_]*)\)"$/.exec(value)
    if (!m) continue
    const key = m[1]!
    out.set(key, [...(out.get(key) ?? []), entry.path])
  }
  return out
}

const handlers: Handlers = {
  /* --- layihələr --- */
  'projects:list': async () => projects.list(),
  'projects:add': async ({ path }) => projects.add(path),
  'projects:create': async ({ path, name, portBase }) => scaffold.create({ path, name, portBase }),
  'projects:remove': async ({ id }) => projects.remove(id),
  'projects:update': async ({ id, patch }) => projects.update(id, patch),
  'projects:inspect': async ({ path }) => projects.inspect(path),
  'projects:pickFolder': async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  },

  /* --- stack --- */
  'stack:status': async ({ id, withStats }) => stack.status(id, withStats ?? false),
  'stack:setService': async ({ id, configPath, on }) => stack.setService(id, configPath, on),
  'stack:start': async ({ id }) => stack.start(id),
  // Stack dayananda/yenidən qalxanda hovuzdakı bağlantılar ölür — atırıq
  'stack:stop': async ({ id, noBackup }) => {
    try {
      return await stack.stop(id, noBackup ?? true)
    } finally {
      sql.invalidate(id)
    }
  },
  'stack:restart': async ({ id }) => {
    try {
      return await stack.restart(id)
    } finally {
      sql.invalidate(id)
    }
  },
  'stack:reset': async ({ id, confirm }) => {
    try {
      return await stack.reset(id, confirm)
    } finally {
      sql.invalidate(id)
      sql.introspect.forgetColumns(id)
    }
  },
  'stack:openUrl': async ({ url }) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Yalnız http/https ünvanları açıla bilər')
    await shell.openExternal(url)
  },
  'stack:tailLogs': async ({ id, container, on }) => {
    const project = projects.get(id)
    await docker.tailLogs(container, stack.streamFor(project.projectId), on)
  },

  /* --- portlar --- */
  'ports:conflicts': async () => ports.conflicts(),
  'ports:suggestRange': async () => ports.suggestRange(),

  /* --- config --- */
  'config:read': async ({ id }) => config.read(id),
  'config:preview': async ({ id, patches }) => config.preview(id, patches),
  'config:write': async ({ id, patches }) => config.write(id, patches),

  /* --- .env --- */
  'env:read': async ({ id, reveal }): Promise<EnvEntry[]> => {
    const project = projects.get(id)
    const refs = envReferences(projects.paths.configToml(project))
    const entries = envfile.readRaw(projects.paths.envFile(project)).entries
    return entries.map((e) => {
      const isSecret = /secret|token|key|pass|sid/i.test(e.key)
      return {
        key: e.key,
        value: isSecret && !reveal ? envfile.mask(e.value) : e.value,
        masked: isSecret && !reveal,
        referencedBy: refs.get(e.key) ?? []
      }
    })
  },
  'env:write': async ({ id, entries }) => {
    envfile.writeKeys(projects.paths.envFile(projects.get(id)), entries)
  },
  'env:delete': async ({ id, key }) => {
    envfile.deleteKey(projects.paths.envFile(projects.get(id)), key)
  },

  /* --- mühitlər --- */
  'envs:upsert': async ({ id, env }) => projects.upsertEnv(id, env),
  'envs:remove': async ({ id, envId }) => {
    for (const key of [
      secrets.keys.managedToken(envId),
      secrets.keys.dbPassword(envId),
      secrets.keys.sshPassphrase(envId)
    ]) {
      secrets.remove(key)
    }
    return projects.removeEnv(id, envId)
  },
  'envs:setToken': async ({ id, envId, token }) => {
    const env = projects.getEnv(id, envId)
    secrets.set(secrets.keys.managedToken(envId), token)
    if (env.kind === 'managed') projects.upsertEnv(id, { ...env, hasToken: true })
  },
  'envs:ping': async ({ id, envId }) =>
    adapterFor(projects.get(id), projects.getEnv(id, envId)).ping(),

  /* --- miqrasiyalar --- */
  'migrations:report': async ({ id, envId }) => migrations.report(id, envId),
  'migrations:new': async ({ id, name }) => migrations.create(id, name),
  'migrations:up': async ({ id }) => migrations.up(id),
  'migrations:diff': async ({ id }) => migrations.diff(id),
  'migrations:repair': async ({ id, envId, version, status }) =>
    migrations.repair(id, envId, version, status),

  /* --- funksiyalar --- */
  'functions:list': async ({ id, envId }) => functions.list(id, envId),
  'functions:diff': async ({ id, envId, name }) => functions.diff(id, envId, name),
  'functions:create': async ({ id, name }) => functions.create(id, name),
  'functions:setVerifyJwt': async ({ id, name, verifyJwt }) =>
    functions.setVerifyJwt(id, name, verifyJwt),
  'functions:serve': async ({ id, on }) => functions.serve(id, on),

  /* --- sync / deploy --- */
  'sync:report': async ({ id, envId }) => sync.report(id, envId),
  'sync:deploy': async ({ id, plan, confirm }) => sync.deploy(id, plan, confirm),
  'remote:backup': async ({ id, envId }) => {
    const env = projects.getEnv(id, envId)
    const adapter = adapterFor(projects.get(id), env)
    return adapter.backup((t) => bus.push(`remote:${env.name}`, 'info', t))
  },
  'remote:verify': async ({ id, envId }) =>
    adapterFor(projects.get(id), projects.getEnv(id, envId)).verify(),
  'remote:services': async ({ id, envId }) =>
    adapterFor(projects.get(id), projects.getEnv(id, envId)).listServices(),
  'remote:setService': async ({ id, envId, container, on }) => {
    const env = projects.getEnv(id, envId)
    const adapter = adapterFor(projects.get(id), env)
    try {
      await adapter.setServiceState(container, on, (t) =>
        bus.push(`remote:${env.name}`, 'info', t)
      )
      return { ok: true, code: 0, output: `${container} → ${on ? 'start' : 'stop'}`, error: null }
    } catch (err) {
      return { ok: false, code: null, output: '', error: (err as Error).message }
    }
  },

  /* --- SQL redaktoru --- */
  'sql:execute': async ({ id, envId, sql: text, readOnly, maxRows, timeoutMs, token }) => {
    const run = await sql.execute(id, text, { envId, readOnly, maxRows, timeoutMs, token })
    // DDL sxemi dəyişdirmiş ola bilər — sütun keşi köhnəlir
    if (run.ok && !readOnly) sql.introspect.forgetColumns(id, envId)
    return run
  },
  'sql:cancel': async ({ id, token }) => sql.cancel(id, token),
  'sql:saveAsMigration': async ({ id, name, sql: text }) =>
    migrations.createWithBody(id, name, text),

  /* --- saxlanmış sorğular --- */
  'queries:list': async ({ id }) => queries.list(id),
  'queries:read': async ({ id, name }) => queries.read(id, name),
  'queries:write': async ({ id, name, sql: text }) => queries.write(id, name, text),
  'queries:rename': async ({ id, name, to }) => queries.rename(id, name, to),
  'queries:remove': async ({ id, name }) => queries.remove(id, name),

  /* --- cədvəl redaktoru --- */
  'db:schemas': async ({ id, envId, includeSystem }) =>
    sql.introspect.schemas(id, envId, includeSystem ?? false),
  'db:tables': async ({ id, envId, schema }) => sql.introspect.tables(id, envId, schema),
  'db:columns': async ({ id, envId, schema, table }) =>
    sql.introspect.columns(id, envId, schema, table),
  'db:completion': async ({ id, envId }) => sql.introspect.completion(id, envId),
  'db:rows': async ({ id, ...req }) => sql.selectRows(id, req),
  'db:insertRow': async ({ id, envId, schema, table, values }) =>
    sql.insertRow(id, envId, schema, table, values),
  'db:updateRow': async ({ id, envId, schema, table, pk, patch }) =>
    sql.updateRow(id, envId, schema, table, pk, patch),
  'db:deleteRows': async ({ id, envId, schema, table, pks }) =>
    sql.deleteRows(id, envId, schema, table, pks),

  /* --- sistem --- */
  'system:doctor': async () => stack.doctor()
}

export function registerIpc(): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, async (_event, req: unknown) => {
      try {
        const handler = handlers[channel] as (r: unknown) => Promise<unknown>
        return { ok: true, data: await handler(req) }
      } catch (err) {
        const message = (err as Error).message ?? String(err)
        logBus.push('app', 'error', `${channel}: ${message}`)
        return { ok: false, error: message }
      }
    })
  }
}

/** Log avtobusunu bütün pəncərələrə bağla. */
export function pipeEvents(): void {
  logBus.on('line', (line) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('log:line', line)
    }
  })
}
