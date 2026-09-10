/**
 * Running the `supabase` CLI and other external commands.
 *
 * Two rules:
 *  - secret values are **never** passed as arguments (they show up in `ps`);
 *    they go through stdin or the environment instead.
 *  - every output line lands on the log bus, so the UI can follow along live.
 */
import { spawn, type SpawnOptions } from 'node:child_process'
import { createReadStream, createWriteStream, rmSync, statSync } from 'node:fs'
import type { TaskResult } from '@shared/types.js'
import { logBus } from './log.js'
import { resolvedPath, whichBin } from './env-path.js'

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
export async function runJson<T>(cmd: string, args: string[], opts: RunOptions = {}): Promise<T> {
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

/**
 * Like `run()`, but stdout is **streamed to a file** instead of being collected.
 *
 * A `pg_dump` is binary and can be gigabytes; buffering it into a string would
 * corrupt it (encoding) and blow up memory. stderr still goes to the log bus, so
 * the UI follows the dump as it happens.
 */
export async function runToFile(
  cmd: string,
  args: string[],
  file: string,
  opts: RunOptions = {}
): Promise<{ bytes: number }> {
  const stream = opts.stream ?? cmd
  const path = resolvedPath()
  if (!opts.quiet) logBus.push(stream, 'info', `$ ${cmd} ${args.join(' ')} > ${file}`)

  return new Promise((resolve, reject) => {
    const child = spawn(whichBin(cmd) ?? cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, PATH: path, ...opts.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const out = createWriteStream(file)
    const errLines: string[] = []
    let settled = false

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM')
          setTimeout(() => child.kill('SIGKILL'), 3000)
        }, opts.timeoutMs)
      : null

    const fail = (message: string): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      out.destroy()
      // A half-written dump is worse than none — it looks like a valid backup.
      try {
        rmSync(file, { force: true })
      } catch {
        // the caller already has the real error; a leftover temp file is noise
      }
      reject(new Error(message))
    }

    child.stdout?.pipe(out)
    child.stderr?.on('data', (buf: Buffer) => {
      const text = buf.toString()
      errLines.push(text)
      logBus.push(stream, 'stderr', text)
    })

    if (opts.signal) {
      const kill = (): void => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 3000)
      }
      if (opts.signal.aborted) kill()
      else opts.signal.addEventListener('abort', kill, { once: true })
    }

    if (opts.input !== undefined) child.stdin?.end(opts.input)
    else child.stdin?.end()

    child.on('error', (err) => {
      const e = err as NodeJS.ErrnoException
      fail(
        e.code === 'ENOENT'
          ? `\`${cmd}\` not found — is it installed and on PATH? (PATH searched: ${path})`
          : err.message
      )
    })

    child.on('close', (code) => {
      // The file is only complete once the write stream has flushed.
      out.end(() => {
        if (settled) return
        if (code !== 0) {
          fail(
            `${cmd} exited with code ${code}${errLines.length ? `: ${errLines.join('').trim().split('\n').slice(-3).join(' ')}` : ''}`
          )
          return
        }
        settled = true
        if (timer) clearTimeout(timer)
        try {
          resolve({ bytes: statSync(file).size })
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    })
  })
}

/**
 * Like `run()`, but stdin is **streamed from a file**.
 *
 * The mirror image of `runToFile`: a restore feeds a multi-gigabyte dump into
 * `pg_restore`/`psql`, which must not be read into a string first. Output is
 * collected as usual — a restore's output is a log, not data.
 */
export function runFromFile(
  cmd: string,
  args: string[],
  file: string,
  opts: RunOptions = {}
): Promise<TaskResult> {
  const stream = opts.stream ?? cmd
  return new Promise((resolve) => {
    const path = resolvedPath()
    if (!opts.quiet) logBus.push(stream, 'info', `$ ${cmd} ${args.join(' ')} < ${file}`)

    const child = spawn(whichBin(cmd) ?? cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, PATH: path, ...opts.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const chunks: string[] = []
    let settled = false

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM')
          setTimeout(() => child.kill('SIGKILL'), 3000)
        }, opts.timeoutMs)
      : null

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

    const collect = (level: 'stdout' | 'stderr') => (buf: Buffer) => {
      const text = buf.toString()
      chunks.push(text)
      if (!opts.quiet) logBus.push(stream, level, text)
    }
    child.stdout?.on('data', collect('stdout'))
    child.stderr?.on('data', collect('stderr'))
    child.on('error', (err) => finish(null, err.message))
    child.on('close', (code) => finish(code, null))

    const input = createReadStream(file)
    // EPIPE: the command gave up early (a bad dump) — its own exit code and
    // stderr are the real error, so the broken pipe itself is not reported.
    input.on('error', (err) => finish(null, err.message))
    child.stdin?.on('error', () => undefined)
    input.pipe(child.stdin)
  })
}

/** Run the `supabase` CLI inside the project folder. */
export function supabase(args: string[], opts: RunOptions & { cwd: string }): Promise<TaskResult> {
  return run('supabase', args, opts)
}

export function supabaseJson<T>(args: string[], opts: RunOptions & { cwd: string }): Promise<T> {
  return runJson<T>('supabase', args, opts)
}
