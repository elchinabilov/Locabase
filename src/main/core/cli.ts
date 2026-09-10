/**
 * Running the `supabase` CLI and other external commands.
 *
 * Two rules:
 *  - secret values are **never** passed as arguments (they show up in `ps`);
 *    they go through stdin or the environment instead.
 *  - every output line lands on the log bus, so the UI can follow along live.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { createReadStream, createWriteStream, rmSync, statSync } from 'node:fs'
import type { TaskResult } from '@shared/types/index.js'
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
/** How long a SIGTERM has to work before SIGKILL follows. */
const SIGKILL_GRACE_MS = 3000

export class CommandError extends Error {
  constructor(
    message: string,
    readonly result: TaskResult
  ) {
    super(message)
  }
}

/**
 * The spawn lifecycle every runner needs: resolve the binary, log the command,
 * arm the timeout, escalate SIGTERM → SIGKILL, honour an abort signal, and make
 * sure the caller settles exactly once.
 *
 * `run`, `runToFile` and `runFromFile` each used to carry their own copy of
 * this. They differ only in where stdout goes and where stdin comes from, which
 * is what `onStdout`/`onStdin` are for.
 */
interface SpawnHandlers {
  /** Called for each stdout chunk. Omit to let stdout be piped elsewhere. */
  onStdout?: (text: string) => void
  onStderr?: (text: string) => void
  /** Given the child's stdin so the caller can pipe or end it. */
  onStdin?: (child: ChildProcess) => void
  /** Given the child before any listener is attached — for piping stdout. */
  onSpawn?: (child: ChildProcess) => void
  /** Settled exactly once, with the exit code or a failure message. */
  onSettle: (code: number | null, error: string | null) => void
}

function spawnManaged(
  cmd: string,
  args: string[],
  opts: RunOptions,
  handlers: SpawnHandlers
): void {
  const path = resolvedPath()
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: { ...process.env, PATH: path, ...opts.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe']
  }

  // An app launched from the GUI has a poor PATH; we resolve the binary
  // ourselves and call it by full path so spawn doesn't fail with ENOENT.
  const child = spawn(whichBin(cmd) ?? cmd, args, spawnOpts)
  handlers.onSpawn?.(child)

  let settled = false
  const settle = (code: number | null, error: string | null): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    handlers.onSettle(code, error)
  }

  const kill = (): void => {
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), SIGKILL_GRACE_MS).unref?.()
  }

  const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : undefined

  if (opts.signal) {
    if (opts.signal.aborted) kill()
    else opts.signal.addEventListener('abort', kill, { once: true })
  }

  if (handlers.onStdout) {
    child.stdout?.on('data', (buf: Buffer) => handlers.onStdout!(buf.toString()))
  }
  if (handlers.onStderr) {
    child.stderr?.on('data', (buf: Buffer) => handlers.onStderr!(buf.toString()))
  }

  if (handlers.onStdin) handlers.onStdin(child)
  else if (opts.input !== undefined) child.stdin?.end(opts.input)
  else child.stdin?.end()

  child.on('error', (err) => {
    const e = err as NodeJS.ErrnoException
    settle(
      null,
      e.code === 'ENOENT'
        ? `\`${cmd}\` not found — is it installed and on PATH? (PATH searched: ${path})`
        : err.message
    )
  })
  child.on('close', (code) => settle(code, null))
}

/** Trailing output kept, honouring the caller's limit. */
function tail(chunks: string[], maxOutputLines?: number): string {
  const all = chunks.join('')
  const limit = maxOutputLines ?? MAX_OUTPUT_LINES
  const lines = all.split('\n')
  return lines.length > limit ? lines.slice(-limit).join('\n') : all
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<TaskResult> {
  const stream = opts.stream ?? cmd
  return new Promise((resolve) => {
    if (!opts.quiet) logBus.push(stream, 'info', `$ ${cmd} ${args.join(' ')}`)
    const chunks: string[] = []
    const collect =
      (level: 'stdout' | 'stderr') =>
      (text: string): void => {
        chunks.push(text)
        if (!opts.quiet) logBus.push(stream, level, text)
      }

    spawnManaged(cmd, args, opts, {
      onStdout: collect('stdout'),
      onStderr: collect('stderr'),
      onSettle: (code, error) => {
        if (error && !opts.quiet) logBus.push(stream, 'error', error)
        resolve({
          ok: code === 0 && error === null,
          code,
          output: tail(chunks, opts.maxOutputLines),
          error
        })
      }
    })
  })
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
  if (!opts.quiet) logBus.push(stream, 'info', `$ ${cmd} ${args.join(' ')} > ${file}`)

  return new Promise((resolve, reject) => {
    const out = createWriteStream(file)
    const errLines: string[] = []

    const fail = (message: string): void => {
      out.destroy()
      // A half-written dump is worse than none — it looks like a valid backup.
      try {
        rmSync(file, { force: true })
      } catch {
        // the caller already has the real error; a leftover temp file is noise
      }
      reject(new Error(message))
    }

    spawnManaged(cmd, args, opts, {
      onSpawn: (child) => child.stdout?.pipe(out),
      onStderr: (text) => {
        errLines.push(text)
        logBus.push(stream, 'stderr', text)
      },
      onSettle: (code, error) => {
        if (error) {
          fail(error)
          return
        }
        // The file is only complete once the write stream has flushed.
        out.end(() => {
          if (code !== 0) {
            const detail = errLines.join('').trim().split('\n').slice(-3).join(' ')
            fail(`${cmd} exited with code ${code}${detail ? `: ${detail}` : ''}`)
            return
          }
          try {
            resolve({ bytes: statSync(file).size })
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        })
      }
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
    if (!opts.quiet) logBus.push(stream, 'info', `$ ${cmd} ${args.join(' ')} < ${file}`)
    const chunks: string[] = []
    const collect =
      (level: 'stdout' | 'stderr') =>
      (text: string): void => {
        chunks.push(text)
        if (!opts.quiet) logBus.push(stream, level, text)
      }

    // An unreadable dump file is the caller's real error, but the child settles
    // first (on EPIPE or a non-zero exit), so it is recorded and reported there.
    let inputError: string | null = null

    spawnManaged(cmd, args, opts, {
      onStdout: collect('stdout'),
      onStderr: collect('stderr'),
      onStdin: (child) => {
        const input = createReadStream(file)
        input.on('error', (err) => {
          inputError = err.message
          child.stdin?.destroy()
        })
        // EPIPE: the command gave up early (a bad dump) — its own exit code and
        // stderr are the real error, so the broken pipe itself is not reported.
        child.stdin?.on('error', () => undefined)
        if (child.stdin) input.pipe(child.stdin)
      },
      onSettle: (code, error) => {
        const failure = error ?? inputError
        resolve({
          ok: code === 0 && failure === null,
          code,
          output: tail(chunks, opts.maxOutputLines),
          error: failure
        })
      }
    })
  })
}

/** Run the `supabase` CLI inside the project folder. */
export function supabase(args: string[], opts: RunOptions & { cwd: string }): Promise<TaskResult> {
  return run('supabase', args, opts)
}

export function supabaseJson<T>(args: string[], opts: RunOptions & { cwd: string }): Promise<T> {
  return runJson<T>('supabase', args, opts)
}
