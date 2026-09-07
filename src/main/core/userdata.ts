/**
 * Tətbiq adı «Supabase GUI»-dan «Localbase»-ə dəyişdi. Electron istifadəçi
 * qovluğunu ad üzərindən qurduğuna görə köhnə registry yeni qovluqda görünməzdi
 * — bu bir dəfəlik köçürmə onu qarşılayır.
 *
 * Yalnız yeni qovluqda hələ heç nə yoxdursa işləyir və köhnəni silmir.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

const LEGACY_DIR_NAME = 'supabase-gui'
const FILES = ['projects.json', 'credentials.json']

export function migrateUserData(): string | null {
  const userData = app.getPath('userData')
  const legacy = join(dirname(userData), LEGACY_DIR_NAME)

  if (legacy === userData || !existsSync(legacy)) return null
  if (existsSync(join(userData, 'projects.json'))) return null

  mkdirSync(userData, { recursive: true })
  const moved: string[] = []
  for (const file of FILES) {
    const from = join(legacy, file)
    if (!existsSync(from)) continue
    try {
      copyFileSync(from, join(userData, file))
      moved.push(file)
    } catch {
      // köçürmə uğursuzdursa tətbiq boş registry ilə açılsın — dayanmasın
    }
  }
  return moved.length > 0 ? `${legacy} → ${userData} (${moved.join(', ')})` : null
}
