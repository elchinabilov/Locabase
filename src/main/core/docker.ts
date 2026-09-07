/**
 * Docker ilə əlaqə. Supabase CLI konteynerləri `supabase_<servis>_<project_id>`
 * adlanır — layihəyə aid olanları məhz bu şəkilçi ilə ayırırıq.
 */
import Docker from 'dockerode'
import type { Duplex } from 'node:stream'
import { logBus } from './log.js'
import type { ServiceStatus } from '@shared/types.js'

let docker: Docker | null = null

function client(): Docker {
  if (!docker) docker = new Docker()
  return docker
}

export async function available(): Promise<{ ok: boolean; info: string }> {
  try {
    const v = (await client().version()) as { Version?: string }
    return { ok: true, info: `Docker ${v.Version ?? '?'}` }
  } catch (err) {
    return { ok: false, info: (err as Error).message }
  }
}

/** `Up 2 hours (healthy)` → `healthy` */
function parseHealth(status: string): string | null {
  const m = /\((healthy|unhealthy|health: starting|starting)\)/i.exec(status)
  if (!m) return null
  return m[1]!.toLowerCase().replace('health: ', '')
}

/**
 * Bir konteynerin yaddaş istifadəsi. Docker CLI-nin `MEM USAGE` sütunu ilə eyni
 * hesablama: xam `usage`-dan səhifə keşi (`inactive_file`) çıxılır — əks halda
 * rəqəm real istifadədən qat-qat böyük görünür.
 */
async function memoryOf(
  name: string
): Promise<{ memory: number | null; memoryLimit: number | null }> {
  try {
    const raw = (await client().getContainer(name).stats({ stream: false })) as {
      memory_stats?: {
        usage?: number
        limit?: number
        stats?: { inactive_file?: number; total_inactive_file?: number }
      }
    }
    const ms = raw.memory_stats
    if (!ms?.usage) return { memory: null, memoryLimit: ms?.limit ?? null }
    const inactive = ms.stats?.inactive_file ?? ms.stats?.total_inactive_file ?? 0
    return { memory: Math.max(0, ms.usage - inactive), memoryLimit: ms.limit ?? null }
  } catch {
    return { memory: null, memoryLimit: null }
  }
}

export async function servicesFor(
  projectId: string,
  withStats = false
): Promise<ServiceStatus[]> {
  const suffix = `_${projectId}`
  const containers = await client().listContainers({ all: true })
  const out: ServiceStatus[] = []
  for (const c of containers) {
    const name = (c.Names?.[0] ?? '').replace(/^\//, '')
    if (!name.startsWith('supabase_') || !name.endsWith(suffix)) continue
    const key = name.slice('supabase_'.length, name.length - suffix.length)
    out.push({
      key,
      container: name,
      state: c.State,
      health: parseHealth(c.Status ?? ''),
      memory: null,
      memoryLimit: null
    })
  }

  if (withStats) {
    // Yalnız işləyən konteynerlər — dayanmış konteynerin stats-ı sonsuz gözləyir.
    const running = out.filter((s) => s.state === 'running')
    const stats = await Promise.all(running.map((s) => memoryOf(s.container)))
    running.forEach((svc, i) => {
      svc.memory = stats[i]!.memory
      svc.memoryLimit = stats[i]!.memoryLimit
    })
  }

  return out.sort((a, b) => a.key.localeCompare(b.key))
}

/* ------------------------------------------------------------- loglar */

const tails = new Map<string, Duplex>()

export async function tailLogs(container: string, stream: string, on: boolean): Promise<void> {
  const existing = tails.get(container)
  if (existing) {
    existing.destroy()
    tails.delete(container)
  }
  if (!on) return

  const c = client().getContainer(container)
  const s = (await c.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 200
  })) as unknown as Duplex

  tails.set(container, s)
  s.on('data', (buf: Buffer) => {
    // docker multiplexed frame: ilk 8 bayt başlıqdır
    const text = buf.length > 8 && buf[0]! <= 2 ? buf.subarray(8).toString() : buf.toString()
    logBus.push(stream, 'stdout', text)
  })
  s.on('error', (err: Error) => logBus.push(stream, 'error', err.message))
  s.on('end', () => tails.delete(container))
}

export function stopAllTails(): void {
  for (const [, s] of tails) s.destroy()
  tails.clear()
}
