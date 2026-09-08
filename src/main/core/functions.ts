/**
 * Edge funksiyalar. Lokal qovluq `supabase/functions/<ad>/`, uzaq tərəf isə
 * adapterdən gəlir. Lokal/uzaq fərqi məzmun hash-i ilə hesablanır — deploy-un
 * lazım olub-olmadığını göstərən yeganə etibarlı siqnal budur.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checksums, readTree } from './filetree.js'
import { parse as parseToml } from 'smol-toml'
import { get as getProject, getEnv, paths } from './projects.js'
import { adapterFor } from './remote/index.js'
import { write as writeConfig } from './config.js'
import { supabase } from './cli.js'
import { logBus } from './log.js'
import type {
  FunctionDiff,
  FunctionDrift,
  FunctionFileDiff,
  FunctionInfo,
  RemoteFile,
  RemoteFileChecksum
} from '@shared/types.js'

/**
 * Qovluğun məzmun hash-i + fayl-fayl md5-lər. Fayllar bir dəfə oxunur: eyni
 * siyahı həm ümumi hash, həm də uzaqla tutuşdurma üçün işlədilir.
 */
export function hashDir(dir: string): { hash: string; files: number; checksums: RemoteFileChecksum[] } {
  const list = checksums(dir)
  const h = createHash('sha256')
  for (const f of list) {
    h.update(f.path)
    h.update('\0')
    h.update(f.md5)
    h.update('\0')
  }
  return { hash: h.digest('hex').slice(0, 16), files: list.length, checksums: list }
}

/** Uzaq və lokal fayl md5-lərini tutuşdur. */
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
    .map((e) => {
      const path = join(dir, e.name)
      const { hash, files, checksums: sums } = hashDir(path)
      localSums.set(e.name, sums)
      const entrypoint = ['index.ts', 'index.js', 'main.ts'].find((f) =>
        existsSync(join(path, f))
      )
      return {
        name: e.name,
        path,
        entrypoint: entrypoint ?? '(tapılmadı)',
        hash,
        files,
        verifyJwt: verifyJwtOf(configPath, e.name),
        remote: null,
        // remote siyahısı oxunana qədər fərq bilinmir
        drift: 'unknown' as FunctionDrift
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
      // Uzaq tərəf fayl siyahısı verməyəndə (managed) fərq bilinmir —
      // «Fərqə bax» onu tələb üzərinə hesablayır.
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
        entrypoint: '(yalnız remote)',
        hash: '',
        files: r.files?.length ?? 0,
        verifyJwt: r.verifyJwt ?? true,
        remote: r,
        drift: 'remote-only'
      })
    }
  } catch (err) {
    logBus.push('functions', 'warn', `Remote funksiyalar oxunmadı: ${(err as Error).message}`)
  }
  return local
}

/**
 * Bir funksiyanın lokal və uzaq **məzmun** fərqi. Uzaq fayllar tələb üzərinə
 * gətirilir: self-hosted-də ssh ilə, managed-də `functions download` ilə
 * müvəqqəti qovluğa.
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
    // uzaqda yoxdursa bu normaldır — hamısı «yalnız lokal» kimi göstərilir
    logBus.push('functions', 'warn', `${name}: uzaq mənbə oxunmadı — ${(err as Error).message}`)
  }

  const byPath = new Map(remoteFiles.map((f) => [f.path, f]))
  const allPaths = [...new Set([...localFiles.map((f) => f.path), ...byPath.keys()])].sort()
  const files: FunctionFileDiff[] = allPaths.map((path) => {
    const l = localFiles.find((f) => f.path === path) ?? null
    const r = byPath.get(path) ?? null
    const binary = (l?.binary ?? false) || (r?.binary ?? false)
    const status: FunctionFileDiff['status'] =
      l === null ? 'remote-only' : r === null ? 'local-only' : l.content === r.content ? 'same' : 'changed'
    return { path, status, local: l?.content ?? null, remote: r?.content ?? null, binary }
  })
  return { name, files, changed: files.filter((f) => f.status !== 'same').length }
}

const TEMPLATE = `// <name> — Supabase Edge Function (Deno)
//
// Lokal: supabase functions serve
// Çağırış: POST \${SUPABASE_URL}/functions/v1/<name>

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
    throw new Error('Ad kiçik hərflə başlamalı, yalnız hərf/rəqəm/tire ola bilər.')
  }
  const project = getProject(id)
  const dir = join(paths.functionsDir(project), name)
  if (existsSync(dir)) throw new Error(`«${name}» artıq var`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.ts'), TEMPLATE.replaceAll('<name>', name), 'utf8')
  return { path: dir }
}

/** `[functions.<ad>] verify_jwt` açarını yaz. */
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
    logBus.push(stream, 'info', 'functions serve dayandırıldı')
  }
  if (!on) return

  const controller = new AbortController()
  serving.set(id, controller)
  void supabase(['functions', 'serve'], {
    cwd: project.path,
    stream,
    signal: controller.signal
  }).then(() => serving.delete(id))
  logBus.push(stream, 'info', 'functions serve başladı — dəyişikliklər hər sorğuda yenidən yüklənir')
}

export function isServing(id: string): boolean {
  return serving.has(id)
}

/** Faylı yoxlanılan qovluqda: `statSync` yalnız mövcudluq üçün. */
export function exists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
