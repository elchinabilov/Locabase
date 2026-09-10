/**
 * The list of taken backups, newest first.
 *
 * Split out of the route for the same reason as the job list: the route body
 * held both lists, a toolbar and four modal mounts in one 340-line function.
 */
import type { ReactNode } from 'react'
import type { BackupRecord, StorageConnection } from '@shared/types'
import { bytes as humanBytes, cx, stamp } from '../../lib/format'
import { useI18n, useT } from '../../i18n'
import { Badge, Button, Card, Dot, SkeletonList } from '../ui'
import { scopeKey, shortFile } from './labels'

export function BackupList({
  rows,
  loading,
  conns,
  onReveal,
  onUpload,
  onRestore,
  onRemove
}: {
  rows: BackupRecord[]
  loading: boolean
  conns: StorageConnection[]
  onReveal: (row: BackupRecord) => void
  onUpload: (row: BackupRecord) => void
  onRestore: (row: BackupRecord) => void
  onRemove: (row: BackupRecord) => void
}): ReactNode {
  const t = useT()
  const { locale } = useI18n()

  return (
    <Card title={t('backups.count', { count: rows.length })} subtitle={t('backups.restoreHint')}>
      {loading && <SkeletonList rows={4} avatar trailing />}
      {!loading && rows.length === 0 && (
        <p className="px-3.5 py-6 text-center text-note text-muted">{t('backups.empty')}</p>
      )}
      <ul className="divide-y divide-line-soft">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <Dot tone={row.status === 'ok' ? 'ok' : row.status === 'running' ? 'warn' : 'danger'} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ui text-text">{stamp(row.startedAt, locale)}</span>
                <Badge tone={row.kind === 'local' ? 'muted' : 'info'}>{row.envName}</Badge>
                <Badge tone="muted">{t(scopeKey(row.scope))}</Badge>
                <Badge tone={row.trigger === 'job' ? 'info' : 'muted'}>
                  {row.trigger === 'job'
                    ? (row.jobName ?? t('backups.trigger.job'))
                    : t('backups.trigger.manual')}
                </Badge>
                {row.status !== 'ok' && (
                  <Badge tone={row.status === 'running' ? 'warn' : 'danger'}>
                    {t(
                      row.status === 'running' ? 'backups.status.running' : 'backups.status.failed'
                    )}
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 font-mono text-badge text-faint">
                <span>{humanBytes(row.bytes)}</span>
                {row.durationMs !== null && (
                  <span>{t('backups.seconds', { count: Math.round(row.durationMs / 1000) })}</span>
                )}
                <span className={cx(!row.path && 'text-warn')}>
                  {row.path ? shortFile(row.path) : t('backups.fileGone')}
                </span>
                {row.storageKey ? (
                  <span>
                    ↥ {row.storageName} · {row.storageKey}
                  </span>
                ) : (
                  <span>{t('backups.localOnly')}</span>
                )}
              </div>
              {row.error && <div className="mt-1 text-meta text-danger-soft">{row.error}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {row.path && (
                <Button variant="ghost" onClick={() => onReveal(row)}>
                  {t('backups.reveal')}
                </Button>
              )}
              {row.path && conns.length > 0 && (
                <Button variant="ghost" onClick={() => onUpload(row)}>
                  {t('backups.upload')}
                </Button>
              )}
              {row.status === 'ok' && (row.path || row.storageKey) && (
                <Button onClick={() => onRestore(row)}>{t('backups.restore')}</Button>
              )}
              <Button variant="danger" onClick={() => onRemove(row)}>
                {t('backups.remove')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
