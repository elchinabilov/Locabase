/**
 * Local stack control. Runs the `supabase` CLI inside the project folder and
 * reads container state from Docker.
 */
import { SERVICE_GROUPS } from '@shared/services.js'
import { servicesFor } from './docker.js'
import { run, supabase, supabaseJson } from './cli.js'
import { get as getProject } from './projects.js'
import { logBus } from './log.js'
import { write as writeConfig } from './config.js'

/** Only keys from the catalog are allowed — no arbitrary config path may be written. */
const SERVICE_PATHS = new Set(
  SERVICE_GROUPS.map((g) => g.configPath).filter((p): p is string => p !== null)
)
import type { StackStatus, TaskResult } from '@shared/types/index.js'

const START_TIMEOUT = 10 * 60 * 1000
const STOP_TIMEOUT = 3 * 60 * 1000

export const streamFor = (projectId: string): string => `stack:${projectId}`

export async function status(id: string, withStats = false): Promise<StackStatus> {
  const project = getProject(id)
  const stream = streamFor(project.projectId)
  let services: StackStatus['services'] = []
  let error: string | null = null

  try {
    services = await servicesFor(project.projectId, withStats)
  } catch (err) {
    error = `Docker is unavailable: ${(err as Error).message}`
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
      // the stack is coming up or half-up — the status JSON isn't ready yet
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
  // `--no-backup` wipes the local database; by default we KEEP it
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
  logBus.push(stream, 'info', 'Restart: stopping…')
  const stopped = await stop(id, true)
  if (!stopped.ok) return stopped
  logBus.push(stream, 'info', 'Restart: starting…')
  return start(id)
}

/**
 * `db reset` — drops the database and re-applies every migration.
 * The confirmation text has to match the project's name.
 */
export async function reset(id: string, confirm: string): Promise<TaskResult> {
  const project = getProject(id)
  if (confirm !== project.name) {
    return {
      ok: false,
      code: null,
      output: '',
      error: `Confirmation does not match — «${project.name}» must be typed.`
    }
  }
  return supabase(['db', 'reset'], {
    cwd: project.path,
    stream: streamFor(project.projectId),
    timeoutMs: START_TIMEOUT
  })
}

/**
 * Turn a service on/off. On the local stack this does not stop the container —
 * it writes the `enabled` key in `config.toml` so the CLI never brings it up.
 * The change only takes effect after a restart.
 */
export function setService(id: string, configPath: string, on: boolean): { restartRequired: true } {
  if (!SERVICE_PATHS.has(configPath)) {
    throw new Error(`This key is not a service toggle: ${configPath}`)
  }
  writeConfig(id, [{ path: configPath, value: on }])
  return { restartRequired: true }
}

/** Whether `supabase`, `docker` and `git` are present. */
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
      info: res.ok ? res.output.split('\n')[0]!.trim() : (res.error ?? 'not found')
    })
  }
  return checks
}
