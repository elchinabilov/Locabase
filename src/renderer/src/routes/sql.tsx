/**
 * The SQL editor — straight to the local Postgres.
 *
 * Two decisions are visible here:
 *  1. "Read only" is ON BY DEFAULT and resets on every open. Writes are blocked
 *     server-side with `begin read only` — checking SQL with a regex is not
 *     trustworthy (`with x as (delete … returning *) select * from x`).
 *  2. "Save as migration" is a first-class button: changing the schema here and
 *     not writing it to the ledger is exactly the drift this app tries to prevent.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import type { Project, SqlErrorInfo, SqlRun } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { useAction } from '../lib/use-action'
import { projectKey, useUiState } from '../lib/ui-state'
import { cx } from '../lib/format'
import { useT, type TranslationKey } from '../i18n'
import {
  Badge,
  Button,
  ErrorNote,
  Modal,
  NameModal,
  Select,
  SkeletonTable,
  Spinner
} from '../components/ui'
import { DataGrid } from '../components/data-grid'
import { SqlEditor, type SqlEditorHandle } from '../components/sql-editor'
import { EnvPicker, RemoteNote, envOf, useDbGate } from '../components/env-picker'
import { Splitter, useStoredSize } from '../components/splitter'
import { SavedQueriesPanel } from '../components/sql/saved-queries-panel'

const MAX_ROWS = [100, 500, 1000, 5000]

const TIMEOUTS: Array<{ value: number; labelKey: TranslationKey }> = [
  { value: 5_000, labelKey: 'sql.timeout.5s' },
  { value: 30_000, labelKey: 'sql.timeout.30s' },
  { value: 120_000, labelKey: 'sql.timeout.2m' }
]
const TIMEOUT_MS = TIMEOUTS.map((tm) => tm.value)

/* What the screen restores. The row limit and the timeout drive `<Select>`s, so
   a value outside their options would render as a blank box. */
const ENV_ID = z.string().min(1).max(200).nullable()
const MAX_ROWS_VALUE = z.number().refine((n) => MAX_ROWS.includes(n))
const TIMEOUT_VALUE = z.number().refine((n) => TIMEOUT_MS.includes(n))
const QUERY_NAME = z.string().min(1).max(512).nullable()

/* The three panes are user-resizable; these are where they start. The queries
   list is in pixels — a sidebar should keep its width when the window grows —
   while the results pane is a share of the height, so the editor and the grid
   keep their proportion instead of one swallowing the other. */
const QUERIES_WIDTH = { default: 200, min: 150, max: 460 }
const RESULTS_HEIGHT = { default: 46, min: 15, max: 70 }

function starterDoc(t: (k: TranslationKey) => string): string {
  return `-- ${t('sql.starterComment')}\nselect * from auth.users limit 20;\n`
}

