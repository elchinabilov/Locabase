/**
 * Backups and the jobs that take them.
 *
 * One screen for both, because they are the same operation: the button at the
 * top and a scheduled job run the identical engine, and every run — whoever
 * started it — lands in the same list underneath.
 */
import { useState, type ReactNode } from 'react'
import { z } from 'zod'
import type { BackupRecord, BackupScope, Job, Project } from '@shared/types'
import { call, useEvent, useQuery } from '../lib/ipc'
import { useAction } from '../lib/use-action'
import { projectKey, useUiState } from '../lib/ui-state'
import { stamp } from '../lib/format'
import { useI18n, useT } from '../i18n'
import { Button, ErrorNote, Input, Modal, Row, Select, Toggle } from '../components/ui'
import { envOptions } from '../components/env-picker'
import { JobList } from '../components/backups/job-list'
import { BackupList } from '../components/backups/backup-list'
import { shortFile } from '../components/backups/labels'
import { JobFormModal, scopeOptions } from '../components/job-form'

/* What the top bar restores. The environment and the storage connection are both
   ids that can disappear between two visits, so each is re-derived against the
   list actually on screen — a `<Select>` holding an id that is not one of its
   options renders as a blank box. */
const ENV_ID = z.string().max(200)
const SCOPE = z.enum(['full', 'schema', 'data'])
const STORAGE_ID = z.string().max(200)

export function BackupsRoute({
  project,
  onOpenSettings
}: {
  project: Project
  /** Storage connections live in Settings — this is the way there. */
  onOpenSettings: () => void
}): ReactNode {
  const t = useT()

  const backups = useQuery('backups:list', { id: project.id })
  const jobs = useQuery('jobs:list', { id: project.id })
  const storages = useQuery('storage:list', undefined)

  const [pickedEnv, setEnvId] = useUiState(projectKey(project.id, 'backups.env'), ENV_ID, '')
  const envId =
    pickedEnv !== '' && !project.environments.some((e) => e.id === pickedEnv) ? '' : pickedEnv
  const [scope, setScope] = useUiState<BackupScope>(
    projectKey(project.id, 'backups.scope'),
    SCOPE,
    'full'
  )
  const [pickedStorage, setStorageId] = useUiState(
    projectKey(project.id, 'backups.storage'),
    STORAGE_ID,
    ''
  )
  const storageId =
    storages.data && !storages.data.some((c) => c.id === pickedStorage) ? '' : pickedStorage
  const [keepLocal, setKeepLocal] = useUiState(
    projectKey(project.id, 'backups.keepLocal'),
    z.boolean(),
    true
  )
  const { run, busy: running, runningLabel, error } = useAction()

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
    await run(async () => {
      const record = await call('backups:run', {
        id: project.id,
        envId: envId || null,
        scope,
        storageId: storageId || null,
        keepLocal: storageId ? keepLocal : true
      })
      // A failed dump comes back as a record, not as a thrown error.
      if (record.status === 'failed') throw new Error(record.error ?? t('backups.status.failed'))
      return record
    })
    backups.refresh()
  }

  const runJob = async (job: Job): Promise<void> => {
    await run(() => call('jobs:runNow', { jobId: job.id }), job.id)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
        <h1 className="text-h2 font-medium">{t('backups.title')}</h1>
        <div className="w-52">
          <Select
            value={envId}
            onChange={setEnvId}
            options={envOptions(project, t('backups.localTarget'))}
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

          <JobList
            project={project}
            jobs={jobRows}
            loading={jobs.loading}
            conns={conns}
            runningLabel={runningLabel}
            onRun={(job) => void runJob(job)}
            onSetEnabled={(job, enabled) => {
              void run(() => call('jobs:setEnabled', { jobId: job.id, enabled })).then(jobs.refresh)
            }}
            onNew={() => setEditingJob('new')}
            onEdit={setEditingJob}
            onRemove={setRemovingJob}
          />

          <BackupList
            rows={rows}
            loading={backups.loading}
            conns={conns}
            onReveal={(row) => void run(() => call('backups:reveal', { backupId: row.id }))}
            onUpload={setUploading}
            onRestore={setRestoring}
            onRemove={setRemovingBackup}
          />
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
                  void run(() => call('jobs:remove', { jobId: removingJob.id })).then(() => {
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
  const { run, busy, error } = useAction()

  const remove = async (): Promise<void> => {
    const ok = await run(() => call('backups:remove', { backupId: record.id, deleteFile }))
    if (ok !== undefined) onDone()
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
  const { run, busy, error } = useAction()

  const upload = async (): Promise<void> => {
    const ok = await run(() => call('backups:upload', { backupId: record.id, storageId }))
    if (ok !== undefined) onDone()
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
  const { run, busy, error } = useAction()
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
    await run(async () => {
      const result = await call('backups:restore', {
        backupId: record.id,
        envId: envId || null,
        clean,
        confirm
      })
      // A failed restore reports itself in the result rather than throwing.
      if (!result.ok) throw new Error(result.error ?? t('backups.status.failed'))
      setDone({
        name: result.envName,
        seconds: Math.round(result.durationMs / 1000),
        output: result.output,
        failed: result.failedStatements
      })
      return result
    })
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
              options={envOptions(project, t('backups.localTarget'))}
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
