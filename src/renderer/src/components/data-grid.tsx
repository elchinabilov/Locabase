/**
 * The result grid — shared by the SQL editor and the table editor.
 *
 * There is deliberately no virtualization library (the repo's zero-wrapper
 * principle), but 5000 rows × 15 columns = 75,000 DOM cells freezes the renderer —
 * so there is simple windowing with a fixed row height.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { DbRow } from '@shared/types'
import { cx } from '../lib/format'
import { useT } from '../i18n'
import { Modal, Skeleton, SkeletonTable } from './ui'

const ROW_H = 28
/** Fewer rows than this are just rendered — windowing isn't worth its cost. */
const WINDOW_FROM = 200
const CELL_MAX = 140

export interface GridColumn {
  name: string
  /** small grey text in the header — the type name or a PK/FK marker */
  hint?: string
  /** `null` = not sorted */
  sortable?: boolean
}

export interface GridSort {
  column: string
  dir: 'asc' | 'desc'
}

export function DataGrid({
  columns,
  rows,
  sort,
  onSort,
  selected,
  onSelectedChange,
  rowActions,
  loading,
  emptyText
}: {
  columns: GridColumn[]
  rows: DbRow[]
  sort?: GridSort | null
  onSort?: (next: GridSort | null) => void
  /** Selected row indexes — without this the checkbox column is hidden */
  selected?: Set<number>
  onSelectedChange?: (next: Set<number>) => void
  rowActions?: (rowIndex: number) => ReactNode
  /** First load — no rows yet. The header stays, the body becomes a skeleton. */
  loading?: boolean
  emptyText?: string
}): ReactNode {
  const t = useT()
  const shownEmptyText = emptyText ?? t('dataGrid.noRows')
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [zoom, setZoom] = useState<{ column: string; value: string } | null>(null)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const windowed = rows.length > WINDOW_FROM
  const first = windowed ? Math.max(0, Math.floor(scrollTop / ROW_H) - 10) : 0
  const last = windowed
    ? Math.min(rows.length, first + Math.ceil(viewportH / ROW_H) + 20)
    : rows.length

  const selectable = selected !== undefined && onSelectedChange !== undefined
  const allSelected = selectable && rows.length > 0 && selected.size === rows.length

  const toggleRow = useCallback(
    (i: number) => {
      if (!selectable) return
      const next = new Set(selected)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      onSelectedChange(next)
    },
    [selectable, selected, onSelectedChange]
  )

  const clickHeader = useCallback(
    (name: string) => {
      if (!onSort) return
      // asc → desc → unsorted
      if (!sort || sort.column !== name) onSort({ column: name, dir: 'asc' })
      else if (sort.dir === 'asc') onSort({ column: name, dir: 'desc' })
      else onSort(null)
    },
    [onSort, sort]
  )

  // Without columns even the header can't be drawn — a full skeleton table.
  if (columns.length === 0) {
    if (loading) return <SkeletonTable rows={10} cols={5} className="p-1" />
    return <p className="px-3.5 py-6 text-center text-note text-muted">{shownEmptyText}</p>
  }

  const skeletonCols = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)

  return (
    <>
      <div
        ref={scroller}
        className="h-full overflow-auto"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <table className="w-max min-w-full border-collapse text-note">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line text-badge tracking-wide text-muted uppercase">
              {selectable && (
                <th className="w-8 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() =>
                      onSelectedChange(allSelected ? new Set() : new Set(rows.map((_, i) => i)))
                    }
                    className="accent-accent"
                  />
                </th>
              )}
              {columns.map((c, ci) => (
                <th
                  key={`${c.name}-${ci}`}
                  onClick={() => c.sortable !== false && clickHeader(c.name)}
                  className={cx(
                    'px-2.5 py-1.5 text-left font-medium whitespace-nowrap',
                    onSort && c.sortable !== false && 'cursor-pointer hover:text-text'
                  )}
                >
                  <span className="text-text/80">{c.name}</span>
                  {c.hint && <span className="ml-1.5 normal-case opacity-60">{c.hint}</span>}
                  {sort?.column === c.name && (
                    <span className="ml-1 text-accent">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
              {rowActions && <th className="w-16 px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 12 }, (_, r) => (
                <tr key={`sk-${r}`} style={{ height: ROW_H }} className="border-b border-line-soft">
                  {Array.from({ length: skeletonCols }, (_, c) => (
                    <td key={c} className="px-2.5">
                      <Skeleton
                        h={9}
                        w={c === 0 ? '70%' : `${Math.max(38, 84 - c * 9)}%`}
                        delay={r * 55 + c * 25}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                  className="px-3.5 py-8 text-center text-note text-muted"
                >
                  {shownEmptyText}
                </td>
              </tr>
            )}
            {first > 0 && <tr style={{ height: first * ROW_H }} />}
            {rows.slice(first, last).map((row, i) => {
              const index = first + i
              return (
                <tr
                  key={index}
                  style={{ height: ROW_H }}
                  className={cx(
                    'group border-b border-line-soft last:border-0',
                    selectable && selected.has(index) ? 'bg-accent-bg' : 'hover:bg-panel-2/60'
                  )}
                >
                  {selectable && (
                    <td className="px-2">
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggleRow(index)}
                        className="accent-accent"
                      />
                    </td>
                  )}
                  {columns.map((c, ci) => (
                    <Cell
                      key={`${c.name}-${ci}`}
                      value={row[ci] ?? null}
                      onZoom={(v) => setZoom({ column: c.name, value: v })}
                    />
                  ))}
                  {rowActions && (
                    <td className="px-2 text-right whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                      {rowActions(index)}
                    </td>
                  )}
                </tr>
              )
            })}
            {last < rows.length && <tr style={{ height: (rows.length - last) * ROW_H }} />}
          </tbody>
        </table>
      </div>

      {zoom && (
        <Modal wide title={zoom.column} onClose={() => setZoom(null)}>
          <pre className="overflow-auto rounded-md border border-line bg-sunken p-3 font-mono text-small leading-relaxed whitespace-pre-wrap">
            {pretty(zoom.value)}
          </pre>
        </Modal>
      )}
    </>
  )
}

/**
 * A `null` and an empty string MUST look different — since every cell arrives as
 * text (see `TEXT_TYPES` in `sql/build.ts`), this is the only distinguishing mark.
 */
function Cell({ value, onZoom }: { value: string | null; onZoom: (v: string) => void }): ReactNode {
  const t = useT()
  if (value === null) {
    return (
      <td className="px-2.5 font-mono text-small whitespace-nowrap">
        <span className="text-faint italic">NULL</span>
      </td>
    )
  }
  if (value === '') {
    return (
      <td className="px-2.5 whitespace-nowrap">
        <span className="rounded border border-line px-1 py-px font-mono text-badge text-muted">
          &apos;&apos;
        </span>
      </td>
    )
  }
  const long = value.length > CELL_MAX || value.includes('\n')
  const shown = long ? `${value.slice(0, CELL_MAX).replace(/\n/g, ' ')}…` : value
  return (
    <td
      title={long ? t('dataGrid.clickForFullValue') : value}
      onClick={long ? () => onZoom(value) : undefined}
      className={cx(
        'px-2.5 font-mono text-small whitespace-nowrap',
        long && 'cursor-pointer text-text hover:text-accent'
      )}
    >
      {shown}
    </td>
  )
}

function pretty(value: string): string {
  const t = value.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2)
    } catch {
      // not JSON after all — show it as it is
    }
  }
  return value
}
