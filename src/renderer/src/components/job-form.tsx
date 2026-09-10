/**
 * The scheduler job form.
 *
 * Cron is in there for whoever wants it, but it is the last option, not the
 * first: "every day at 03:00" is what a backup schedule almost always is, and
 * that shouldn't require remembering field order.
 */
import { useState, type ReactNode } from 'react'
import type {
  BackupScope,
  Job,
  Project,
  ScheduleKind,
  ScheduleSpec,
  StorageConnection
} from '@shared/types'
import { call } from '../lib/ipc'
import { useAction } from '../lib/use-action'
import { useT, type TranslationKey } from '../i18n'
import { Button, ErrorNote, Input, Modal, Row, Select, Toggle } from './ui'

const WEEKDAY_KEYS: TranslationKey[] = [
  'jobs.weekday.sun',
  'jobs.weekday.mon',
  'jobs.weekday.tue',
  'jobs.weekday.wed',
  'jobs.weekday.thu',
  'jobs.weekday.fri',
  'jobs.weekday.sat'
]

type T = ReturnType<typeof useT>

/** The one-line summary shown in the job list. */
export function describeSchedule(spec: ScheduleSpec, t: T): string {
  switch (spec.kind) {
    case 'interval':
      return t('jobs.schedule.interval', { count: spec.everyMinutes ?? 0 })
    case 'daily':
      return t('jobs.schedule.daily', { time: spec.at ?? '' })
    case 'weekly':
      return t('jobs.schedule.weekly', {
        day: t(WEEKDAY_KEYS[spec.weekday ?? 0] ?? 'jobs.weekday.sun'),
        time: spec.at ?? ''
      })
    case 'cron':
      return t('jobs.schedule.cron', { expr: spec.expr ?? '' })
    default:
      return ''
  }
}

export function scopeOptions(t: T): Array<{ value: string; label: string }> {
  return [
    { value: 'full', label: t('backups.scope.full') },
    { value: 'schema', label: t('backups.scope.schema') },
    { value: 'data', label: t('backups.scope.data') }
  ]
}

