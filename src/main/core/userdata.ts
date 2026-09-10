/**
 * The app was called «Supabase GUI», then «Localbase», and is now «Locabase».
 * Electron derives the user-data folder from the name, so an old registry would
 * be invisible under the new one — this one-off migration carries it over.
 *
 * It only runs when the new folder is still empty, and it never deletes the old one.
 * Order matters: the most recent old name is checked first.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

const LEGACY_DIR_NAMES = ['Localbase', 'supabase-gui']
const FILES = ['projects.json', 'credentials.json']

export function migrateUserData(): string | null {
  const userData = app.getPath('userData')
  if (existsSync(join(userData, 'projects.json'))) return null

  const legacy = LEGACY_DIR_NAMES.map((name) => join(dirname(userData), name)).find(
    (dir) => dir !== userData && FILES.some((file) => existsSync(join(dir, file)))
  )
  if (!legacy) return null

  mkdirSync(userData, { recursive: true })
  const moved: string[] = []
  for (const file of FILES) {
    const from = join(legacy, file)
    if (!existsSync(from)) continue
    try {
      copyFileSync(from, join(userData, file))
      moved.push(file)
    } catch {
      // if the move fails, let the app open with an empty registry rather than die
    }
  }
  return moved.length > 0 ? `${legacy} → ${userData} (${moved.join(', ')})` : null
}
