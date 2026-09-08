/**
 * The table editor — schema/table list, row browsing and row CRUD.
 *
 * DDL is DELIBERATELY absent: a table/column change has to go through a migration
 * file, otherwise the ledger and the database drift apart.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DbCells, DbColumn, DbFilter, DbOp, DbRow, DbTable, Project } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { useI18n, useT, type TranslationKey } from '../i18n'
import {
  Badge,
  Button,
  Dot,
  Empty,
  ErrorNote,
  Input,
  Modal,
  Select,
  SkeletonRows,
  SkeletonTable,
  Toggle
} from '../components/ui'
import { DataGrid, type GridSort } from '../components/data-grid'
import { EnvPicker, RemoteNote, envOf, useDbGate } from '../components/env-picker'

const PAGE_SIZES = [25, 50, 100, 500]

const OP_SYMBOLS: Record<DbOp, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  like: 'like',
  ilike: 'ilike',
  isnull: '',
  notnull: ''
}

const OP_LABEL_KEY: Record<DbOp, TranslationKey | null> = {
  eq: null,
  neq: null,
  gt: null,
  gte: null,
  lt: null,
  lte: null,
  like: null,
  ilike: null,
  isnull: 'tables.op.isnull',
  notnull: 'tables.op.notnull'
}

const KIND_LABEL_KEY: Record<string, TranslationKey> = {
  r: 'tables.kind.table',
  p: 'tables.kind.partitioned',
  v: 'tables.kind.view',
  m: 'tables.kind.materialized',
  f: 'tables.kind.foreign'
}

export function TablesRoute({ project }: { project: Project }): ReactNode {
  const t = useT()
  // Local by default — a remote environment only on an explicit choice
  const [envId, setEnvId] = useState<string | null>(null)
  const { ready, blocked } = useDbGate(project.id, envId)
  const env = envOf(project, envId)
  const [includeSystem, setIncludeSystem] = useState(false)
  const [schema, setSchema] = useState('public')
  const [table, setTable] = useState<string | null>(null)
  const [tab, setTab] = useState<'rows' | 'structure'>('rows')
  const [filter, setFilter] = useState('')

  const schemas = useQuery(
    'db:schemas',
    { id: project.id, envId, includeSystem },
    [project.id, envId, includeSystem],
    { enabled: ready }
  )
  const tables = useQuery(
    'db:tables',
    { id: project.id, envId, schema },
    [project.id, envId, schema],
    { enabled: ready && schema.length > 0 }
  )

  const list = useMemo(() => {
    const all = tables.data ?? []
    const q = filter.trim().toLowerCase()
    return q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all
  }, [tables.data, filter])

  // The selection resets when the schema or the environment changes
  useEffect(() => setTable(null), [schema, envId])

  const active = useMemo(
    () => (tables.data ?? []).find((t) => t.name === table) ?? null,
    [tables.data, table]
  )

  const goTo = useCallback((s: string, t: string) => {
    setSchema(s)
    setTable(t)
    setTab('rows')
  }, [])

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="border-b border-line-soft p-2.5">
          <EnvPicker project={project} envId={envId} onChange={setEnvId} className="mb-2 w-full" />
          <Select
            value={schema}
            onChange={setSchema}
            options={(schemas.data ?? []).map((s) => ({
              value: s.name,
              label: s.system ? t('tables.systemSchemaLabel', { name: s.name }) : s.name
            }))}
          />
          <div className="mt-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('tables.searchTables')}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {tables.loading && <SkeletonRows rows={7} />}
          {tables.error && <ErrorNote>{tables.error}</ErrorNote>}
          {!tables.loading && list.length === 0 && (
            <p className="px-2 py-3 text-[11.5px] text-muted">{t('tables.noTablesInSchema')}</p>
          )}
          {list.map((tb) => (
            <TableItem
              key={tb.name}
              table={tb}
              active={tb.name === table}
              onClick={() => setTable(tb.name)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line-soft px-3 py-2">
          <span className="text-[11px] text-muted">{t('tables.systemSchemas')}</span>
          <Toggle checked={includeSystem} onChange={setIncludeSystem} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {env && <RemoteNote env={env} />}
        {blocked}
        {ready && !active && (
          <Empty title={t('tables.selectTable')} hint={t('tables.selectTableHint')} />
        )}
        {ready && active && (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <h1 className="text-[14px] font-medium">
                <span className="text-muted">{schema}.</span>
                {active.name}
              </h1>
              <Badge tone="muted">{t(KIND_LABEL_KEY[active.kind] ?? 'tables.kind.table')}</Badge>
              {active.rls && <Badge tone="info">RLS</Badge>}
              {!active.editable && <Badge tone="warn">{active.editableReason}</Badge>}
              <div className="flex-1" />
              <div className="flex rounded-md border border-line p-0.5">
                {(['rows', 'structure'] as const).map((tabId) => (
                  <button
                    key={tabId}
                    onClick={() => setTab(tabId)}
                    className={cx(
                      'rounded px-2.5 py-1 text-[12px]',
                      tab === tabId ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'
                    )}
                  >
                    {tabId === 'rows' ? t('tables.tabRows') : t('tables.tabStructure')}
                  </button>
                ))}
              </div>
            </header>

            {tab === 'rows' ? (
              <RowsPane
                key={`${envId ?? 'local'}.${schema}.${active.name}`}
                project={project}
                envId={envId}
                table={active}
              />
            ) : (
              <StructurePane project={project} envId={envId} table={active} onNavigate={goTo} />
            )}
          </>
        )}
      </section>
    </div>
  )
}

function TableItem({
  table,
  active,
  onClick
}: {
  table: DbTable
  active: boolean
  onClick: () => void
}): ReactNode {
  const { locale } = useI18n()
  return (
    <button
      onClick={onClick}
      className={cx(
        'mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left',
        active ? 'bg-panel-2' : 'hover:bg-[#141d27]'
      )}
    >
      <Dot tone={table.editable ? 'ok' : 'muted'} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">{table.name}</span>
      <span className="shrink-0 text-[10.5px] text-muted">
        {table.estimate < 0 ? '—' : `~${formatCount(table.estimate, locale)}`}
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------------- rows */

