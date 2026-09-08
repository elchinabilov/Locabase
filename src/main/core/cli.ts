/**
 * `supabase` CLI və digər xarici əmrlərin işə salınması.
 *
 * İki qayda:
 *  - secret dəyərlər **heç vaxt** arqument kimi verilmir (ps siyahısında görünür);
 *    onlar ya stdin, ya da env vasitəsilə ötürülür.
 *  - hər çıxış sətri log avtobusuna düşür, ona görə UI canlı izləyə bilir.
 */
import { spawn, type SpawnOptions } from 'node:child_process'
import { logBus } from './log.js'
import { resolvedPath, whichBin } from './env-path.js'
import type { TaskResult } from '@shared/types.js'

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  /** loglar bu axın adı altında görünür, məs. `stack:next-cv` */
  stream?: string
  /** stdin-ə yazılacaq mətn (miqrasiya SQL-i, secret dəyərləri və s.) */
  input?: string
  timeoutMs?: number
  /** true olduqda çıxış loga düşmür — yalnız json parse üçün */
  quiet?: boolean
  /** abort edildikdə prosesə SIGTERM, 3 san. sonra SIGKILL göndərilir */
  signal?: AbortSignal
  /**
   * Çıxışın saxlanan son sətir sayı. Default 200 — loglar üçün kifayətdir,
   * amma `psql --csv` kimi NƏTİCƏ qaytaran əmrlərdə kəsilmə datanı sakitcə
   * korlayardı, ona görə onlar bu limiti qaldırır.
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

    // GUI-dən açılan tətbiqdə PATH kasıb olur; binarı özümüz tapıb tam yolla
    // çağırırıq ki, spawn ENOENT verməsin.
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
          ? `\`${cmd}\` tapılmadı — PATH-də quraşdırılıbmı? (axtarılan PATH: ${path})`
          : err.message
      if (!opts.quiet) logBus.push(stream, 'error', msg)
      finish(null, msg)
    })
    child.on('close', (code) => finish(code, null))
  })
}

/** Uğursuzluqda istisna atan variant. */
export async function runOrThrow(
  cmd: string,
  args: string[],
  opts: RunOptions = {}
): Promise<TaskResult> {
  const res = await run(cmd, args, opts)
  if (!res.ok) {
    throw new CommandError(res.error ?? `${cmd} ${args[0] ?? ''} uğursuz oldu (kod ${res.code})`, res)
  }
  return res
}

/**
 * Mətnin `start` mövqeyindən başlayan balanslaşdırılmış JSON parçasını qaytarır.
 * Sətir içindəki mötərizələr sayılmır.
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
 * JSON qaytaran CLI əmri.
 *
 * Supabase CLI JSON-dan əvvəl sərbəst mətn yazır — və o mətnin özündə də
 * mötərizə ola bilər (`Stopped services: [supabase_imgproxy_...]`). Ona görə
 * hər namizəd mövqe sınanır və ilk **parse olunan** parça götürülür.
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
    res.error ?? `${cmd} ${args.join(' ')}: JSON çıxışı tapılmadı${last ? ` (${last})` : ''}`,
    res
  )
}

/** `supabase` CLI-ni layihə qovluğunda işə sal. */
export function supabase(
  args: string[],
  opts: RunOptions & { cwd: string }
): Promise<TaskResult> {
  return run('supabase', args, opts)
}

export function supabaseJson<T>(args: string[], opts: RunOptions & { cwd: string }): Promise<T> {
  return runJson<T>('supabase', args, opts)
}
