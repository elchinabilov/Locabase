/**
 * Backups and the jobs that take them.
 *
 * One screen for both, because they are the same operation: the button at the
 * top and a scheduled job run the identical engine, and every run — whoever
 * started it — lands in the same list underneath.
 */
import { useState, type ReactNode } from 'react'
import type { BackupRecord, BackupScope, Job, Project } from '@shared/types'
import { call, useEvent, useQuery } from '../lib/ipc'
import { bytes as humanBytes, cx, stamp } from '../lib/format'
import { useI18n, useT } from '../i18n'
import {
  Badge,
  Button,
  Card,
  Dot,
  ErrorNote,
  Input,
  Modal,
  Row,
  Select,
  SkeletonList,
  Toggle
} from '../components/ui'
import { describeSchedule, JobFormModal, scopeOptions } from '../components/job-form'

export function BackupsRoute({
  project,
  onOpenSettings
}: {
  project: Project
  /** Storage connections live in Settings — this is the way there. */
  onOpenSettings: () => void
}): ReactNode {
  const t = useT()
  const { locale } = useI18n()

  const backups = useQuery('backups:list', { id: project.id })
  const jobs = useQuery('jobs:list', { id: project.id })
  const storages = useQuery('storage:list', undefined)

  const [envId, setEnvId] = useState('')
  const [scope, setScope] = useState<BackupScope>('full')
  const [storageId, setStorageId] = useState('')
  const [keepLocal, setKeepLocal] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingJob, setEditingJob] = useState<Job | null | 'new'>(null)
  const [removingJob, setRemovingJob] = useState<Job | null>(null)
  const [removingBackup, setRemovingBackup] = useState<BackupRecord | null>(null)
  const [uploading, setUploading] = useState<BackupRecord | null>(null)
  const [restoring, setRestoring] = useState<BackupRecord | null>(null)

  // A job can fire while this screen is open — main tells us, we reload.
  useEvent('backups:changed', (p) => {
    if (p.projectId === project.id) backups.refresh()
  })
  useEvent('jobs:changed', (p) => {
    if (p.projectId === project.id) jobs.refresh()
  })

  const conns = storages.data ?? []
  const rows = backups.data ?? []
  const jobRows = jobs.data ?? []

  const takeBackup = async (): Promise<void> => {
    setRunning(true)
    setError(null)
    try {
      const record = await call('backups:run', {
        id: project.id,
        envId: envId || null,
        scope,
        storageId: storageId || null,
        keepLocal: storageId ? keepLocal : true
      })
      // A failed dump comes back as a record, not as a thrown error.
      if (record.status === 'failed') setError(record.error)
      backups.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const runJob = async (job: Job): Promise<void> => {
    setError(null)
    try {
      await call('jobs:runNow', { jobId: job.id })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
        <h1 className="text-h2 font-medium">{t('backups.title')}</h1>
        <div className="w-52">
          <Select
            value={envId}
            onChange={setEnvId}
            options={[
              { value: '', label: `⌂ ${t('backups.localTarget')}` },
              ...project.environments.map((e) => ({
                value: e.id,
                label: `${e.kind === 'managed' ? '☁' : '⛁'} ${e.name}`
              }))
            ]}
          />
        </div>
        <div className="w-44">
          <Select
            value={scope}
            onChange={(v) => setScope(v as BackupScope)}
            options={scopeOptions(t)}
          />
        </div>
        <div className="w-52">
          <Select
            value={storageId}
            onChange={setStorageId}
            options={[
              { value: '', label: t('backups.destination.none') },
              ...conns.map((s) => ({ value: s.id, label: `↥ ${s.name}` }))
            ]}
          />
        </div>
        <Button variant="ghost" onClick={onOpenSettings} title={t('storage.title')}>
          {t('backups.openSettings')}
        </Button>
        {storageId !== '' && (
          <label className="flex items-center gap-2 text-small text-muted">
            <Toggle checked={keepLocal} onChange={setKeepLocal} />
            {t('backups.keepLocal')}
          </label>
        )}
        <div className="flex-1" />
        <Button variant="primary" loading={running} onClick={() => void takeBackup()}>
          {running ? t('backups.taking') : t('backups.take')}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          {backups.error && <ErrorNote>{backups.error}</ErrorNote>}
          {jobs.error && <ErrorNote>{jobs.error}</ErrorNote>}
          {conns.length === 0 && (
            <div className="flex items-center gap-3 rounded-md border border-info-border bg-info-bg px-3.5 py-2 text-note text-info">
              <span className="min-w-0 flex-1">{t('backups.noStorage')}</span>
              <Button onClick={onOpenSettings}>{t('backups.openSettings')}</Button>
            </div>
          )}

          <Card
            title={t('jobs.title')}
            subtitle={t('jobs.subtitle')}
            actions={<Button onClick={() => setEditingJob('new')}>{t('jobs.new')}</Button>}
          >
            {jobs.loading && <SkeletonList rows={2} avatar trailing />}
            {!jobs.loading && jobRows.length === 0 && (
              <p className="px-3.5 py-6 text-center text-note text-muted">{t('jobs.empty')}</p>
            )}
            <ul className="divide-y divide-line-soft">
              {jobRows.map((job) => (
                <li key={job.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Toggle
                    checked={job.enabled}
                    onChange={(on) => {
                      void call('jobs:setEnabled', { jobId: job.id, enabled: on }).then(
                        jobs.refresh
                      )
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-ui text-text">{job.name}</span>
                      <Badge tone="muted">
                        {envLabel(project, job.envId, t('backups.localTarget'))}
                      </Badge>
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
                    <Button loading={job.running} onClick={() => void runJob(job)}>
                      {t('jobs.runNow')}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingJob(job)}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="danger" onClick={() => setRemovingJob(job)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t('backups.count', { count: rows.length })}
            subtitle={t('backups.restoreHint')}
          >
            {backups.loading && <SkeletonList rows={4} avatar trailing />}
            {!backups.loading && rows.length === 0 && (
              <p className="px-3.5 py-6 text-center text-note text-muted">{t('backups.empty')}</p>
            )}
            <ul className="divide-y divide-line-soft">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Dot
                    tone={row.status === 'ok' ? 'ok' : row.status === 'running' ? 'warn' : 'danger'}
                  />
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
                            row.status === 'running'
                              ? 'backups.status.running'
                              : 'backups.status.failed'
                          )}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 font-mono text-badge text-faint">
                      <span>{humanBytes(row.bytes)}</span>
                      {row.durationMs !== null && (
                        <span>
                          {t('backups.seconds', { count: Math.round(row.durationMs / 1000) })}
                        </span>
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
                    {row.error && (
                      <div className="mt-1 text-meta text-danger-soft">{row.error}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {row.path && (
                      <Button
                        variant="ghost"
                        onClick={() => void call('backups:reveal', { backupId: row.id })}
                      >
                        {t('backups.reveal')}
                      </Button>
                    )}
                    {row.path && conns.length > 0 && (
                      <Button variant="ghost" onClick={() => setUploading(row)}>
                        {t('backups.upload')}
                      </Button>
                    )}
                    {row.status === 'ok' && (row.path || row.storageKey) && (
                      <Button onClick={() => setRestoring(row)}>{t('backups.restore')}</Button>
                    )}
                    <Button variant="danger" onClick={() => setRemovingBackup(row)}>
                      {t('backups.remove')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {editingJob && (
        <JobFormModal
          project={project}
          job={editingJob === 'new' ? null : editingJob}
          storages={conns}
          onOpenSettings={() => {
            setEditingJob(null)
            onOpenSettings()
          }}
          onClose={() => setEditingJob(null)}
          onSaved={() => {
            setEditingJob(null)
            jobs.refresh()
          }}
        />
      )}

      {removingJob && (
        <Modal
          title={t('jobs.removeTitle', { name: removingJob.name })}
          onClose={() => setRemovingJob(null)}
          footer={
            <>
              <Button onClick={() => setRemovingJob(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void call('jobs:remove', { jobId: removingJob.id }).then(() => {
                    setRemovingJob(null)
                    jobs.refresh()
                  })
                }}
              >
                {t('common.delete')}
              </Button>
            </>
          }
        >
          <p className="text-ui leading-relaxed text-muted">{t('jobs.removeHint')}</p>
        </Modal>
      )}

      {removingBackup && (
        <RemoveBackupModal
          record={removingBackup}
          onClose={() => setRemovingBackup(null)}
          onDone={() => {
            setRemovingBackup(null)
            backups.refresh()
          }}
        />
      )}

      {restoring && (
        <RestoreModal project={project} record={restoring} onClose={() => setRestoring(null)} />
      )}

      {uploading && (
        <UploadModal
          record={uploading}
          storages={conns}
          onClose={() => setUploading(null)}
          onDone={() => {
            setUploading(null)
            backups.refresh()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ modals */

function RemoveBackupModal({
  record,
  onClose,
  onDone
}: {
  record: BackupRecord
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const t = useT()
  const [deleteFile, setDeleteFile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const remove = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await call('backups:remove', { id: record.projectId, backupId: record.id, deleteFile })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('backups.removeTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={busy} onClick={() => void remove()}>
            {t('backups.remove')}
          </Button>
        </>
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <p className="text-ui leading-relaxed text-muted">{t('backups.removeHint')}</p>
      <label className="mt-3 flex items-center gap-2 text-ui">
        <Toggle checked={deleteFile} onChange={setDeleteFile} />
        {t('backups.removeFiles')}
      </label>
    </Modal>
  )
}

function UploadModal({
  record,
  storages,
  onClose,
  onDone
}: {
  record: BackupRecord
  storages: Array<{ id: string; name: string; bucket: string }>
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const t = useT()
  const [storageId, setStorageId] = useState(record.storageId ?? storages[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await call('backups:upload', { backupId: record.id, storageId })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('backups.uploadTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!storageId}
            onClick={() => void upload()}
          >
            {t('backups.upload')}
          </Button>
        </>
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-col gap-2">
        <Input value={record.path ?? ''} readOnly className="font-mono text-meta" />
        <Select
          value={storageId}
          onChange={setStorageId}
          options={storages.map((s) => ({ value: s.id, label: `${s.name} · ${s.bucket}` }))}
        />
      </div>
    </Modal>
  )
}

/**
 * Restore is the one screen here that destroys data, so it asks for three
 * separate decisions: **where** it goes (a production dump into the local stack
 * is the common case, not a restore onto production), whether existing objects
 * are dropped first, and the target's name typed out — the same guard the stack
 * reset uses.
 */
function RestoreModal({
  project,
  record,
  onClose
}: {
  project: Project
  record: BackupRecord
  onClose: () => void
}): ReactNode {
  const t = useT()
  const { locale } = useI18n()
  const [envId, setEnvId] = useState(record.envId ?? '')
  const [clean, setClean] = useState(true)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{
    name: string
    seconds: number
    output: string
    failed: number
  } | null>(null)

  const target = project.environments.find((e) => e.id === envId) ?? null
  // The confirmation is the environment's own name; local has no name of its own.
  const expected = target?.name ?? 'local'
  const fromStorage = !record.path && Boolean(record.storageKey)

  const restore = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await call('backups:restore', {
        backupId: record.id,
        envId: envId || null,
        clean,
        confirm
      })
      if (result.ok) {
        setDone({
          name: result.envName,
          seconds: Math.round(result.durationMs / 1000),
          output: result.output,
          failed: result.failedStatements
        })
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('backups.restoreTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{done ? t('common.close') : t('common.cancel')}</Button>
          {!done && (
            <Button
              variant="danger"
              loading={busy}
              disabled={confirm.trim() !== expected}
              onClick={() => void restore()}
            >
              {busy ? t('backups.restoreRunning') : t('backups.restore')}
            </Button>
          )}
        </>
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}

      {done ? (
        <div className="flex flex-col gap-2">
          <p className="text-ui text-accent">
            {t('backups.restoreOk', { name: done.name, count: done.seconds })}
          </p>
          {done.failed > 0 && (
            <p className="text-note text-warn">
              {t('backups.restoreWarnings', { count: done.failed })}
            </p>
          )}
          {done.output.trim() && (
            <pre className="max-h-64 overflow-auto rounded-md border border-line bg-sunken px-3 py-2 font-mono text-meta text-muted">
              {done.output.trim()}
            </pre>
          )}
        </div>
      ) : (
        <div className="divide-y divide-line-soft">
          <Row label={t('backups.restoreSource')}>
            <div className="flex flex-col gap-1">
              <code className="truncate text-meta text-muted">
                {record.path ? shortFile(record.path) : (record.storageKey ?? '')}
              </code>
              <span className="text-badge text-faint">
                {stamp(record.startedAt, locale)} · {record.format} · {record.envName}
              </span>
              {fromStorage && (
                <span className="text-small text-info">{t('backups.restoreFromStorage')}</span>
              )}
            </div>
          </Row>

          <Row label={t('backups.restoreTarget')}>
            <Select
              value={envId}
              onChange={(v) => {
                setEnvId(v)
                setConfirm('')
              }}
              options={[
                { value: '', label: `⌂ ${t('backups.localTarget')}` },
                ...project.environments.map((e) => ({
                  value: e.id,
                  label: `${e.kind === 'managed' ? '☁' : '⛁'} ${e.name}`
                }))
              ]}
            />
          </Row>

          {record.format === 'custom' && (
            <Row label={t('backups.restoreClean')}>
              <Toggle checked={clean} onChange={setClean} />
            </Row>
          )}

          {target?.kind === 'managed' && (
            <p className="py-2 text-small leading-relaxed text-warn">
              {t('backups.restoreManagedNote')}
            </p>
          )}

          <Row
            label={t('backups.restoreConfirm', { name: expected })}
            hint={t('backups.restoreWarning')}
          >
            <Input
              value={confirm}
              placeholder={expected}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Row>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ helpers */

function envLabel(project: Project, envId: string | null, localLabel: string): string {
  if (!envId) return localLabel
  return project.environments.find((e) => e.id === envId)?.name ?? envId
}

function storageName(storages: Array<{ id: string; name: string }>, storageId: string): string {
  return storages.find((s) => s.id === storageId)?.name ?? storageId
}

function scopeKey(
  scope: BackupScope
): 'backups.scope.full' | 'backups.scope.schema' | 'backups.scope.data' {
  return scope === 'schema'
    ? 'backups.scope.schema'
    : scope === 'data'
      ? 'backups.scope.data'
      : 'backups.scope.full'
}

/** `…/supabase/.backups/prod/app-prod-20260909-030000.dump` → the file name. */
function shortFile(path: string): string {
  return path.split('/').pop() ?? path
}
