import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { useT } from '../i18n'
import { Badge, Button, Card, ErrorNote, Input, Modal, SkeletonList } from '../components/ui'

export function SecretsRoute({ project }: { project: Project }): ReactNode {
  const t = useT()
  const [reveal, setReveal] = useState(false)
  const entries = useQuery('env:read', { id: project.id, reveal }, [project.id, reveal])
  const doc = useQuery('config:read', { id: project.id }, [project.id])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /** When `config.toml` says `env(X)` but `.env` has no X. */
  const missing = useMemo(() => {
    const values = doc.data?.values ?? {}
    const out: Array<{ varName: string; path: string }> = []
    for (const [path, fv] of Object.entries(values)) {
      if (fv.kind === 'env' && fv.envValue === null) out.push({ varName: String(fv.value), path })
    }
    return out
  }, [doc.data])

  const dirty = Object.keys(edits).length > 0

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await call('env:write', {
        id: project.id,
        entries: Object.entries(edits).map(([key, value]) => ({ key, value }))
      })
      setEdits({})
      entries.refresh()
      doc.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [project.id, edits, entries, doc])

  const remove = useCallback(
    async (key: string) => {
      await call('env:delete', { id: project.id, key })
      entries.refresh()
      doc.refresh()
    },
    [project.id, entries, doc]
  )

  const list = entries.data ?? []

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-[15px] font-medium">{t('app.nav.secrets')}</h1>
        <span className="font-mono text-[11px] text-muted">{project.envFile}</span>
        <div className="flex-1" />
        <Button onClick={() => setReveal((v) => !v)}>
          {reveal ? t('fieldEditor.hide') : t('secrets.showValues')}
        </Button>
        <Button onClick={() => setAdding(true)}>{t('secrets.addVar')}</Button>
        {dirty && (
          <>
            <Badge tone="ok">{Object.keys(edits).length}</Badge>
            <Button onClick={() => setEdits({})}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void save()} loading={saving}>
              {t('secrets.write')}
            </Button>
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          {entries.error && <ErrorNote>{entries.error}</ErrorNote>}

          {missing.length > 0 && (
            <div className="rounded-md border border-[#4a3c17] bg-[#211c10] px-3.5 py-2.5 text-[12px] text-warn">
              <p className="mb-1.5 font-medium">{t('secrets.missingHeading', { count: missing.length })}</p>
              <ul className="space-y-0.5 font-mono text-[11px]">
                {missing.slice(0, 8).map((m) => (
                  <li key={m.path}>
                    {m.varName} <span className="text-[#8a7440]">← {m.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card title={t('secrets.cardTitle')} subtitle={t('secrets.cardSubtitle')}>
            {entries.loading && <SkeletonList rows={5} trailing />}
            {!entries.loading && list.length === 0 && (
              <p className="px-3.5 py-6 text-center text-[12px] text-muted">
                {t('secrets.fileEmpty', { file: project.envFile })}
              </p>
            )}
            <ul className="divide-y divide-line-soft">
              {list.map((e) => {
                const value = edits[e.key] ?? e.value
                const changed = e.key in edits
                return (
                  <li
                    key={e.key}
                    className={cx('grid grid-cols-[minmax(220px,300px)_1fr_auto] items-start gap-3 px-3.5 py-2', changed && 'bg-[#101c17]')}
                  >
                    <div className="pt-1.5">
                      <code className="font-mono text-[12px] text-text">{e.key}</code>
                      {e.referencedBy.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {e.referencedBy.map((p) => (
                            <div key={p} className="font-mono text-[10px] text-[#54677a]">
                              ← {p}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-[10px] text-[#54677a]">{t('secrets.unused')}</div>
                      )}
                    </div>
                    <Input
                      value={value}
                      disabled={e.masked && !changed}
                      onChange={(ev) => setEdits((prev) => ({ ...prev, [e.key]: ev.target.value }))}
                      onFocus={() => {
                        if (e.masked && !changed) setEdits((prev) => ({ ...prev, [e.key]: '' }))
                      }}
                      className="font-mono"
                    />
                    <button
                      onClick={() => void remove(e.key)}
                      className="mt-1.5 text-[11px] text-muted hover:text-danger"
                    >
                      {t('common.delete').toLowerCase()}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          <p className="px-1 text-[11.5px] leading-relaxed text-muted">{t('secrets.footerHint')}</p>
        </div>
      </div>

      {adding && (
        <AddVar
          onClose={() => setAdding(false)}
          onAdd={async (key, value) => {
            await call('env:write', { id: project.id, entries: [{ key, value }] })
            setAdding(false)
            entries.refresh()
            doc.refresh()
          }}
          suggestions={missing.map((m) => m.varName)}
        />
      )}
    </div>
  )
}

function AddVar({
  onClose,
  onAdd,
  suggestions
}: {
  onClose: () => void
  onAdd: (key: string, value: string) => Promise<void>
  suggestions: string[]
}): ReactNode {
  const t = useT()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const uniq = [...new Set(suggestions)].slice(0, 6)

  return (
    <Modal
      title={t('secrets.newVarTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)}
            onClick={() => {
              setBusy(true)
              void onAdd(key, value).finally(() => setBusy(false))
            }}
          >
            {t('common.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-muted">{t('newProject.name.label')}</label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-muted">{t('secrets.value')}</label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
        </div>
        {uniq.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11.5px] text-muted">{t('secrets.expectedNames')}</p>
            <div className="flex flex-wrap gap-1.5">
              {uniq.map((s) => (
                <button
                  key={s}
                  onClick={() => setKey(s)}
                  className="rounded border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-muted hover:border-accent-dim hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