export function SqlRoute({ project }: { project: Project }): ReactNode {
  const t = useT()
  // Local by default — a remote environment only on an explicit choice. `picked`
  // is the choice; the id is re-derived, so an environment removed since the last
  // visit falls back to local instead of being queried.
  const [pickedEnv, setEnvId] = useUiState(projectKey(project.id, 'sql.env'), ENV_ID, null)
  const envId = pickedEnv !== null && envOf(project, pickedEnv) ? pickedEnv : null
  const { ready, blocked } = useDbGate(project.id, envId)
  const env = envOf(project, envId)

  /**
   * NOT remembered, and the one thing on this screen that must not be: a session
   * that ended in write mode has to start the next one read-only. See the note at
   * the top of the file.
   */
  const [readOnly, setReadOnly] = useState(true)
  const [maxRows, setMaxRows] = useUiState(
    projectKey(project.id, 'sql.maxRows'),
    MAX_ROWS_VALUE,
    500
  )
  const [timeoutMs, setTimeoutMs] = useUiState(
    projectKey(project.id, 'sql.timeoutMs'),
    TIMEOUT_VALUE,
    30_000
  )

  /* The buffer itself comes back, saved or not — an unsaved query is often the
     reason the app is still open. A query past the 200 KB cap in `ui-state.ts` is
     not remembered at all, and the next open starts from the starter query. */
  const [doc, setDoc] = useUiState(projectKey(project.id, 'sql.doc'), z.string(), starterDoc(t))
  const [docKey, setDocKey] = useState(0)
  const [activeName, setActiveName] = useUiState(
    projectKey(project.id, 'sql.activeName'),
    QUERY_NAME,
    null
  )
  const [dirty, setDirty] = useUiState(projectKey(project.id, 'sql.dirty'), z.boolean(), false)

  const [run, setRun] = useState<SqlRun | null>(null)
  const [tab, setTab] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'save' | 'migration' | 'rename' | 'delete' | null>(null)
  /** The saved query a rename/delete dialog acts on — not always the open one. */
  const [target, setTarget] = useState<string | null>(null)
  // `run` is taken here by the SQL result, so the action helper keeps its own name.
  const { run: runAction, error: actionError } = useAction()

  const editor = useRef<SqlEditorHandle | null>(null)
  // The percentage the results pane is measured against.
  const paneRef = useRef<HTMLElement | null>(null)
  const [queriesWidth, setQueriesWidth] = useStoredSize(
    'locabase.sql.queriesWidth',
    QUERIES_WIDTH.default
  )
  const [resultsHeight, setResultsHeight] = useStoredSize(
    'locabase.sql.resultsHeight',
    RESULTS_HEIGHT.default
  )
  const saved = useQuery('queries:list', { id: project.id })
  const completion = useQuery(
    'db:completion',
    { id: project.id, envId },
    {
      enabled: ready
    }
  )

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
      // DDL may have changed the schema
      if (res.ok && !readOnly) completion.refresh()
    } catch (err) {
      // Only an IPC/transport error lands here — a SQL error is in `res.error`
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
    [project.id, setActiveName, setDirty, setDoc]
  )

  const save = useCallback(
    async (name: string) => {
      await call('queries:write', { id: project.id, name, sql: editor.current?.read() ?? doc })
      setActiveName(name)
      setDirty(false)
      saved.refresh()
    },
    [project.id, doc, saved, setActiveName, setDirty]
  )

  const statements = useMemo(() => countStatements(doc), [doc])
  const results = run?.results ?? []
  const current = results[tab] ?? null
  // Cancellation is local only: on a remote transport the backend pid is out of reach
  const canCancel = envId === null

  return (
    <div className="flex h-full min-h-0">
      <SavedQueriesPanel
        width={queriesWidth}
        queries={saved.data}
        loading={saved.loading}
        activeName={activeName}
        dirty={dirty}
        error={actionError}
        onOpen={(name) => void load(name)}
        onNew={() => setDialog('save')}
        onRename={(name) => {
          setTarget(name)
          setDialog('rename')
        }}
        onDelete={(name) => {
          setTarget(name)
          setDialog('delete')
        }}
      />

      <Splitter
        axis="x"
        value={queriesWidth}
        min={QUERIES_WIDTH.min}
        max={QUERIES_WIDTH.max}
        defaultValue={QUERIES_WIDTH.default}
        onChange={setQueriesWidth}
        label={t('sql.resizeQueries')}
      />

      <section ref={paneRef} className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <h1 className="text-h3 font-medium">
            {activeName ?? t('sql.untitled')}
            {dirty && <span className="ml-1 text-accent">•</span>}
          </h1>

          <EnvPicker project={project} envId={envId} onChange={setEnvId} />

          <label className="ml-1 flex items-center gap-1.5 text-small text-muted">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="accent-accent"
            />
            {t('sql.readOnly')}
          </label>

          <div className="w-[104px]">
            <Select
              value={String(maxRows)}
              onChange={(v) => setMaxRows(Number(v))}
              options={MAX_ROWS.map((n) => ({
                value: String(n),
                label: t('sql.rowCount', { count: n })
              }))}
            />
          </div>
          <div className="w-[92px]">
            <Select
              value={String(timeoutMs)}
              onChange={(v) => setTimeoutMs(Number(v))}
              options={TIMEOUTS.map((tm) => ({ value: String(tm.value), label: t(tm.labelKey) }))}
            />
          </div>

          <div className="flex-1" />

          <Button onClick={() => setDialog('save')}>{t('common.save')}</Button>
          <Button onClick={() => setDialog('migration')}>{t('sql.saveAsMigration')}</Button>
          {busy && canCancel ? (
            <Button variant="danger" onClick={() => void cancel()}>
              <Spinner /> {t('common.cancel')}
            </Button>
          ) : (
            <Button variant="primary" loading={Boolean(busy)} onClick={() => void execute()}>
              {t('sql.run')}
            </Button>
          )}
        </header>

        {env && <RemoteNote env={env} />}
        {!readOnly && (
          <p className="border-b border-line-soft bg-warn-bg px-3 py-1.5 text-small text-warn">
            {t('sql.writeModeOn', {
              target: env ? t('sql.writeModeTarget', { name: env.name }) : ''
            })}
          </p>
        )}
        {blocked && <div className="flex-1">{blocked}</div>}

        {ready && (
          <>
            <div className="min-h-[120px] flex-1">
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

            <Splitter
              axis="y"
              mode="percent"
              containerRef={paneRef}
              value={resultsHeight}
              min={RESULTS_HEIGHT.min}
              max={RESULTS_HEIGHT.max}
              defaultValue={RESULTS_HEIGHT.default}
              invert
              onChange={setResultsHeight}
              label={t('sql.resizeResults')}
            />

            <div className="flex shrink-0 flex-col" style={{ height: `${resultsHeight}%` }}>
              <div className="flex items-center gap-2 border-b border-line-soft px-3 py-1.5 text-small">
                {busy && <span className="text-muted">{t('sql.running')}</span>}
                {!busy && run === null && (
                  <span className="text-muted">
                    {t('sql.noResult')}
                    {statements > 1 && ` ${t('sql.multiStatementHint')}`}
                  </span>
                )}
                {run?.ok && current && (
                  <>
                    <span className="text-text">{current.command ?? 'OK'}</span>
                    <span className="text-muted">
                      · {t('sql.rowCount', { count: current.rows.length })}
                    </span>
                    <span className="text-muted">· {run.durationMs} ms</span>
                    {current.truncated && (
                      <Badge tone="warn">
                        {t('sql.firstRows', { count: current.rows.length })}
                      </Badge>
                    )}
                    {run.readOnly && <Badge tone="muted">{t('sql.readOnly')}</Badge>}
                  </>
                )}
                {run && !run.ok && <span className="text-danger">{t('sql.error')}</span>}
                <div className="flex-1" />
                {results.length > 1 && (
                  <div className="flex gap-1">
                    {results.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => setTab(i)}
                        className={cx(
                          'rounded px-1.5 py-0.5 text-meta',
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
                  <p className="px-3.5 py-6 text-center text-note text-muted">
                    {t('sql.rowsAffected', {
                      command: current.command ?? 'OK',
                      count: current.rowCount ?? 0
                    })}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <p className="border-t border-line-soft px-3 py-1.5 text-meta text-muted">
          {t('sql.notInLedger')}
        </p>
      </section>

      {dialog === 'save' && (
        <NameModal
          title={t('sql.saveQueryTitle')}
          initial={activeName ?? ''}
          hint={t('sql.saveQueryHint')}
          confirmLabel={t('common.save')}
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
          title={t('sql.saveAsMigration')}
          initial=""
          placeholder="add_feedback_table"
          hint={t('migrations.nameHint', { name: '<ad>' })}
          confirmLabel={t('common.save')}
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

      {dialog === 'rename' && target && (
        <NameModal
          title={t('sql.renameQueryTitle', { name: target })}
          initial={target}
          hint={t('sql.saveQueryHint')}
          confirmLabel={t('common.rename')}
          valid={(v) => /^[\wəöğışçüĞÖİŞÇÜƏ -]{1,64}$/.test(v) && v !== target}
          onClose={() => setDialog(null)}
          onSubmit={async (to) => {
            await call('queries:rename', { id: project.id, name: target, to })
            // The editor keeps its content; only the name it is filed under moves.
            if (activeName === target) setActiveName(to)
            setDialog(null)
            saved.refresh()
          }}
        />
      )}

      {dialog === 'delete' && target && (
        <Modal
          title={t('sql.deleteConfirmTitle', { name: target })}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void runAction(() =>
                    call('queries:remove', { id: project.id, name: target })
                  ).then((ok) => {
                    if (ok === undefined) return
                    if (activeName === target) setActiveName(null)
                    setDialog(null)
                    saved.refresh()
                  })
                }}
              >
                {t('common.delete')}
              </Button>
            </>
          }
        >
          <p className="text-ui text-muted">{t('sql.fileDeletedFromDisk')}</p>
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
  const t = useT()
  const rows: Array<[string, string | null]> = [
    [t('sql.errorField.code'), error.code],
    [t('sql.errorField.detail'), error.detail],
    [t('sql.errorField.hint'), error.hint],
    [t('sql.errorField.constraint'), error.constraint],
    [t('sql.errorField.table'), error.table],
    [t('sql.errorField.column'), error.column]
  ]
  const unreachable = error.code === 'ECONNREFUSED' || /ECONNREFUSED|ECONNRESET/.test(error.message)

  return (
    <div className="p-3">
      <ErrorNote>
        <span className="font-medium">{unreachable ? t('sql.dbUnreachable') : error.message}</span>
      </ErrorNote>
      <div className="mt-2 flex flex-col gap-1">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[90px_1fr] gap-2 text-small">
              <span className="text-muted">{k}</span>
              <span className="font-mono break-words text-text">{v}</span>
            </div>
          ))}
      </div>
      {error.position !== null && (
        <div className="mt-2">
          <Button onClick={() => onGoTo(error.position ?? 0)}>{t('sql.goToError')}</Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- helpers */

/** The last result tab that has rows — useful in an `insert…; select…` script. */
function lastWithRows(run: SqlRun): number {
  for (let i = run.results.length - 1; i >= 0; i--) {
    if ((run.results[i]?.rows.length ?? 0) > 0) return i
  }
  return Math.max(0, run.results.length - 1)
}

/** A rough statement count — only for the "one transaction" hint. */
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
