import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { MigrationRow, MigrationState, Project } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { Badge, Button, Card, ErrorNote, Input, Modal, Select, SkeletonTable } from '../components/ui'

const STATE_META: Record<MigrationState, { tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted'; label: string }> = {
  synced: { tone: 'ok', label: 'sinxron' },
  'pending-local': { tone: 'warn', label: 'lokala tətbiq olunmayıb' },
  'pending-remote': { tone: 'info', label: 'remote-da yoxdur' },
  'remote-only': { tone: 'danger', label: 'faylı yoxdur' },
  'local-only': { tone: 'danger', label: 'faylı yoxdur (lokal)' }
}

export function MigrationsRoute({ project }: { project: Project }): ReactNode {
  const [envId, setEnvId] = useState<string>(project.environments[0]?.id ?? '')
  const report = useQuery(
    'migrations:report',
    { id: project.id, envId: envId || null },
    [project.id, envId]
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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
      setBusy(label)
      setError(null)
      try {
        const res = await fn()
        if (!res.ok) setError(res.error ?? 'Uğursuz oldu')
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(null)
        report.refresh()
      }
    },
    [report]
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-[15px] font-medium">Miqrasiyalar</h1>
        <div className="w-56">
          <Select
            value={envId}
            onChange={setEnvId}
            options={[
              { value: '', label: 'Yalnız lokal' },
              ...project.environments.map((e) => ({ value: e.id, label: `↔ ${e.name}` }))
            ]}
          />
        </div>
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)}>+ miqrasiya</Button>
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
          Lokala tətbiq et
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          {report.error && <ErrorNote>{report.error}</ErrorNote>}
          {report.data?.error && <ErrorNote>{report.data.error}</ErrorNote>}

          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <Badge tone={report.data?.localReachable ? 'ok' : 'muted'}>
              lokal ledger {report.data?.localReachable ? 'oxundu' : 'əlçatmaz'}
            </Badge>
            {envId && (
              <Badge tone={report.data?.remoteReachable ? 'ok' : 'danger'}>
                remote ledger {report.data?.remoteReachable ? 'oxundu' : 'əlçatmaz'}
              </Badge>
            )}
            {Object.entries(counts).map(([state, n]) => (
              <Badge key={state} tone={STATE_META[state as MigrationState].tone}>
                {n} {STATE_META[state as MigrationState].label}
              </Badge>
            ))}
          </div>

          <Card title={`${rows.length} miqrasiya`} subtitle="fayllar · lokal ledger · remote ledger">
            {report.loading && (
              <SkeletonTable rows={6} cols={5} widths={['26%', '30%', 42, 42, 42]} />
            )}
            {!report.loading && rows.length === 0 && (
              <p className="px-3.5 py-6 text-center text-[12px] text-muted">
                supabase/migrations qovluğu boşdur.
              </p>
            )}
            {rows.length > 0 && (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line-soft text-[10.5px] tracking-wide text-muted uppercase">
                    <th className="px-3.5 py-1.5 text-left font-medium">Versiya</th>
                    <th className="px-2 py-1.5 text-left font-medium">Ad</th>
                    <th className="px-2 py-1.5 text-center font-medium">Fayl</th>
                    <th className="px-2 py-1.5 text-center font-medium">Lokal</th>
                    <th className="px-2 py-1.5 text-center font-medium">Remote</th>
                    <th className="px-3.5 py-1.5 text-right font-medium">Vəziyyət</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.version}
                      className={cx(
                        'border-b border-line-soft last:border-0',
                        r.state !== 'synced' && 'bg-[#131a12]/40'
                      )}
                    >
                      <td className="px-3.5 py-1.5 font-mono text-[11.5px]">{r.version}</td>
                      <td className="max-w-[280px] truncate px-2 py-1.5 text-muted">{r.name || '—'}</td>
                      <Cell on={r.inFiles} />
                      <Cell on={r.appliedLocal} />
                      <Cell on={r.appliedRemote} />
                      <td className="px-3.5 py-1.5 text-right">
                        {r.state === 'synced' ? (
                          <span className="text-[11px] text-muted">sinxron</span>
                        ) : (
                          <button
                            onClick={() => setRepairRow(r)}
                            disabled={!envId}
                            className="disabled:cursor-default disabled:opacity-100"
                          >
                            <Badge tone={STATE_META[r.state].tone}>{STATE_META[r.state].label}</Badge>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <p className="px-1 text-[11.5px] leading-relaxed text-muted">
            SQL-i Studio-dan tətbiq etmə: ledger sətri yazılmır və növbəti deploy ya faylı təkrar
            işlədir, ya da heç vaxt olmamış işi atlayır. Bir dəyişiklik = bir versiya nömrəsi.
          </p>
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
        <Modal wide title="db diff — lokal sxemdə tutulmayan dəyişikliklər" onClose={() => setDiff(null)}>
          <pre className="overflow-auto rounded-md border border-line bg-[#0d141b] p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
            {diff.trim() || 'Fərq yoxdur.'}
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
        <span className="text-[#3f4f5f]">–</span>
      ) : on ? (
        <span className="text-accent">✓</span>
      ) : (
        <span className="text-[#5a4a2a]">·</span>
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
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^[a-z0-9_]+$/.test(name)

  return (
    <Modal
      title="Yeni miqrasiya"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Ləğv et</Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={busy}
            onClick={() => {
              setBusy(true)
              setError(null)
              void onCreate(name)
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(false))
            }}
          >
            Yarat
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-[12px] text-muted">Ad</label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="add_feedback_table"
        className="font-mono"
        autoFocus
      />
      <p className="mt-2 text-[11.5px] text-muted">
        Yalnız kiçik hərf, rəqəm və alt xətt. Fayl `supabase/migrations/&lt;versiya&gt;_{name ||
          'ad'}.sql` kimi yaranır.
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
  const [busy, setBusy] = useState<'applied' | 'reverted' | null>(null)
  const go = (status: 'applied' | 'reverted'): void => {
    setBusy(status)
    void onRepair(status).finally(() => setBusy(null))
  }

  return (
    <Modal title={`Ledger təmiri — ${row.version}`} onClose={onClose}>
      <p className="mb-3 text-[12.5px] leading-relaxed">
        «{envName}» mühitinin ledger-i düzəldilir. <b>Heç bir SQL işə düşmür</b> — yalnız
        `supabase_migrations.schema_migrations` cədvəlindəki sətir dəyişir. Yalnız obyektlərin
        həqiqətən bazada olub-olmadığını təsdiqlədikdən sonra istifadə et.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="subtle" loading={busy === 'applied'} onClick={() => go('applied')}>
          «tətbiq olunub» kimi işarələ (sətri əlavə et)
        </Button>
        <Button variant="danger" loading={busy === 'reverted'} onClick={() => go('reverted')}>
          «geri qaytarılıb» kimi işarələ (sətri sil)
        </Button>
      </div>
    </Modal>
  )
}
