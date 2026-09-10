/**
 * The small label helpers the Backups screen and its lists both need.
 *
 * Separate from the components so the route and the two lists can share them
 * without importing each other.
 */
import type { BackupScope, Project } from '@shared/types'

export function envLabel(project: Project, envId: string | null, localLabel: string): string {
  if (!envId) return localLabel
  return project.environments.find((e) => e.id === envId)?.name ?? envId
}

export function storageName(
  storages: Array<{ id: string; name: string }>,
  storageId: string
): string {
  return storages.find((s) => s.id === storageId)?.name ?? storageId
}

export function scopeKey(
  scope: BackupScope
): 'backups.scope.full' | 'backups.scope.schema' | 'backups.scope.data' {
  return scope === 'schema'
    ? 'backups.scope.schema'
    : scope === 'data'
      ? 'backups.scope.data'
      : 'backups.scope.full'
}

/** `…/supabase/.backups/prod/app-prod-20260909-030000.dump` → the file name. */
export function shortFile(path: string): string {
  return path.split('/').pop() ?? path
}
