import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { MigrationRow, MigrationState, Project } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { useAction } from '../lib/use-action'
import { cx } from '../lib/format'
import { useT, type TranslationKey } from '../i18n'
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Input,
  Modal,
  Select,
  SkeletonTable
} from '../components/ui'

const STATE_META: Record<
  MigrationState,
  { tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted'; labelKey: TranslationKey }
> = {
  synced: { tone: 'ok', labelKey: 'migrations.state.synced' },
  'pending-local': { tone: 'warn', labelKey: 'migrations.state.pendingLocal' },
  'pending-remote': { tone: 'info', labelKey: 'migrations.state.pendingRemote' },
  'remote-only': { tone: 'danger', labelKey: 'migrations.state.remoteOnly' },
  'local-only': { tone: 'danger', labelKey: 'migrations.state.localOnly' }
}

export function MigrationsRoute({ project }: { project: Project }): ReactNode {
  const t = useT()
  // `picked` is the explicit choice; the id is re-derived every render so a
  // removed environment falls back to local instead of being queried after it
  // has stopped existing. Empty string = the local stack.
  const [picked, setPicked] = useState<string>('')
  const envId = project.environments.some((e) => e.id === picked) ? picked : ''
  const setEnvId = setPicked
  const report = useQuery('migrations:report', { id: project.id, envId: envId || null })
  const { run, runningLabel: busy, error } = useAction()
  const [creating, setCreating] = useState(false)
  const [diff, setDiff] = useState<string | null>(null)
  const [repairRow, setRepairRow] = useState<MigrationRow | null>(null)

  const rows = report.data?.rows ?? []
  const counts = useMemo(() => {
    const out: Partial<Record<MigrationState, number>> = {}
    for (const r of rows) out[r.state] = (out[r.state] ?? 0) + 1
    return out
  }, [rows])

  const runTask = useCallback(
    async (label: string, fn: () => Promise<{ ok: boolean; error: string | null }>) => {
      await run(async () => {
        const res = await fn()
        // These handlers report a refusal in the result rather than throwing.
        if (!res.ok) throw new Error(res.error ?? t('dashboard.reset.genericError'))
        return res
      }, label)
      report.refresh()
    },
    [report, t, run]
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-h2 font-medium">{t('app.nav.migrations')}</h1>
        <div className="w-56">
          <Select
            value={envId}
            onChange={setEnvId}
            options={[
              { value: '', label: t('functions.localOnly') },
              ...project.environments.map((e) => ({ value: e.id, label: `↔ ${e.name}` }))
            ]}
          />
        </div>
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)}>{t('migrations.newMigration')}</Button>
        <Button
          loading={busy === 'diff'}
          onClick={() =>
            void runTask('diff', async () => {
              const res = await call('migrations:diff', { id: project.id })
              setDiff(res.sql)
              return { ok: true, error: null }
            })
          }
        >
          db diff
        </Button>
        <Button
          variant="primary"
          loading={busy === 'up'}
          onClick={() => void runTask('up', () => call('migrations:up', { id: project.id }))}
        >
          {t('migrations.applyLocal')}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          {report.error && <ErrorNote>{report.error}</ErrorNote>}
          {report.data?.error && <ErrorNote>{report.data.error}</ErrorNote>}

          <div className="flex flex-wrap items-center gap-2 text-small">
            <Badge tone={report.data?.localReachable ? 'ok' : 'muted'}>
              {t('migrations.localLedger', {
                status: report.data?.localReachable
                  ? t('migrations.read')
                  : t('migrations.unreachable')
              })}
            </Badge>
            {envId && (
              <Badge tone={report.data?.remoteReachable ? 'ok' : 'danger'}>
                {t('migrations.remoteLedger', {
                  status: report.data?.remoteReachable
                    ? t('migrations.read')
                    : t('migrations.unreachable')
                })}
              </Badge>
            )}
            {Object.entries(counts).map(([state, n]) => (
              <Badge key={state} tone={STATE_META[state as MigrationState].tone}>
                {n} {t(STATE_META[state as MigrationState].labelKey)}
              </Badge>
            ))}
          </div>

          <Card
            title={t('migrations.count', { count: rows.length })}
            subtitle={t('migrations.cardSubtitle')}
          >
            {report.loading && (
              <SkeletonTable rows={6} cols={5} widths={['26%', '30%', 42, 42, 42]} />
            )}
            {!report.loading && rows.length === 0 && (
              <p className="px-3.5 py-6 text-center text-note text-muted">
                {t('migrations.empty')}
              </p>
            )}
            {rows.length > 0 && (
              <table className="w-full text-note">
                <thead>
                  <tr className="border-b border-line-soft text-badge tracking-wide text-muted uppercase">
                    <th className="px-3.5 py-1.5 text-left font-medium">
                      {t('migrations.col.version')}
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium">
                      {t('migrations.col.name')}
                    </th>
                    <th className="px-2 py-1.5 text-center font-medium">
                      {t('migrations.col.file')}
                    </th>
                    <th className="px-2 py-1.5 text-center font-medium">
                      {t('migrations.col.local')}
                    </th>
                    <th className="px-2 py-1.5 text-center font-medium">
                      {t('migrations.col.remote')}
                    </th>
                    <th className="px-3.5 py-1.5 text-right font-medium">
                      {t('migrations.col.state')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.version}
                      className={cx(
                        'border-b border-line-soft last:border-0',
                        r.state !== 'synced' && 'bg-accent-tint/40'
                      )}
                    >
                      <td className="px-3.5 py-1.5 font-mono text-small">{r.version}</td>
                      <td className="max-w-[280px] truncate px-2 py-1.5 text-muted">
                        {r.name || '—'}
                      </td>
                      <Cell on={r.inFiles} />
                      <Cell on={r.appliedLocal} />
                      <Cell on={r.appliedRemote} />
                      <td className="px-3.5 py-1.5 text-right">
                        {r.state === 'synced' ? (
                          <span className="text-meta text-muted">
                            {t('migrations.state.synced')}
                          </span>
                        ) : (
                          <button
                            onClick={() => setRepairRow(r)}
                            disabled={!envId}
                            className="disabled:cursor-default disabled:opacity-100"
                          >
                            <Badge tone={STATE_META[r.state].tone}>
                              {t(STATE_META[r.state].labelKey)}
                            </Badge>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <p className="px-1 text-small leading-relaxed text-muted">{t('migrations.footerHint')}</p>
        </div>
      </div>

      {creating && (
        <NewMigration
          onClose={() => setCreating(false)}
          onCreate={async (name) => {
            const res = await call('migrations:new', { id: project.id, name })
            setCreating(false)
            report.refresh()
            return res.file
          }}
        />
      )}

      {diff !== null && (
        <Modal wide title={t('migrations.diffTitle')} onClose={() => setDiff(null)}>
          <pre className="overflow-auto rounded-md border border-line bg-sunken p-3 font-mono text-small leading-relaxed whitespace-pre-wrap">
            {diff.trim() || t('diffView.noDiff')}
          </pre>
        </Modal>
      )}

      {repairRow && envId && (
        <RepairModal
          row={repairRow}
          envName={project.environments.find((e) => e.id === envId)?.name ?? ''}
          onClose={() => setRepairRow(null)}
          onRepair={async (status) => {
            await runTask('repair', () =>
              call('migrations:repair', {
                id: project.id,
                envId,
                version: repairRow.version,
                status
              })
            )
            setRepairRow(null)
          }}
        />
      )}
    </div>
  )
}

function Cell({ on }: { on: boolean | null }): ReactNode {
  return (
    <td className="px-2 py-1.5 text-center">
      {on === null ? (
        <span className="text-dimmer">–</span>
      ) : on ? (
        <span className="text-accent">✓</span>
      ) : (
        <span className="text-warn-dim">·</span>
      )}
    </td>
  )
}

function NewMigration({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (name: string) => Promise<string>
}): ReactNode {
  const t = useT()
  const [name, setName] = useState('')
  const { run, busy, error } = useAction()
  const valid = /^[a-z0-9_]+$/.test(name)

  return (
    <Modal
      title={t('migrations.newTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={busy}
            onClick={() => void run(() => onCreate(name))}
          >
            {t('functions.create')}
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-note text-muted">{t('newProject.name.label')}</label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="add_feedback_table"
        className="font-mono"
        autoFocus
      />
      <p className="mt-2 text-small text-muted">
        {t('migrations.nameHint', { name: name || t('functions.namePlaceholder') })}
      </p>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  )
}

function RepairModal({
  row,
  envName,
  onClose,
  onRepair
}: {
  row: MigrationRow
  envName: string
  onClose: () => void
  onRepair: (status: 'applied' | 'reverted') => Promise<void>
}): ReactNode {
  const t = useT()
  const [busy, setBusy] = useState<'applied' | 'reverted' | null>(null)
  const go = (status: 'applied' | 'reverted'): void => {
    setBusy(status)
    void onRepair(status).finally(() => setBusy(null))
  }

  return (
    <Modal title={t('migrations.repairTitle', { version: row.version })} onClose={onClose}>
      <p className="mb-3 text-ui leading-relaxed">
        {t('migrations.repairBodyBefore', { env: envName })} <b>{t('migrations.repairBodyBold')}</b>{' '}
        {t('migrations.repairBodyAfter')}
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="subtle" loading={busy === 'applied'} onClick={() => go('applied')}>
          {t('migrations.markApplied')}
        </Button>
        <Button variant="danger" loading={busy === 'reverted'} onClick={() => go('reverted')}>
          {t('migrations.markReverted')}
        </Button>
      </div>
    </Modal>
  )
}