export function JobFormModal({
  project,
  job,
  storages,
  onClose,
  onOpenSettings,
  onSaved
}: {
  project: Project
  job: Job | null
  storages: StorageConnection[]
  onClose: () => void
  /** Storage connections are added in Settings — the form says where. */
  onOpenSettings: () => void
  onSaved: () => void
}): ReactNode {
  const t = useT()
  const [name, setName] = useState(job?.name ?? '')
  const [enabled, setEnabled] = useState(job?.enabled ?? true)
  const [envId, setEnvId] = useState<string>(job?.envId ?? '')
  const [scope, setScope] = useState<BackupScope>(job?.scope ?? 'full')
  const [kind, setKind] = useState<ScheduleKind>(job?.schedule.kind ?? 'daily')
  const [everyMinutes, setEveryMinutes] = useState(String(job?.schedule.everyMinutes ?? 60))
  const [at, setAt] = useState(job?.schedule.at ?? '03:00')
  const [weekday, setWeekday] = useState(String(job?.schedule.weekday ?? 1))
  const [expr, setExpr] = useState(job?.schedule.expr ?? '0 3 * * *')
  const [storageId, setStorageId] = useState(job?.storageId ?? '')
  const [keepLocal, setKeepLocal] = useState(job?.keepLocal ?? true)
  const [retentionDays, setRetentionDays] = useState(String(job?.retentionDays ?? 14))
  const [retentionCount, setRetentionCount] = useState(String(job?.retentionCount ?? 10))
  const { run, busy: saving, error } = useAction()

  const schedule = (): ScheduleSpec => {
    switch (kind) {
      case 'interval':
        return { kind, everyMinutes: Number(everyMinutes) }
      case 'daily':
        return { kind, at }
      case 'weekly':
        return { kind, at, weekday: Number(weekday) }
      default:
        return { kind: 'cron', expr }
    }
  }

  const save = async (): Promise<void> => {
    const ok = await run(async () => {
      await call('jobs:upsert', {
        job: {
          id: job?.id,
          projectId: project.id,
          name,
          type: 'backup',
          enabled,
          envId: envId || null,
          schedule: schedule(),
          scope,
          storageId: storageId || null,
          keepLocal: storageId ? keepLocal : true,
          retentionDays: Number(retentionDays) || 0,
          retentionCount: Number(retentionCount) || 0
        }
      })
      return true
    })
    if (ok) onSaved()
  }

  return (
    <Modal
      title={t('jobs.form.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('jobs.form.save')}
          </Button>
        </>
      }
    >
      <div className="divide-y divide-line-soft">
        {error && (
          <div className="pb-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        <Row label={t('jobs.form.name')}>
          <Input
            value={name}
            placeholder={t('jobs.form.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </Row>

        <Row label={t('jobs.form.enabled')}>
          <Toggle checked={enabled} onChange={setEnabled} />
        </Row>

        <Row label={t('jobs.form.target')}>
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
        </Row>

        <Row label={t('jobs.form.scope')}>
          <Select
            value={scope}
            onChange={(v) => setScope(v as BackupScope)}
            options={scopeOptions(t)}
          />
        </Row>

        <Row label={t('jobs.form.schedule')}>
          <div className="flex flex-col gap-2">
            <Select
              value={kind}
              onChange={(v) => setKind(v as ScheduleKind)}
              options={[
                { value: 'daily', label: t('jobs.form.kind.daily') },
                { value: 'weekly', label: t('jobs.form.kind.weekly') },
                { value: 'interval', label: t('jobs.form.kind.interval') },
                { value: 'cron', label: t('jobs.form.kind.cron') }
              ]}
            />
            {kind === 'interval' && (
              <label className="flex items-center gap-2 text-small text-muted">
                <span className="w-40">{t('jobs.form.everyMinutes')}</span>
                <Input
                  type="number"
                  min={1}
                  value={everyMinutes}
                  onChange={(e) => setEveryMinutes(e.target.value)}
                />
              </label>
            )}
            {(kind === 'daily' || kind === 'weekly') && (
              <label className="flex items-center gap-2 text-small text-muted">
                <span className="w-40">{t('jobs.form.time')}</span>
                <Input value={at} placeholder="03:00" onChange={(e) => setAt(e.target.value)} />
              </label>
            )}
            {kind === 'weekly' && (
              <label className="flex items-center gap-2 text-small text-muted">
                <span className="w-40">{t('jobs.form.weekday')}</span>
                <Select
                  value={weekday}
                  onChange={setWeekday}
                  options={WEEKDAY_KEYS.map((key, i) => ({ value: String(i), label: t(key) }))}
                />
              </label>
            )}
            {kind === 'cron' && (
              <>
                <Input
                  value={expr}
                  placeholder="0 3 * * *"
                  className="font-mono"
                  onChange={(e) => setExpr(e.target.value)}
                />
                <p className="text-small leading-snug text-muted">{t('jobs.form.cronHint')}</p>
              </>
            )}
          </div>
        </Row>

        <Row label={t('jobs.form.storage')}>
          <div className="flex flex-col gap-2">
            <Select
              value={storageId}
              onChange={setStorageId}
              options={[
                { value: '', label: t('backups.destination.none') },
                ...storages.map((s) => ({ value: s.id, label: `${s.name} · ${s.bucket}` }))
              ]}
            />
            {storageId !== '' && (
              <label className="flex items-center gap-2 text-small text-muted">
                <Toggle checked={keepLocal} onChange={setKeepLocal} />
                {t('jobs.form.keepLocal')}
              </label>
            )}
            {storages.length === 0 && (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-small text-muted">{t('backups.noStorage')}</p>
                <Button variant="ghost" onClick={onOpenSettings}>
                  {t('backups.openSettings')}
                </Button>
              </div>
            )}
          </div>
        </Row>

        <Row label={t('jobs.form.retentionDays')} hint={t('jobs.form.retentionHint')}>
          <div className="flex flex-col gap-2">
            <Input
              type="number"
              min={0}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            />
            <label className="flex items-center gap-2 text-small text-muted">
              <span className="w-40">{t('jobs.form.retentionCount')}</span>
              <Input
                type="number"
                min={0}
                value={retentionCount}
                onChange={(e) => setRetentionCount(e.target.value)}
              />
            </label>
          </div>
        </Row>
      </div>
    </Modal>
  )
}
