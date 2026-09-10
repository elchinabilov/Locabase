/**
 * The table editor — schema/table list, row browsing and row CRUD.
 *
 * DDL is DELIBERATELY absent: a table/column change has to go through a migration
 * file, otherwise the ledger and the database drift apart.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import type { DbFilter, DbRow, DbTable, Project } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { useAction } from '../lib/use-action'
import { useOnChange } from '../lib/use-on-change'
import { projectKey, useRecentUiState, useUiState } from '../lib/ui-state'
import { cx } from '../lib/format'
import { useI18n, useT, type TranslationKey } from '../i18n'
import {
  Badge,
  Button,
  Dot,
  Empty,
  ErrorNote,
  Input,
  Pager,
  Select,
  SkeletonRows,
  Toggle,
  formatCount
} from '../components/ui'
import { DataGrid, type GridSort } from '../components/data-grid'
import { FilterBar } from '../components/tables/filter-bar'
import { StructurePane } from '../components/tables/structure-pane'
import { changedOnly, DeleteModal, RowModal } from '../components/tables/row-editor'
import { pkCells, shortType } from '../components/tables/cells'
import { EnvPicker, RemoteNote, envOf, useDbGate } from '../components/env-picker'
import { Splitter, useStoredSize } from '../components/splitter'

const PAGE_SIZES = [25, 50, 100, 500]

/* The table list is resizable; in pixels, so it keeps its width when the window
   grows — schema names are what decides how wide it wants to be, not the window. */
const SIDEBAR = { default: 248, min: 180, max: 460 }

/* What the screen is allowed to restore. Everything here outlives the database
   it describes — a schema can be dropped, a column renamed, an environment
   removed — so each value is checked on the way in and the screen falls back to
   its default rather than querying something that is no longer there. */
const ENV_ID = z.string().min(1).max(200).nullable()
const NAME = z.string().min(1).max(512)
const SELECTION = z.object({ schema: NAME, table: NAME }).nullable()
const TAB = z.enum(['rows', 'structure'])

const GRID_SORT = z.object({ column: NAME, dir: z.enum(['asc', 'desc']) }).nullable()
const DB_FILTER = z.object({
  column: NAME,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'isnull', 'notnull']),
  value: z.string().max(100_000).nullable()
})

/** The row view of one table: how it was sorted, filtered and paged. */
const ROW_VIEW = z.object({
  sort: GRID_SORT,
  filters: z.array(DB_FILTER).max(20),
  // Off-list sizes are rejected: the value drives a `<Select>`, and a size that
  // is not one of its options renders as a blank box.
  pageSize: z.number().refine((n) => PAGE_SIZES.includes(n))
})

type RowView = z.infer<typeof ROW_VIEW>

const DEFAULT_ROW_VIEW: RowView = { sort: null, filters: [], pageSize: 50 }

const KIND_LABEL_KEY: Record<string, TranslationKey> = {
  r: 'tables.kind.table',
  p: 'tables.kind.partitioned',
  v: 'tables.kind.view',
  m: 'tables.kind.materialized',
  f: 'tables.kind.foreign'
}

