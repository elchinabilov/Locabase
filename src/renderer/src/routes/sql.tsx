/**
 * SQL redaktoru — lokal Postgres-ə birbaşa.
 *
 * İki qərar burada görünür:
 *  1. «Yalnız oxu» DEFAULT AÇIQDIR və hər açılışda sıfırlanır. Yazma server
 *     tərəfdə `begin read only` ilə bloklanır — SQL-i regex ilə yoxlamaq
 *     etibarsızdır (`with x as (delete … returning *) select * from x`).
 *  2. «Miqrasiya kimi saxla» birinci dərəcəli düymədir: sxemi burada dəyişib
 *     ledger-ə yazmamaq bu tətbiqin qarşısını almağa çalışdığı driftdir.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Project, SqlErrorInfo, SqlRun } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import {
  Badge,
  Button,
  ErrorNote,
  Input,
  Modal,
  Select,
  SkeletonRows,
  SkeletonTable,
  Spinner
} from '../components/ui'
import { DataGrid } from '../components/data-grid'
import { SqlEditor, type SqlEditorHandle } from '../components/sql-editor'
import { EnvPicker, RemoteNote, envOf, useDbGate } from '../components/env-picker'

const MAX_ROWS = [100, 500, 1000, 5000]
const TIMEOUTS: Array<{ value: number; label: string }> = [
  { value: 5_000, label: '5 san.' },
  { value: 30_000, label: '30 san.' },
  { value: 120_000, label: '2 dəq.' }
]

const STARTER = `-- ⌘↵ / Ctrl+↵ ilə işlət
select * from auth.users limit 20;
`

export function SqlRoute({ project }: { project: Project }): ReactNode {
  // Default lokal — uzaq mühit yalnız açıq seçimlə
  const [envId, setEnvId] = useState<string | null>(null)
  const { ready, blocked } = useDbGate(project.id, envId)
  const env = envOf(project, envId)

  const [readOnly, setReadOnly] = useState(true)
  const [maxRows, setMaxRows] = useState(500)
  const [timeoutMs, setTimeoutMs] = useState(30_000)

  const [doc, setDoc] = useState(STARTER)
  const [docKey, setDocKey] = useState(0)
  const [activeName, setActiveName] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const [run, setRun] = useState<SqlRun | null>(null)
  const [tab, setTab] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'save' | 'migration' | 'delete' | null>(null)

  const editor = useRef<SqlEditorHandle | null>(null)
  const saved = useQuery('queries:list', { id: project.id }, [project.id])
  const completion = useQuery('db:completion', { id: project.id, envId }, [project.id, envId], {
    enabled: ready
  })

  const execute = useCallback(async () => {
    const text = editor.current?.read() ?? doc
    if (!text.trim()) return
    const token = crypto.randomUUID()
    setBusy(token)
    try {
      const res = await call('sql:execute', {
        id: project.id,
        envId,
        sql: text,
        readOnly,
        maxRows,
        timeoutMs,
        token
      })
      setRun(res)
      setTab(lastWithRows(res))
      // DDL sxemi dəyişmiş ola bilər
      if (res.ok && !readOnly) completion.refresh()
    } catch (err) {
      // Buraya yalnız IPC/nəqliyyat xətası düşür — SQL xətası `res.error`-dədir
      setRun({
        ok: false,
        results: [],
        durationMs: 0,
        readOnly,
        error: bareError((err as Error).message)
      })
    } finally {
      setBusy(null)
    }
  }, [project.id, envId, doc, readOnly, maxRows, timeoutMs, completion])

  const cancel = useCallback(async () => {
    if (!busy) return
    await call('sql:cancel', { id: project.id, token: busy }).catch(() => undefined)
  }, [busy, project.id])

  const load = useCallback(
    async (name: string) => {
      const res = await call('queries:read', { id: project.id, name })
      setDoc(res.sql)
      setDocKey((k) => k + 1)
      setActiveName(name)
      setDirty(false)
    },
    [project.id]
  )

  const save = useCallback(
    async (name: string) => {
      await call('queries:write', { id: project.id, name, sql: editor.current?.read() ?? doc })
      setActiveName(name)
      setDirty(false)
      saved.refresh()
    },
    [project.id, doc, saved]
  )

  const statements = useMemo(() => countStatements(doc), [doc])
  const results = run?.results ?? []
  const current = results[tab] ?? null
  // Ləğv yalnız lokalda: uzaq nəqliyyatda backend pid-i tutmaq mümkün deyil
  const canCancel = envId === null

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
          <span className="text-[10.5px] font-semibold tracking-[0.09em] text-muted uppercase">
            Sorğular
          </span>
          <button
            onClick={() => setDialog('save')}
            title="Yadda saxla"
            className="rounded px-1.5 text-[15px] leading-none text-muted hover:bg-panel-2 hover:text-accent"
          >
            +
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {saved.loading && saved.data === null && <SkeletonRows rows={5} />}
          {saved.data !== null && saved.data.length === 0 && (
            <p className="px-2 py-3 text-[11.5px] leading-relaxed text-muted">
              Hələ saxlanmış sorğu yoxdur.
            </p>
          )}
          {(saved.data ?? []).map((q) => (
            <button
              key={q.name}
              onClick={() => void load(q.name)}
              className={cx(
                'mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[12px]',
                q.name === activeName ? 'bg-panel-2 text-text' : 'text-muted hover:bg-[#141d27]'
              )}
            >
              <span className="min-w-0 flex-1 truncate">{q.name}</span>
              {q.name === activeName && dirty && <span className="text-accent">•</span>}
            </button>
          ))}
        </div>
        <p className="border-t border-line-soft px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          <code>supabase/.locabase/queries/</code> — git ilə paylaşılır.
        </p>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <h1 className="text-[14px] font-medium">
            {activeName ?? 'Adsız sorğu'}
            {dirty && <span className="ml-1 text-accent">•</span>}
          </h1>

          <EnvPicker project={project} envId={envId} onChange={setEnvId} />

          <label className="ml-1 flex items-center gap-1.5 text-[11.5px] text-muted">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="accent-[#3ecf8e]"
            />
            yalnız oxu
          </label>

          <div className="w-[104px]">
            <Select
              value={String(maxRows)}
              onChange={(v) => setMaxRows(Number(v))}
              options={MAX_ROWS.map((n) => ({ value: String(n), label: `${n} sətir` }))}
            />
          </div>
          <div className="w-[92px]">
            <Select
              value={String(timeoutMs)}
              onChange={(v) => setTimeoutMs(Number(v))}
              options={TIMEOUTS.map((t) => ({ value: String(t.value), label: t.label }))}
            />
          </div>

          <div className="flex-1" />

          <Button onClick={() => setDialog('save')}>Saxla</Button>
          <Button onClick={() => setDialog('migration')}>Miqrasiya kimi saxla</Button>
          {activeName && (
            <Button variant="danger" onClick={() => setDialog('delete')}>
              Sil
            </Button>
          )}
          {busy && canCancel ? (
            <Button variant="danger" onClick={() => void cancel()}>
              <Spinner /> Ləğv et
            </Button>
          ) : (
            <Button variant="primary" loading={Boolean(busy)} onClick={() => void execute()}>
              İşlət ⌘↵
            </Button>
          )}
        </header>

        {env && <RemoteNote env={env} />}
        {!readOnly && (
          <p className="border-b border-line-soft bg-[#1c1708] px-3 py-1.5 text-[11.5px] text-warn">
            Yazma rejimi açıqdır{env ? ` — hədəf «${env.name}»` : ''}. Sxemi dəyişirsənsə —
            «Miqrasiya kimi saxla», əks halda ledger ilə baza arasında drift yaranır.
          </p>
        )}
        {blocked && <div className="flex-1">{blocked}</div>}

        {ready && (
          <>
            <div className="min-h-[180px] flex-1 border-b border-line">
              <SqlEditor
                key={docKey}
                initialDoc={doc}
                onRun={() => void execute()}
                onChange={(v) => {
                  setDoc(v)
                  setDirty(true)
                }}
                completion={completion.data}
                errorPosition={run?.error?.position ?? null}
                handleRef={(h) => (editor.current = h)}
              />
            </div>

            <div className="flex h-[46%] min-h-[140px] flex-col">
              <div className="flex items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[11.5px]">
                {busy && <span className="text-muted">işləyir…</span>}
                {!busy && run === null && (
                  <span className="text-muted">
                    Nəticə yoxdur.
                    {statements > 1 && ' Bir neçə ifadə = bir tranzaksiya.'}
                  </span>
                )}
                {run?.ok && current && (
                  <>
                    <span className="text-text">{current.command ?? 'OK'}</span>
                    <span className="text-muted">· {current.rows.length} sətir</span>
                    <span className="text-muted">· {run.durationMs} ms</span>
                    {current.truncated && (
                      <Badge tone="warn">ilk {current.rows.length} sətir</Badge>
                    )}
                    {run.readOnly && <Badge tone="muted">yalnız oxu</Badge>}
                  </>
                )}
                {run && !run.ok && <span className="text-danger">Xəta</span>}
                <div className="flex-1" />
                {results.length > 1 && (
                  <div className="flex gap-1">
                    {results.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => setTab(i)}
                        className={cx(
                          'rounded px-1.5 py-0.5 text-[11px]',
                          i === tab ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'
                        )}
                      >
                        {i + 1} · {r.command ?? '—'} {r.rowCount ?? 0}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {busy && <SkeletonTable rows={12} cols={5} className="p-1" />}
                {!busy && run && !run.ok && run.error && (
                  <SqlError
                    error={run.error}
                    onGoTo={(pos) => editor.current?.focusPosition(pos)}
                  />
                )}
                {!busy && run?.ok && current && current.columns.length > 0 && (
                  <DataGrid
                    columns={current.columns.map((c) => ({
                      name: c.name,
                      hint: c.typeName,
                      sortable: false
                    }))}
                    rows={current.rows}
                  />
                )}
                {!busy && run?.ok && current && current.columns.length === 0 && (
                  <p className="px-3.5 py-6 text-center text-[12px] text-muted">
                    {current.command ?? 'OK'} — {current.rowCount ?? 0} sətir təsirləndi.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <p className="border-t border-line-soft px-3 py-1.5 text-[11px] text-muted">
          Burada işlədilən SQL miqrasiya ledger-inə yazılmır.
        </p>
      </section>

      {dialog === 'save' && (
        <NameModal
          title="Sorğunu saxla"
          initial={activeName ?? ''}
          hint="Hərf, rəqəm, boşluq, `_` və `-`. Fayl `supabase/.locabase/queries/<ad>.sql` kimi yaranır."
          valid={(v) => /^[\wəöğışçüĞÖİŞÇÜƏ -]{1,64}$/.test(v)}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await save(name)
            setDialog(null)
          }}
        />
      )}

      {dialog === 'migration' && (
        <NameModal
          title="Miqrasiya kimi saxla"
          initial=""
          placeholder="add_feedback_table"
          hint="Yalnız kiçik hərf, rəqəm və alt xətt. Fayl `supabase/migrations/<versiya>_<ad>.sql` kimi yaranır."
          valid={(v) => /^[a-z0-9_]+$/.test(v)}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await call('sql:saveAsMigration', {
              id: project.id,
              name,
              sql: editor.current?.read() ?? doc
            })
            setDialog(null)
          }}
        />
      )}

      {dialog === 'delete' && activeName && (
        <Modal
          title={`«${activeName}» silinsin?`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Ləğv et</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void call('queries:remove', { id: project.id, name: activeName }).then(() => {
                    setActiveName(null)
                    setDialog(null)
                    saved.refresh()
                  })
                }}
              >
                Sil
              </Button>
            </>
          }
        >
          <p className="text-[12.5px] text-muted">Fayl diskdən silinir.</p>
        </Modal>
      )}
    </div>
  )
}

function SqlError({
  error,
  onGoTo
}: {
  error: SqlErrorInfo
  onGoTo: (pos: number) => void
}): ReactNode {
  const rows: Array<[string, string | null]> = [
    ['kod', error.code],
    ['detal', error.detail],
    ['ipucu', error.hint],
    ['constraint', error.constraint],
    ['cədvəl', error.table],
    ['sütun', error.column]
  ]
  const unreachable = error.code === 'ECONNREFUSED' || /ECONNREFUSED|ECONNRESET/.test(error.message)

  return (
    <div className="p-3">
      <ErrorNote>
        <span className="font-medium">
          {unreachable ? 'Lokal baza işləmir — əvvəlcə stack-i başlat.' : error.message}
        </span>
      </ErrorNote>
      <div className="mt-2 flex flex-col gap-1">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[90px_1fr] gap-2 text-[11.5px]">
              <span className="text-muted">{k}</span>
              <span className="font-mono break-words text-text">{v}</span>
            </div>
          ))}
      </div>
      {error.position !== null && (
        <div className="mt-2">
          <Button onClick={() => onGoTo(error.position ?? 0)}>Səhv yerə keç</Button>
        </div>
      )}
    </div>
  )
}

function NameModal({
  title,
  initial,
  hint,
  placeholder,
  valid,
  onClose,
  onSubmit
}: {
  title: string
  initial: string
  hint: string
  placeholder?: string
  valid: (v: string) => boolean
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}): ReactNode {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Ləğv et</Button>
          <Button
            variant="primary"
            disabled={!valid(name)}
            loading={busy}
            onClick={() => {
              setBusy(true)
              setError(null)
              void onSubmit(name)
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(false))
            }}
          >
            Saxla
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-[12px] text-muted">Ad</label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="font-mono"
        autoFocus
      />
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{hint}</p>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ köməkçilər */

/** Sətirlərə görə sonuncu nəticə tab-ı — `insert…; select…` skriptində faydalı. */
function lastWithRows(run: SqlRun): number {
  for (let i = run.results.length - 1; i >= 0; i--) {
    if ((run.results[i]?.rows.length ?? 0) > 0) return i
  }
  return Math.max(0, run.results.length - 1)
}

/** Təxmini ifadə sayı — yalnız «bir tranzaksiya» ipucu üçün. */
function countStatements(sql: string): number {
  const stripped = sql.replace(/--[^\n]*/g, '').replace(/'[^']*'/g, "''")
  return stripped.split(';').filter((s) => s.trim().length > 0).length
}

function bareError(message: string): SqlErrorInfo {
  return {
    message,
    code: null,
    severity: null,
    detail: null,
    hint: null,
    position: null,
    where: null,
    table: null,
    column: null,
    constraint: null
  }
}
