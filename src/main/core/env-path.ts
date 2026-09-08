/**
 * macOS-da Finder/.dmg vasitəsilə açılan tətbiq login shell-in PATH-ini **miras
 * almır** — GUI prosesi yalnız `/usr/bin:/bin:/usr/sbin:/sbin` görür. Nəticədə
 * Homebrew-la quraşdırılmış `supabase` (`/opt/homebrew/bin`) tapılmır, halbuki
 * terminalda hər şey işləyir.
 *
 * Burada bir dəfə login shell-dən real PATH soruşulur, üstünə məlum qovluqlar
 * əlavə olunur və `process.env.PATH` düzəldilir. Nəticə keşlənir — hər əmr üçün
 * shell açmırıq.
 */
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

/** Paket menecerlərinin adətən istifadə etdiyi qovluqlar. */
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
    // Docker Desktop öz CLI-lərini bura qoyur
    join(home, '.docker', 'bin'),
    '/Applications/Docker.app/Contents/Resources/bin'
  ]
}

const MARK_START = '__LB_PATH_START__'
const MARK_END = '__LB_PATH_END__'

/**
 * Login + interactive shell işə salıb onun PATH-ini oxuyur. `.zshrc`/`.profile`
 * içindəki `export PATH=...` sətirləri məhz belə görünür.
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
        // interaktiv shell-lərin başlanğıc səs-küyünü azaldır
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

/** Mövcud PATH + login shell PATH + məlum qovluqlar (təkrarsız, sıra qorunur). */
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

/** `process.env.PATH`-i düzəldir; tətbiq açılışında bir dəfə çağırılır. */
export function fixPath(): string {
  const p = resolvedPath()
  process.env['PATH'] = p
  return p
}

/** Əmrin tam yolunu tapır — tapılmasa `null`. */
export function whichBin(cmd: string): string | null {
  if (isAbsolute(cmd) || cmd.includes('/')) return existsSync(cmd) ? cmd : null
  for (const dir of resolvedPath().split(delimiter)) {
    const full = join(dir, cmd)
    try {
      accessSync(full, constants.X_OK)
      return full
    } catch {
      // növbəti qovluq
    }
  }
  return null
}

/** Diaqnostika üçün: harada axtardıq. */
export function searchedDirs(): string[] {
  return resolvedPath().split(delimiter)
}
