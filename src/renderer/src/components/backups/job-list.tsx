/**
 * The scheduled-backup list on the Backups screen.
 *
 * Split out of the route because it is a self-contained list with its own row
 * shape and its own three actions — the route was a 340-line function holding
 * this, the backup list, a toolbar and four modal mounts.
 */
import type { ReactNode } from 'react'
import type { Job, Project, StorageConnection } from '@shared/types'
import { stamp } from '../../lib/format'
import { useI18n, useT } from '../../i18n'
import { Badge, Button, Card, SkeletonList, Toggle } from '../ui'
import { describeSchedule } from '../job-form'
import { envLabel, storageName } from './labels'

export function JobList({
  project,
  jobs,
  loading,
  conns,
  runningLabel,
  onRun,
  onSetEnabled,
  onNew,
  onEdit,
  onRemove
}: {
  project: Project
  jobs: Job[]
  loading: boolean
  conns: StorageConnection[]
  /** The job id currently running through the shared action state, if any. */
  runningLabel: string | null
  onRun: (job: Job) => void
  onSetEnabled: (job: Job, enabled: boolean) => void
  onNew: () => void
  onEdit: (job: Job) => void
  onRemove: (job: Job) => void
}): ReactNode {
  const t = useT()
  const { locale } = useI18n()

  return (
    <Card
      title={t('jobs.title')}
      subtitle={t('jobs.subtitle')}
      actions={<Button onClick={onNew}>{t('jobs.new')}</Button>}
    >
      {loading && <SkeletonList rows={2} avatar trailing />}
      {!loading && jobs.length === 0 && (
        <p className="px-3.5 py-6 text-center text-note text-muted">{t('jobs.empty')}</p>
      )}
      <ul className="divide-y divide-line-soft">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <Toggle checked={job.enabled} onChange={(on) => onSetEnabled(job, on)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-ui text-text">{job.name}</span>
                <Badge tone="muted">{envLabel(project, job.envId, t('backups.localTarget'))}</Badge>
                {job.running && <Badge tone="info">{t('jobs.running')}</Badge>}
                {job.lastStatus && (
                  <Badge tone={job.lastStatus === 'ok' ? 'ok' : 'danger'}>
                    {t(job.lastStatus === 'ok' ? 'jobs.status.ok' : 'jobs.status.failed')}
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-badge text-faint">
                <span>{describeSchedule(job.schedule, t)}</span>
                <span>
                  {t('jobs.next', {
                    time: job.nextRunAt ? stamp(job.nextRunAt, locale) : t('jobs.off')
                  })}
                </span>
                <span>
                  {t('jobs.last', {
                    time: job.lastRunAt ? stamp(job.lastRunAt, locale) : t('jobs.never')
                  })}
                </span>
                {job.storageId && <span>↥ {storageName(conns, job.storageId)}</span>}
              </div>
              {job.lastError && (
                <div className="mt-1 text-meta text-danger-soft">{job.lastError}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button loading={job.running || runningLabel === job.id} onClick={() => onRun(job)}>
                {t('jobs.runNow')}
              </Button>
              <Button variant="ghost" onClick={() => onEdit(job)}>
                {t('common.edit')}
              </Button>
              <Button variant="danger" onClick={() => onRemove(job)}>
                {t('common.delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
