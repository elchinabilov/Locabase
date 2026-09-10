/**
 * The "Structure" tab: the column list with type, nullability, default, and
 * the foreign keys you can follow into another table.
 */
import type { ReactNode } from 'react'
import type { DbTable, Project } from '@shared/types'
import { useQuery } from '../../lib/ipc'
import { useT } from '../../i18n'
import { Badge, ErrorNote, SkeletonTable } from '../ui'

export function StructurePane({
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
  const cols = useQuery('db:columns', {
    id: project.id,
    envId,
    schema: table.schema,
    table: table.name
  })

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-4xl">
        {cols.error && <ErrorNote>{cols.error}</ErrorNote>}
        <table className="w-full text-note">
          <thead>
            <tr className="border-b border-line text-badge tracking-wide text-muted uppercase">
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
                <td className="px-2 py-1.5 font-mono text-small text-text">{c.name}</td>
                <td className="px-2 py-1.5 text-muted">{c.dataType}</td>
                <td className="max-w-[220px] truncate px-2 py-1.5 font-mono text-meta text-muted">
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
                        className="text-badge text-info hover:underline"
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
        <p className="mt-4 text-small leading-relaxed text-muted">{t('tables.ddlHint')}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ modallar */
