/**
 * The saved-query list beside the SQL editor.
 *
 * Queries are ordinary `.sql` files inside the repo, so this is a file list
 * with a rename and a delete — the route only has to say which one is open and
 * whether it has unsaved edits.
 */
import type { ReactNode } from 'react'
import type { SavedQuery } from '@shared/types'
import { cx } from '../../lib/format'
import { useT } from '../../i18n'
import { Menu } from '../menu'
import { ErrorNote, SkeletonRows } from '../ui'

export function SavedQueriesPanel({
  width,
  queries,
  loading,
  activeName,
  dirty,
  error,
  onOpen,
  onNew,
  onRename,
  onDelete
}: {
  width: number
  queries: SavedQuery[] | null
  loading: boolean
  /** The query currently in the editor, if it came from this list. */
  activeName: string | null
  /** The open query has edits that are not saved back to its file. */
  dirty: boolean
  error: string | null
  onOpen: (name: string) => void
  onNew: () => void
  onRename: (name: string) => void
  onDelete: (name: string) => void
}): ReactNode {
  const t = useT()

  return (
    <aside className="flex shrink-0 flex-col bg-panel" style={{ width: `${width}px` }}>
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
        <span className="text-badge font-semibold tracking-[0.09em] text-muted uppercase">
          {t('sql.queries')}
        </span>
        <button
          onClick={onNew}
          title={t('common.save')}
          className="rounded px-1.5 text-h2 leading-none text-muted hover:bg-panel-2 hover:text-accent"
        >
          +
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {error && (
          <div className="mb-1.5">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {loading && queries === null && <SkeletonRows rows={5} />}
        {queries !== null && queries.length === 0 && (
          <p className="px-2 py-3 text-small leading-relaxed text-muted">{t('sql.noSaved')}</p>
        )}
        {(queries ?? []).map((q) => (
          <div
            key={q.name}
            className={cx(
              'group mb-0.5 flex items-center rounded-md pr-1 text-note',
              q.name === activeName ? 'bg-panel-2 text-text' : 'text-muted hover:bg-hover'
            )}
          >
            <button
              onClick={() => onOpen(q.name)}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2.5 text-left"
            >
              <span className="min-w-0 flex-1 truncate">{q.name}</span>
              {q.name === activeName && dirty && <span className="text-accent">•</span>}
            </button>
            {/* The menu trigger stays hidden until the row is hovered or focused —
                  a list of names should read as names, not as a toolbar. The open
                  menu keeps its trigger visible via `has-[[aria-expanded=true]]`. */}
            <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
              <Menu
                label={t('sql.queryMenu', { name: q.name })}
                items={[
                  {
                    id: 'rename',
                    label: t('common.rename'),
                    onSelect: () => onRename(q.name)
                  },
                  {
                    id: 'delete',
                    label: t('common.delete'),
                    tone: 'danger',
                    onSelect: () => onDelete(q.name)
                  }
                ]}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="border-t border-line-soft px-3 py-2 text-badge leading-relaxed text-muted">
        <code>supabase/.locabase/queries/</code> {t('sql.sharedViaGit')}
      </p>
    </aside>
  )
}
