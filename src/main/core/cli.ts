/**
 * Running the `supabase` CLI and other external commands.
 *
 * Two rules:
 *  - secret values are **never** passed as arguments (they show up in `ps`);
 *    they go through stdin or the environment instead.
 *  - every output line lands on the log bus, so the UI can follow along live.
 */
import { spawn, type SpawnOptions } from 'node:child_process'
import { logBus } from './log.js'
import { resolvedPath, whichBin } from './env-path.js'
import type { TaskResult } from '@shared/types.js'

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  /** logs appear under this stream name, e.g. `stack:sample-c` */
  stream?: string
  /** text to write to stdin (migration SQL, secret values, …) */
  input?: string
  timeoutMs?: number
  /** when true the output is not logged — for JSON parsing only */
  quiet?: boolean
  /** on abort the process gets SIGTERM, then SIGKILL 3s later */
  signal?: AbortSignal
  /**
   * How many trailing output lines are kept. Default 200 — plenty for logs,
   * but for commands that return RESULTS, like `psql --csv`, truncation would
   * silently corrupt the data, so those raise the limit.
   */
  maxOutputLines?: number
}

const MAX_OUTPUT_LINES = 200

export class CommandError extends Error {
  constructor(
    message: string,
    readonly result: TaskResult
  ) {
    super(message)
  }
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<TaskResult> {
  const stream = opts.stream ?? cmd
  return new Promise((resolve) => {
    const path = resolvedPath()
    const spawnOpts: SpawnOptions = {
      cwd: opts.cwd,
      env: { ...process.env, PATH: path, ...opts.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    }
    if (!opts.quiet) logBus.push(stream, 'info', `$ ${cmd} ${args.join(' ')}`)

    // An app launched from the GUI has a poor PATH; we resolve the binary
    // ourselves and call it by full path so spawn doesn't fail with ENOENT.
    const bin = whichBin(cmd) ?? cmd
    const child = spawn(bin, args, spawnOpts)
    const chunks: string[] = []
    let settled = false

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM')
          setTimeout(() => child.kill('SIGKILL'), 3000)
        }, opts.timeoutMs)
      : null

    const collect = (level: 'stdout' | 'stderr') => (buf: Buffer) => {
      const text = buf.toString()
      chunks.push(text)
      if (!opts.quiet) logBus.push(stream, level, text)
    }
    const kill = (): void => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
    }
    if (opts.signal) {
      if (opts.signal.aborted) kill()
      else opts.signal.addEventListener('abort', kill, { once: true })
    }

    child.stdout?.on('data', collect('stdout'))
    child.stderr?.on('data', collect('stderr'))

    if (opts.input !== undefined) {
      child.stdin?.end(opts.input)
    } else {
      child.stdin?.end()
    }

    const finish = (code: number | null, error: string | null): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      const all = chunks.join('')
      const limit = opts.maxOutputLines ?? MAX_OUTPUT_LINES
      const lines = all.split('\n')
      resolve({
        ok: code === 0 && error === null,
        code,
        output: lines.length > limit ? lines.slice(-limit).join('\n') : all,
        error
      })
    }

    child.on('error', (err) => {
      const msg =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? `\`${cmd}\` not found — is it installed and on PATH? (PATH searched: ${path})`
          : err.message
      if (!opts.quiet) logBus.push(stream, 'error', msg)
      finish(null, msg)
    })
    child.on('close', (code) => finish(code, null))
  })
}

/** Variant that throws on failure. */
export async function runOrThrow(
  cmd: string,
  args: string[],
  opts: RunOptions = {}
): Promise<TaskResult> {
  const res = await run(cmd, args, opts)
  if (!res.ok) {
    throw new CommandError(res.error ?? `${cmd} ${args[0] ?? ''} failed (code ${res.code})`, res)
  }
  return res
}

/**
 * Returns the balanced JSON slice starting at `start` in the text.
 * Brackets inside strings are not counted.
 */
function balancedSlice(text: string, start: number): string | null {
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]!
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * A CLI command that returns JSON.
 *
 * The Supabase CLI prints free-form text before the JSON — and that text can
 * contain brackets itself (`Stopped services: [supabase_imgproxy_...]`). So every
 * candidate position is tried and the first slice that **parses** wins.
 */
export async function runJson<T>(
  cmd: string,
  args: string[],
  opts: RunOptions = {}
): Promise<T> {
  const res = await run(cmd, args, { ...opts, quiet: true })
  const text = res.output
  let last: string | null = null

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c !== '{' && c !== '[') continue
    const candidate = balancedSlice(text, i)
    if (!candidate) continue
    try {
      return JSON.parse(candidate) as T
    } catch (err) {
      last = (err as Error).message
    }
  }

  throw new CommandError(
    res.error ?? `${cmd} ${args.join(' ')}: no JSON output found${last ? ` (${last})` : ''}`,
    res
  )
}

/** Run the `supabase` CLI inside the project folder. */
export function supabase(
  args: string[],
  opts: RunOptions & { cwd: string }
): Promise<TaskResult> {
  return run('supabase', args, opts)
}

export function supabaseJson<T>(args: string[], opts: RunOptions & { cwd: string }): Promise<T> {
  return runJson<T>('supabase', args, opts)
}
