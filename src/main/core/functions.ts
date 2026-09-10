/**
 * Edge functions. The local side is the `supabase/functions/<name>/` folder, the
 * remote side comes from the adapter. The difference between them is computed
 * from a content hash — the only reliable signal for whether a deploy is needed.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type {
  FunctionDiff,
  FunctionDrift,
  FunctionFileDiff,
  FunctionInfo,
  RemoteFile,
  RemoteFileChecksum
} from '@shared/types/index.js'
import { checksums, readTree } from './filetree.js'
import { get as getProject, getEnv, paths } from './projects.js'
import { adapterFor } from './remote/index.js'
import { write as writeConfig } from './config.js'
import { supabase } from './cli.js'
import { logBus } from './log.js'

/**
 * Content hash of a folder plus per-file md5s. Files are read once: the same
 * listing feeds both the overall hash and the comparison against the remote.
 */
export function hashDir(dir: string): {
  hash: string
  files: number
  checksums: RemoteFileChecksum[]
} {
  const sums = checksums(dir)
  const h = createHash('sha256')
  for (const f of sums) {
    h.update(f.path)
    h.update('\0')
    h.update(f.md5)
    h.update('\0')
  }
  return { hash: h.digest('hex').slice(0, 16), files: sums.length, checksums: sums }
}

/** Compare remote and local file md5s. */
function driftOf(local: RemoteFileChecksum[], remote: RemoteFileChecksum[]): FunctionDrift {
  const r = new Map(remote.map((f) => [f.path, f.md5]))
  if (local.length !== r.size) return 'changed'
  return local.every((f) => r.get(f.path) === f.md5) ? 'same' : 'changed'
}

function verifyJwtOf(configPath: string, name: string): boolean {
  try {
    const parsed = parseToml(readFileSync(configPath, 'utf8')) as {
      functions?: Record<string, { verify_jwt?: boolean }>
    }
    return parsed.functions?.[name]?.verify_jwt !== false
  } catch {
    return true
  }
}

