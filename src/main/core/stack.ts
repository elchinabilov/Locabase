/**
 * Lokal stack idarəsi. `supabase` CLI-ni layihə qovluğunda işə salır və
 * konteyner vəziyyətini docker-dən oxuyur.
 */
import { servicesFor } from './docker.js'
import { run, supabase, supabaseJson } from './cli.js'
import { get as getProject } from './projects.js'
import { logBus } from './log.js'
import type { StackStatus, TaskResult } from '@shared/types.js'

const START_TIMEOUT = 10 * 60 * 1000
const STOP_TIMEOUT = 3 * 60 * 1000

export const streamFor = (projectId: string): string => `stack:${projectId}`

export async function status(id: string): Promise<StackStatus> {
  const project = getProject(id)
  const stream = streamFor(project.projectId)
  let services: StackStatus['services'] = []
  let error: string | null = null

  try {
    services = await servicesFor(project.projectId)
  } catch (err) {
    error = `Docker əlçatmazdır: ${(err as Error).message}`
  }

  const running = services.some((s) => s.state === 'running')
  let vars: Record<string, string> = {}
  if (running) {
    try {
      vars = await supabaseJson<Record<string, string>>(['status', '-o', 'json'], {
        cwd: project.path,
        stream,
        timeoutMs: 60_000
      })
    } catch (err) {
      // stack qalxır və ya yarımçıqdır — status json hazır deyil
      error ??= (err as Error).message
    }
  }

  return {
    projectId: project.projectId,
    running,
    services,
    vars,
    error,
    checkedAt: new Date().toISOString()
  }
}

export async function start(id: string): Promise<TaskResult> {
  const project = getProject(id)
  return supabase(['start'], {
    cwd: project.path,
    stream: streamFor(project.projectId),
    timeoutMs: START_TIMEOUT
  })
}

export async function stop(id: string, noBackup = true): Promise<TaskResult> {
  const project = getProject(id)
  const args = ['stop']
  // `--no-backup` lokal bazanı silir; default olaraq SAXLAYIRIQ
  if (!noBackup) args.push('--no-backup')
  return supabase(args, {
    cwd: project.path,
    stream: streamFor(project.projectId),
    timeoutMs: STOP_TIMEOUT
  })
}

export async function restart(id: string): Promise<TaskResult> {
  const project = getProject(id)
  const stream = streamFor(project.projectId)
  logBus.push(stream, 'info', 'Restart: dayandırılır…')
  const stopped = await stop(id, true)
  if (!stopped.ok) return stopped
  logBus.push(stream, 'info', 'Restart: qaldırılır…')
  return start(id)
}

/**
 * `db reset` — bazanı silib bütün miqrasiyaları yenidən tətbiq edir.
 * Təsdiq mətni layihənin adı ilə üst-üstə düşməlidir.
 */
export async function reset(id: string, confirm: string): Promise<TaskResult> {
  const project = getProject(id)
  if (confirm !== project.name) {
    return {
      ok: false,
      code: null,
      output: '',
      error: `Təsdiq uyğun gəlmir — «${project.name}» yazılmalıdır.`
    }
  }
  return supabase(['db', 'reset'], {
    cwd: project.path,
    stream: streamFor(project.projectId),
    timeoutMs: START_TIMEOUT
  })
}

/** `supabase`, `docker` və `git` mövcuddurmu. */
export async function doctor(): Promise<Array<{ label: string; ok: boolean; info: string }>> {
  const checks: Array<{ label: string; ok: boolean; info: string }> = []
  for (const [label, cmd, args] of [
    ['Supabase CLI', 'supabase', ['--version']],
    ['Docker', 'docker', ['--version']],
    ['rsync', 'rsync', ['--version']],
    ['ssh', 'ssh', ['-V']]
  ] as const) {
    const res = await run(cmd, [...args], { quiet: true, timeoutMs: 15_000 })
    checks.push({
      label,
      ok: res.ok,
      info: res.ok ? res.output.split('\n')[0]!.trim() : (res.error ?? 'tapılmadı')
    })
  }
  return checks
}