export function TablesRoute({ project }: { project: Project }): ReactNode {
  const t = useT()
  // Local by default — a remote environment only on an explicit choice. `picked`
  // is that choice; the id is re-derived every render, so an environment removed
  // since the last visit falls back to local instead of being queried.
  const [pickedEnv, setEnvId] = useUiState(projectKey(project.id, 'tables.env'), ENV_ID, null)
  const envId = pickedEnv !== null && envOf(project, pickedEnv) ? pickedEnv : null
  const { ready, blocked } = useDbGate(project.id, envId)
  const env = envOf(project, envId)
  const [includeSystem, setIncludeSystem] = useUiState(
    projectKey(project.id, 'tables.includeSystem'),
    z.boolean(),
    false
  )
  const [pickedSchema, setSchema] = useUiState(
    projectKey(project.id, 'tables.schema'),
    NAME,
    'public'
  )
  /**
   * The selection carries the schema it belongs to. Keeping them apart meant a
   * cross-schema jump from a foreign key (`setSchema` then `setTable`) tripped
   * the "schema changed, clear the table" effect and landed on nothing.
   */
  const [selection, setSelection] = useUiState(
    projectKey(project.id, 'tables.selection'),
    SELECTION,
    null
  )
  const [tab, setTab] = useUiState(projectKey(project.id, 'tables.tab'), TAB, 'rows')
  const [filter, setFilter] = useUiState(projectKey(project.id, 'tables.search'), z.string(), '')
  const [sidebarWidth, setSidebarWidth] = useStoredSize(
    'locabase.tables.sidebarWidth',
    SIDEBAR.default
  )

  const schemas = useQuery(
    'db:schemas',
    { id: project.id, envId, includeSystem },
    { enabled: ready }
  )
  /* Same treatment as the environment: a remembered schema that this database
     does not have (another environment, a dropped schema) resolves to the first
     one the server reported rather than to an empty table list. */
  const schema =
    schemas.data && !schemas.data.some((s) => s.name === pickedSchema)
      ? (schemas.data[0]?.name ?? pickedSchema)
      : pickedSchema
  const table = selection && selection.schema === schema ? selection.table : null
  const tables = useQuery(
    'db:tables',
    { id: project.id, envId, schema },
    { enabled: ready && schema.length > 0 }
  )

  const list = useMemo(() => {
    const all = tables.data ?? []
    const q = filter.trim().toLowerCase()
    return q ? all.filter((tbl) => tbl.name.toLowerCase().includes(q)) : all
  }, [tables.data, filter])

  // A different environment is a different database — nothing carries over.
  // `useOnChange`, not `useEffect`: on mount the environment has not changed,
  // it has been *restored*, and clearing here would undo the restore.
  useOnChange(envId, () => setSelection(null))

  const active = useMemo(
    () => (tables.data ?? []).find((tbl) => tbl.name === table) ?? null,
    [tables.data, table]
  )

  const goTo = useCallback(
    (nextSchema: string, nextTable: string) => {
      setSchema(nextSchema)
      setSelection({ schema: nextSchema, table: nextTable })
      setTab('rows')
    },
    [setSchema, setSelection, setTab]
  )

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex shrink-0 flex-col bg-panel" style={{ width: `${sidebarWidth}px` }}>
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
            <p className="px-2 py-3 text-small text-muted">{t('tables.noTablesInSchema')}</p>
          )}
          {list.map((tb) => (
            <TableItem
              key={tb.name}
              table={tb}
              active={tb.name === table}
              onClick={() => setSelection({ schema, table: tb.name })}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line-soft px-3 py-2">
          <span className="text-meta text-muted">{t('tables.systemSchemas')}</span>
          <Toggle checked={includeSystem} onChange={setIncludeSystem} />
        </div>
      </aside>

      <Splitter
        axis="x"
        value={sidebarWidth}
        min={SIDEBAR.min}
        max={SIDEBAR.max}
        defaultValue={SIDEBAR.default}
        onChange={setSidebarWidth}
        label={t('tables.resizeSidebar')}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {env && <RemoteNote env={env} />}
        {blocked}
        {ready && !active && (
          <Empty title={t('tables.selectTable')} hint={t('tables.selectTableHint')} />
        )}
        {ready && active && (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <h1 className="text-h3 font-medium">
                <span className="text-muted">{schema}.</span>
                {active.name}
              </h1>
              <Badge tone="muted">{t(KIND_LABEL_KEY[active.kind] ?? 'tables.kind.table')}</Badge>
              {active.rls && <Badge tone="info">RLS</Badge>}
              {!active.editable && active.editableReason && (
                <Badge tone="warn">{t(`tables.editableReason.${active.editableReason}`)}</Badge>
              )}
              <div className="flex-1" />
              <div className="flex rounded-md border border-line p-0.5">
                {(['rows', 'structure'] as const).map((tabId) => (
                  <button
                    key={tabId}
                    onClick={() => setTab(tabId)}
                    className={cx(
                      'rounded px-2.5 py-1 text-note',
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
        active ? 'bg-panel-2' : 'hover:bg-hover'
      )}
    >
      <Dot tone={table.editable ? 'ok' : 'muted'} />
      <span className="min-w-0 flex-1 truncate text-ui text-text">{table.name}</span>
      <span className="shrink-0 text-badge text-muted">
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
  /**
   * Sort, filters and page size belong to *this* table, not to the screen: the
   * filter that makes sense on `orders` is meaningless on `auth.users`. They are
   * kept per table and per environment, with only the twenty most recently used
   * tables remembered — a large database has thousands, and the ones before that
   * are not coming back.
   */
  const [view, setView] = useRecentUiState(
    projectKey(project.id, 'tables.rowView'),
    `${envId ?? 'local'}.${table.schema}.${table.name}`,
    ROW_VIEW,
    DEFAULT_ROW_VIEW
  )
  const { pageSize, sort, filters } = view
  const setPageSize = (n: number): void => setView({ ...view, pageSize: n })
  const setSort = (next: GridSort | null): void => setView({ ...view, sort: next })
  const setFilters = (next: DbFilter[]): void => setView({ ...view, filters: next })
  /** The page is not remembered: page 4 of yesterday's rows is not page 4 today. */
  const [page, setPage] = useState(0)
  /**
   * Selection and the open editor are keyed by PRIMARY KEY, not by row index.
   * An index is only meaningful for the page that produced it, so paging with
   * rows checked used to carry the ticks onto whichever rows happened to land
   * in those positions next. A table without a primary key is not editable, so
   * wherever a key is needed one exists.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { run, error } = useAction()

  const rows = useQuery('db:rows', {
    id: project.id,
    envId,
    schema: table.schema,
    table: table.name,
    limit: pageSize,
    offset: page * pageSize,
    orderBy: sort,
    filters
  })

  // Go back to the first page when the filter/sort changes.
  useEffect(() => setPage(0), [filters, sort, pageSize])

  // The selection applies to the rows on screen, so leaving the page clears it.
  // Keying by primary key on top of that means a refresh or a re-sort keeps the
  // right rows ticked rather than the same positions.
  useEffect(() => setSelected(new Set()), [filters, sort, pageSize, page])

  const cols = rows.data?.columns ?? []
  const data = rows.data?.rows ?? []
  const keyOf = useCallback((row: DbRow) => JSON.stringify(pkCells(cols, row)), [cols])
  /** The rows on this page that are selected, by their position in the grid. */
  const selectedIndexes = useMemo(() => {
    const out = new Set<number>()
    data.forEach((row, i) => {
      if (selected.has(keyOf(row))) out.add(i)
    })
    return out
  }, [data, selected, keyOf])
  const editingRow = useMemo(
    () => data.find((row) => keyOf(row) === editing) ?? null,
    [data, editing, keyOf]
  )
  const selectedRows = useMemo(
    () => data.filter((row) => selected.has(keyOf(row))),
    [data, selected, keyOf]
  )
  const editable = rows.data?.editable ?? false
  const total = rows.data?.total ?? null

  const refresh = useCallback(() => {
    setSelected(new Set())
    rows.refresh()
  }, [rows])

  const submit = useCallback(
    async (fn: () => Promise<unknown>) => {
      const ok = (await run(fn)) !== undefined
      if (ok) refresh()
      return ok
    },
    [refresh, run]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        {editable && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('tables.addRow')}
          </Button>
        )}
        {editable && selectedRows.length > 0 && (
          <Button variant="danger" onClick={() => setDeleting(true)}>
            {t('tables.deleteRows', { count: selectedRows.length })}
          </Button>
        )}
        <FilterBar columns={cols} filters={filters} onChange={setFilters} />
        <div className="flex-1" />
        <div className="w-[86px]">
          <Select
            value={String(pageSize)}
            onChange={(v) => setPageSize(Number(v))}
            options={PAGE_SIZES.map((n) => ({
              value: String(n),
              label: t('sql.rowCount', { count: n })
            }))}
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
        <p className="border-b border-line-soft bg-warn-bg px-3 py-1.5 text-small text-warn">
          {t('tables.notEditable', {
            reason: rows.data.editableReason
              ? t(`tables.editableReason.${rows.data.editableReason}`)
              : ''
          })}
        </p>
      )}

      <div className="min-h-0 flex-1">
        <DataGrid
          loading={rows.loading && rows.data === null}
          columns={cols.map((c) => ({ name: c.name, hint: shortType(c) }))}
          rows={data}
          sort={sort}
          onSort={setSort}
          selected={editable ? selectedIndexes : undefined}
          onSelectedChange={
            editable
              ? (next) => {
                  // The grid speaks in positions; store what they identify.
                  const keys = [...next]
                    .map((i) => data[i])
                    .filter(Boolean)
                    .map((r) => keyOf(r!))
                  setSelected(new Set(keys))
                }
              : undefined
          }
          rowActions={
            editable
              ? (i) => (
                  <button
                    onClick={() => {
                      const row = data[i]
                      if (row) setEditing(keyOf(row))
                    }}
                    className="text-meta text-muted hover:text-accent"
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
            const ok = await submit(() =>
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

      {editingRow && (
        <RowModal
          title={t('tables.editRowTitle', { schema: table.schema, table: table.name })}
          columns={cols}
          row={editingRow}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            const current = editingRow
            const patch = changedOnly(cols, current, values)
            if (Object.keys(patch).length === 0) {
              setEditing(null)
              return
            }
            const ok = await submit(() =>
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
          rows={selectedRows}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const pks = selectedRows.map((r) => pkCells(cols, r))
            const ok = await submit(() =>
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