export async function list(id: string, envId: string | null): Promise<FunctionInfo[]> {
  const project = getProject(id)
  const dir = paths.functionsDir(project)
  if (!existsSync(dir)) return []

  const configPath = paths.configToml(project)
  const localSums = new Map<string, RemoteFileChecksum[]>()
  const local: FunctionInfo[] = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e): FunctionInfo => {
      const path = join(dir, e.name)
      const { hash, files, checksums: sums } = hashDir(path)
      localSums.set(e.name, sums)
      const entrypoint = ['index.ts', 'index.js', 'main.ts'].find((f) => existsSync(join(path, f)))
      return {
        name: e.name,
        path,
        entrypoint: entrypoint ?? '(not found)',
        hash,
        files,
        verifyJwt: verifyJwtOf(configPath, e.name),
        remote: null,
        // until the remote listing is read, the difference is unknown
        drift: 'unknown'
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (!envId) return local

  try {
    const remote = await adapterFor(project, getEnv(id, envId)).listFunctions()
    const byName = new Map(remote.map((r) => [r.name, r]))
    for (const fn of local) {
      fn.remote = byName.get(fn.name) ?? null
      if (!fn.remote) {
        fn.drift = 'local-only'
        continue
      }
      // When the remote gives no file listing (managed) the difference is unknown —
      // "View diff" computes it on demand.
      fn.drift =
        fn.remote.files === null
          ? 'unknown'
          : driftOf(localSums.get(fn.name) ?? [], fn.remote.files)
    }
    for (const r of remote) {
      if (local.some((l) => l.name === r.name)) continue
      local.push({
        name: r.name,
        path: '',
        entrypoint: '(remote only)',
        hash: '',
        files: r.files?.length ?? 0,
        verifyJwt: r.verifyJwt ?? true,
        remote: r,
        drift: 'remote-only'
      })
    }
  } catch (err) {
    logBus.push('functions', 'warn', `Could not read remote functions: ${(err as Error).message}`)
  }
  return local
}

/**
 * The **content** diff between one function's local and remote copy. Remote files
 * are fetched on demand: over ssh for self-hosted, via `functions download` into
 * a temporary folder for managed.
 */
export async function diff(id: string, envId: string, name: string): Promise<FunctionDiff> {
  const project = getProject(id)
  const dir = join(paths.functionsDir(project), name)
  const localFiles = existsSync(dir) ? readTree(dir) : []
  let remoteFiles: RemoteFile[] = []
  try {
    remoteFiles = await adapterFor(project, getEnv(id, envId)).readFunction(name)
  } catch (err) {
    if (localFiles.length === 0) throw err
    // missing on the remote is fine — everything shows up as "local only"
    logBus.push(
      'functions',
      'warn',
      `${name}: could not read the remote source — ${(err as Error).message}`
    )
  }

  const byPath = new Map(remoteFiles.map((f) => [f.path, f]))
  const allPaths = [...new Set([...localFiles.map((f) => f.path), ...byPath.keys()])].sort()
  const files: FunctionFileDiff[] = allPaths.map((path) => {
    const l = localFiles.find((f) => f.path === path) ?? null
    const r = byPath.get(path) ?? null
    const binary = (l?.binary ?? false) || (r?.binary ?? false)
    const status: FunctionFileDiff['status'] =
      l === null
        ? 'remote-only'
        : r === null
          ? 'local-only'
          : l.content === r.content
            ? 'same'
            : 'changed'
    return { path, status, local: l?.content ?? null, remote: r?.content ?? null, binary }
  })
  return { name, files, changed: files.filter((f) => f.status !== 'same').length }
}

const TEMPLATE = `// <name> — Supabase Edge Function (Deno)
//
// Lokal: supabase functions serve
// Call it with: POST \${SUPABASE_URL}/functions/v1/<name>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = req.headers.get('content-type')?.includes('application/json')
      ? await req.json()
      : {}

    return Response.json({ ok: true, received: body }, { headers: CORS })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400, headers: CORS })
  }
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
`

const NAME_RE = /^[a-z][a-z0-9-]*$/

export function create(id: string, name: string): { path: string } {
  if (!NAME_RE.test(name)) {
    throw new Error(
      'The name must start with a lowercase letter and may only contain letters, digits and dashes.'
    )
  }
  const project = getProject(id)
  const dir = join(paths.functionsDir(project), name)
  if (existsSync(dir)) throw new Error(`«${name}» already exists`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.ts'), TEMPLATE.replaceAll('<name>', name), 'utf8')
  return { path: dir }
}

/** Write the `[functions.<name>] verify_jwt` key. */
export function setVerifyJwt(id: string, name: string, verifyJwt: boolean): void {
  writeConfig(id, [{ path: `functions.${name}.verify_jwt`, value: verifyJwt }])
}

/* ------------------------------------------------------------- serve */

const serving = new Map<string, AbortController>()

export function serve(id: string, on: boolean): void {
  const project = getProject(id)
  const stream = `fn:serve:${project.projectId}`
  const existing = serving.get(id)
  if (existing) {
    existing.abort()
    serving.delete(id)
    logBus.push(stream, 'info', 'functions serve stopped')
  }
  if (!on) return

  const controller = new AbortController()
  serving.set(id, controller)
  void supabase(['functions', 'serve'], {
    cwd: project.path,
    stream,
    signal: controller.signal
    // A fast stop → start replaces the entry before this settles; deleting
    // unconditionally would drop the *new* controller.
  }).then(() => {
    if (serving.get(id) === controller) serving.delete(id)
  })
  logBus.push(stream, 'info', 'functions serve started — changes are reloaded on every request')
}

export function isServing(id: string): boolean {
  return serving.has(id)
}

/**
 * Called on quit. Without this the Deno server outlives the app and keeps its
 * port, so the next launch cannot serve functions.
 */
export function stopAllServes(): void {
  for (const controller of serving.values()) controller.abort()
  serving.clear()
}

/** Is the path a file: `statSync` for existence only. */
export function exists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