function RowsPane({
  project,
  envId,
  table
}: {
  project: Project
  envId: string | null
  table: DbTable
}): ReactNode {
  const t = useT()
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<GridSort | null>(null)
  const [filters, setFilters] = useState<DbFilter[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = useQuery(
    'db:rows',
    {
      id: project.id,
      envId,
      schema: table.schema,
      table: table.name,
      limit: pageSize,
      offset: page * pageSize,
      orderBy: sort,
      filters
    },
    [project.id, envId, table.schema, table.name, pageSize, page, sort, filters]
  )

  // Go back to the first page when the filter/sort changes
  useEffect(() => {
    setPage(0)
    setSelected(new Set())
  }, [filters, sort, pageSize])

  const cols = rows.data?.columns ?? []
  const data = rows.data?.rows ?? []
  const editable = rows.data?.editable ?? false
  const total = rows.data?.total ?? null

  const refresh = useCallback(() => {
    setSelected(new Set())
    rows.refresh()
  }, [rows])

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null)
      try {
        await fn()
        refresh()
        return true
      } catch (err) {
        setError((err as Error).message)
        return false
      }
    },
    [refresh]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        {editable && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('tables.addRow')}
          </Button>
        )}
        {editable && selected.size > 0 && (
          <Button variant="danger" onClick={() => setDeleting(true)}>
            {t('tables.deleteRows', { count: selected.size })}
          </Button>
        )}
        <FilterBar columns={cols} filters={filters} onChange={setFilters} />
        <div className="flex-1" />
        <div className="w-[86px]">
          <Select
            value={String(pageSize)}
            onChange={(v) => setPageSize(Number(v))}
            options={PAGE_SIZES.map((n) => ({ value: String(n), label: t('sql.rowCount', { count: n }) }))}
          />
        </div>
        <Pager page={page} pageSize={pageSize} count={data.length} total={total} onPage={setPage} />
        <Button onClick={refresh} loading={rows.loading}>
          ↻
        </Button>
      </div>

      {error && (
        <div className="px-3 pt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {rows.error && (
        <div className="px-3 pt-2">
          <ErrorNote>{rows.error}</ErrorNote>
        </div>
      )}
      {!editable && rows.data && (
        <p className="border-b border-line-soft bg-[#1c1708] px-3 py-1.5 text-[11.5px] text-warn">
          {t('tables.notEditable', { reason: rows.data.editableReason ?? '' })}
        </p>
      )}

      <div className="min-h-0 flex-1">
        <DataGrid
          loading={rows.loading && rows.data === null}
          columns={cols.map((c) => ({ name: c.name, hint: shortType(c) }))}
          rows={data}
          sort={sort}
          onSort={setSort}
          selected={editable ? selected : undefined}
          onSelectedChange={editable ? setSelected : undefined}
          rowActions={
            editable
              ? (i) => (
                  <button
                    onClick={() => setEditing(i)}
                    className="text-[11px] text-muted hover:text-accent"
                  >
                    {t('tables.edit')}
                  </button>
                )
              : undefined
          }
        />
      </div>

      {adding && (
        <RowModal
          title={t('tables.newRowTitle', { schema: table.schema, table: table.name })}
          columns={cols}
          row={null}
          onClose={() => setAdding(false)}
          onSubmit={async (values) => {
            const ok = await run(() =>
              call('db:insertRow', {
                id: project.id,
                envId,
                schema: table.schema,
                table: table.name,
                values
              })
            )
            if (ok) setAdding(false)
          }}
        />
      )}

      {editing !== null && data[editing] && (
        <RowModal
          title={t('tables.editRowTitle', { schema: table.schema, table: table.name })}
          columns={cols}
          row={data[editing] ?? null}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            const current = data[editing]
            if (!current) return
            const patch = changedOnly(cols, current, values)
            if (Object.keys(patch).length === 0) {
              setEditing(null)
              return
            }
            const ok = await run(() =>
              call('db:updateRow', {
                id: project.id,
                envId,
                schema: table.schema,
                table: table.name,
                pk: pkCells(cols, current),
                patch
              })
            )
            if (ok) setEditing(null)
          }}
        />
      )}

      {deleting && (
        <DeleteModal
          columns={cols}
          rows={[...selected].map((i) => data[i]).filter((r): r is DbRow => Boolean(r))}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const pks = [...selected]
              .map((i) => data[i])
              .filter((r): r is DbRow => Boolean(r))
              .map((r) => pkCells(cols, r))
            const ok = await run(() =>
              call('db:deleteRows', {
                id: project.id,
                envId,
                schema: table.schema,
                table: table.name,
                pks
              })
            )
            if (ok) setDeleting(false)
          }}
        />
      )}
    </div>
  )
}

