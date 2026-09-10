/**
 * On macOS an app launched from Finder or a .dmg does **not** inherit the login
 * shell's PATH — the GUI process only sees `/usr/bin:/bin:/usr/sbin:/sbin`. As a
 * result a Homebrew-installed `supabase` (`/opt/homebrew/bin`) is not found, even
 * though everything works in a terminal.
 *
 * Here the real PATH is asked from the login shell once, the well-known folders
 * are appended, and `process.env.PATH` is fixed up. The result is cached — we
 * don't open a shell for every command.
 */
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

/** Folders package managers usually install into. */
function commonDirs(): string[] {
  const home = homedir()
  return [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    join(home, '.local', 'bin'),
    join(home, 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, 'go', 'bin'),
    // Docker Desktop puts its own CLIs here
    join(home, '.docker', 'bin'),
    '/Applications/Docker.app/Contents/Resources/bin'
  ]
}

const MARK_START = '__LB_PATH_START__'
const MARK_END = '__LB_PATH_END__'

/**
 * Runs a login + interactive shell and reads its PATH. `export PATH=...` lines
 * inside `.zshrc`/`.profile` are exactly what this picks up.
 */
function loginShellPath(): string[] {
  if (process.platform === 'win32') return []
  const shell = process.env['SHELL'] || '/bin/zsh'
  try {
    const res = spawnSync(
      shell,
      ['-l', '-i', '-c', `printf '${MARK_START}%s${MARK_END}' "$PATH"`],
      {
        encoding: 'utf8',
        timeout: 5000,
        // quietens the startup noise of interactive shells
        env: { ...process.env, DISABLE_AUTO_UPDATE: 'true', TERM: 'dumb' }
      }
    )
    const out = `${res.stdout ?? ''}`
    const m = new RegExp(`${MARK_START}([^]*?)${MARK_END}`).exec(out)
    if (!m) return []
    return m[1]!.split(delimiter).filter(Boolean)
  } catch {
    return []
  }
}

let cached: string | null = null

/** Current PATH + login shell PATH + known folders (deduped, order preserved). */
export function resolvedPath(): string {
  if (cached !== null) return cached
  const current = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean)
  const seen = new Set<string>()
  const dirs: string[] = []
  for (const dir of [...current, ...loginShellPath(), ...commonDirs()]) {
    if (seen.has(dir)) continue
    seen.add(dir)
    if (existsSync(dir)) dirs.push(dir)
  }
  cached = dirs.join(delimiter)
  return cached
}

/** Fixes up `process.env.PATH`; called once at app startup. */
export function fixPath(): string {
  const p = resolvedPath()
  process.env['PATH'] = p
  return p
}

/** Resolves a command's full path — `null` if not found. */
export function whichBin(cmd: string): string | null {
  if (isAbsolute(cmd) || cmd.includes('/')) return existsSync(cmd) ? cmd : null
  for (const dir of resolvedPath().split(delimiter)) {
    const full = join(dir, cmd)
    try {
      accessSync(full, constants.X_OK)
      return full
    } catch {
      // next folder
    }
  }
  return null
}
