/**
 * Which backups a retention rule drops.
 *
 * Kept apart from the engine because this is the part that DELETES data: it is
 * pure (records in, records out), so it can be tested without a database, a
 * bucket or a clock.
 */
import type { BackupRecord } from '@shared/types/index.js'

export interface RetentionRule {
  /** Older than this many days goes. 0 = no age limit. */
  days: number
  /** Only the newest N are kept. 0 = no count limit. */
  count: number
}

/**
 * The records to delete, oldest first. Only successful, finished backups are
 * ever considered: a failed record is a log entry, and a running one is in
 * flight. The newest successful backup is **never** dropped — a retention rule
 * should thin out history, not leave an environment with nothing.
 */
export function selectPrunable(
  records: BackupRecord[],
  rule: RetentionRule,
  now: Date = new Date()
): BackupRecord[] {
  if (rule.days <= 0 && rule.count <= 0) return []

  const candidates = records
    .filter((r) => r.status === 'ok')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  if (candidates.length <= 1) return []

  const keepNewest = candidates[0]!
  const doomed = new Map<string, BackupRecord>()

  if (rule.count > 0) {
    for (const r of candidates.slice(rule.count)) doomed.set(r.id, r)
  }
  if (rule.days > 0) {
    const cutoff = now.getTime() - rule.days * 24 * 60 * 60 * 1000
    for (const r of candidates) {
      if (new Date(r.startedAt).getTime() < cutoff) doomed.set(r.id, r)
    }
  }

  doomed.delete(keepNewest.id)
  return [...doomed.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