function Pager({
  page,
  pageSize,
  count,
  total,
  onPage
}: {
  page: number
  pageSize: number
  count: number
  total: number | null
  onPage: (p: number) => void
}): ReactNode {
  const { locale } = useI18n()
  const from = count === 0 ? 0 : page * pageSize + 1
  const to = page * pageSize + count
  const last = total !== null && to >= total
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
      <Button disabled={page === 0} onClick={() => onPage(page - 1)}>
        ‹
      </Button>
      <span className="tabular-nums">
        {from}–{to}
        {total !== null && ` / ${formatCount(total, locale)}`}
      </span>
      <Button disabled={count < pageSize || last} onClick={() => onPage(page + 1)}>
        ›
      </Button>
    </div>
  )
}

function FilterBar({
  columns,
  filters,
  onChange
}: {
  columns: DbColumn[]
  filters: DbFilter[]
  onChange: (f: DbFilter[]) => void
}): ReactNode {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DbFilter>({ column: '', op: 'eq', value: '' })
  const needsValue = draft.op !== 'isnull' && draft.op !== 'notnull'
  const opLabel = (op: DbOp): string => {
    const key = OP_LABEL_KEY[op]
    return key ? t(key) : OP_SYMBOLS[op]
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f, i) => (
        <button
          key={`${f.column}-${f.op}-${i}`}
          onClick={() => onChange(filters.filter((_, j) => j !== i))}
          title={t('tables.removeFilter')}
          className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted hover:text-danger"
        >
          {f.column} {opLabel(f.op)} {f.value ?? ''} ✕
        </button>
      ))}
      <Button onClick={() => setOpen(true)} disabled={columns.length === 0}>
        {t('tables.addFilter')}
      </Button>

      {open && (
        <Modal
          title={t('tables.addFilterTitle')}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                disabled={!draft.column}
                onClick={() => {
                  onChange([...filters, { ...draft, value: needsValue ? draft.value : null }])
                  setDraft({ column: '', op: 'eq', value: '' })
                  setOpen(false)
                }}
              >
                {t('common.add')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <Select
              value={draft.column}
              onChange={(v) => setDraft((d) => ({ ...d, column: v }))}
              options={[
                { value: '', label: t('tables.selectColumn') },
                ...columns.map((c) => ({ value: c.name, label: `${c.name} · ${c.dataType}` }))
              ]}
            />
            <Select
              value={draft.op}
              onChange={(v) => setDraft((d) => ({ ...d, op: v as DbOp }))}
              options={(Object.keys(OP_SYMBOLS) as DbOp[]).map((op) => ({ value: op, label: opLabel(op) }))}
            />
            <Input
              value={draft.value ?? ''}
              disabled={!needsValue}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              placeholder={needsValue ? t('tables.value') : t('tables.valueNotNeeded')}
              className="font-mono"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ struktur */

function StructurePane({
  project,
  envId,
  table,
  onNavigate
}: {
  project: Project
  envId: string | null
  table: DbTable
  onNavigate: (schema: string, table: string) => void
}): ReactNode {
  const t = useT()
  const cols = useQuery(
    'db:columns',
    { id: project.id, envId, schema: table.schema, table: table.name },
    [project.id, envId, table.schema, table.name]
  )

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-4xl">
        {cols.error && <ErrorNote>{cols.error}</ErrorNote>}
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] tracking-wide text-muted uppercase">
              <th className="px-2 py-1.5 text-left font-medium">{t('tables.col.column')}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('tables.col.type')}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('tables.col.default')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('tables.col.attributes')}</th>
            </tr>
          </thead>
          <tbody>
            {cols.loading && cols.data === null && (
              <tr>
                <td colSpan={4} className="p-0">
                  <SkeletonTable rows={8} cols={4} widths={['30%', '22%', '26%', '14%']} />
                </td>
              </tr>
            )}
            {(cols.data ?? []).map((c) => (
              <tr key={c.name} className="border-b border-line-soft last:border-0">
                <td className="px-2 py-1.5 font-mono text-[11.5px] text-text">{c.name}</td>
                <td className="px-2 py-1.5 text-muted">{c.dataType}</td>
                <td className="max-w-[220px] truncate px-2 py-1.5 font-mono text-[11px] text-muted">
                  {c.defaultExpr ?? '—'}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    {c.pkOrd !== null && <Badge tone="ok">PK</Badge>}
                    {!c.nullable && <Badge tone="muted">not null</Badge>}
                    {c.isIdentity && <Badge tone="info">identity</Badge>}
                    {c.isGenerated && <Badge tone="info">generated</Badge>}
                    {c.refTable && (
                      <button
                        onClick={() => onNavigate(c.refSchema ?? 'public', c.refTable ?? '')}
                        className="text-[10.5px] text-info hover:underline"
                      >
                        → {c.refSchema}.{c.refTable}.{c.refColumn}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">{t('tables.ddlHint')}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ modallar */

type FieldMode = 'value' | 'null' | 'default'
interface Field {
  mode: FieldMode
  text: string
}

function RowModal({
  title,
  columns,
  row,
  onClose,
  onSubmit
}: {
  title: string
  columns: DbColumn[]
  /** null = a new row */
  row: DbRow | null
  onClose: () => void
  onSubmit: (values: DbCells) => Promise<void>
}): ReactNode {
  const t = useT()
  const editable = useMemo(() => columns.filter((c) => !c.isGenerated), [columns])
  const [fields, setFields] = useState<Record<string, Field>>(() => initFields(columns, row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (name: string, patch: Partial<Field>): void =>
    setFields((f) => ({ ...f, [name]: { ...(f[name] ?? { mode: 'value', text: '' }), ...patch } }))

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              setBusy(true)
              setError(null)
              void onSubmit(collect(editable, fields))
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(false))
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {editable.map((c) => {
          const f = fields[c.name] ?? { mode: 'value' as FieldMode, text: '' }
          const canDefault = row === null && (c.defaultExpr !== null || c.isIdentity)
          const multiline = /json|text|xml/.test(c.dataType)
          return (
            <div
              key={c.name}
              className="grid grid-cols-[minmax(160px,220px)_1fr] items-start gap-3"
            >
              <div className="pt-1.5">
                <div className="font-mono text-[12px] text-text">{c.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                  <span>{c.dataType}</span>
                  {c.pkOrd !== null && <Badge tone="ok">PK</Badge>}
                  {!c.nullable && <Badge tone="muted">not null</Badge>}
                </div>
              </div>
              <div className="min-w-0">
                {multiline ? (
                  <textarea
                    value={f.text}
                    disabled={f.mode !== 'value'}
                    onChange={(e) => set(c.name, { text: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-line bg-[#0d141b] px-2 py-1.5 font-mono text-[12px] text-text focus:border-accent-dim focus:outline-none disabled:opacity-40"
                  />
                ) : (
                  <Input
                    value={f.text}
                    disabled={f.mode !== 'value'}
                    onChange={(e) => set(c.name, { text: e.target.value })}
                    className="font-mono"
                  />
                )}
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={f.mode === 'null'}
                      onChange={(e) => set(c.name, { mode: e.target.checked ? 'null' : 'value' })}
                      className="accent-[#3ecf8e]"
                    />
                    NULL
                  </label>
                  {canDefault && (
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={f.mode === 'default'}
                        onChange={(e) =>
                          set(c.name, { mode: e.target.checked ? 'default' : 'value' })
                        }
                        className="accent-[#3ecf8e]"
                      />
                      {t('tables.default')} {c.defaultExpr ? `(${c.defaultExpr})` : ''}
                    </label>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function DeleteModal({
  columns,
  rows,
  onClose,
  onConfirm
}: {
  columns: DbColumn[]
  rows: DbRow[]
  onClose: () => void
  onConfirm: () => Promise<void>
}): ReactNode {
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={t('tables.deleteConfirmTitle', { count: rows.length })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              setBusy(true)
              void onConfirm().finally(() => setBusy(false))
            }}
          >
            {t('common.delete')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12.5px] text-muted">{t('tables.irreversible')}</p>
      <ul className="max-h-64 overflow-auto rounded-md border border-line bg-[#0d141b] p-2 font-mono text-[11.5px]">
        {rows.map((r, i) => (
          <li key={i} className="truncate py-0.5 text-muted">
            {JSON.stringify(pkCells(columns, r))}
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/* ------------------------------------------------------------------- helpers */

function initFields(columns: DbColumn[], row: DbRow | null): Record<string, Field> {
  const out: Record<string, Field> = {}
  columns.forEach((c, i) => {
    if (c.isGenerated) return
    if (row === null) {
      out[c.name] =
        c.defaultExpr !== null || c.isIdentity
          ? { mode: 'default', text: '' }
          : { mode: 'value', text: '' }
      return
    }
    const v = row[i] ?? null
    out[c.name] = v === null ? { mode: 'null', text: '' } : { mode: 'value', text: v }
  })
  return out
}

/** The "default" mode omits the key ENTIRELY — Postgres applies its own default. */
function collect(columns: DbColumn[], fields: Record<string, Field>): DbCells {
  const out: DbCells = {}
  for (const c of columns) {
    const f = fields[c.name]
    if (!f || f.mode === 'default') continue
    out[c.name] = f.mode === 'null' ? null : f.text
  }
  return out
}

function changedOnly(columns: DbColumn[], row: DbRow, values: DbCells): DbCells {
  const out: DbCells = {}
  columns.forEach((c, i) => {
    if (!(c.name in values)) return
    const before = row[i] ?? null
    const after = values[c.name] ?? null
    if (before !== after) out[c.name] = after
  })
  return out
}

export function pkCells(columns: DbColumn[], row: DbRow): DbCells {
  const out: DbCells = {}
  columns.forEach((c, i) => {
    if (c.pkOrd !== null) out[c.name] = row[i] ?? null
  })
  return out
}

function shortType(c: DbColumn): string {
  const pk = c.pkOrd !== null ? '🔑' : ''
  return `${pk}${c.dataType}`
}

function formatCount(n: number, locale: 'az' | 'en'): string {
  return n.toLocaleString(locale === 'az' ? 'az-AZ' : 'en-US')
}
