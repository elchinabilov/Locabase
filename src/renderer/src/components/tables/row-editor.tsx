/**
 * Editing one row: the create/edit form, and the delete confirmation.
 *
 * A cell is one of three things — a value, an explicit NULL, or "leave it to
 * the column default" — and keeping those apart is the whole reason this is a
 * form rather than a set of inputs bound straight to strings.
 */
import { useMemo, useState, type ReactNode } from 'react'
import type { DbCells, DbColumn, DbRow } from '@shared/types'
import { useT } from '../../i18n'
import { Badge, Button, ErrorNote, Input, Modal } from '../ui'
import { pkCells } from './cells'

type FieldMode = 'value' | 'null' | 'default'
interface Field {
  mode: FieldMode
  text: string
}

export function RowModal({
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
                <div className="font-mono text-note text-text">{c.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-meta text-muted">
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
                    className="w-full rounded-md border border-line bg-sunken px-2 py-1.5 font-mono text-note text-text focus:border-accent-dim focus:outline-none disabled:opacity-40"
                  />
                ) : (
                  <Input
                    value={f.text}
                    disabled={f.mode !== 'value'}
                    onChange={(e) => set(c.name, { text: e.target.value })}
                    className="font-mono"
                  />
                )}
                <div className="mt-1 flex items-center gap-3 text-meta text-muted">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={f.mode === 'null'}
                      onChange={(e) => set(c.name, { mode: e.target.checked ? 'null' : 'value' })}
                      className="accent-accent"
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
                        className="accent-accent"
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

export function DeleteModal({
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
      <p className="mb-3 text-ui text-muted">{t('tables.irreversible')}</p>
      <ul className="max-h-64 overflow-auto rounded-md border border-line bg-sunken p-2 font-mono text-small">
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

export function changedOnly(columns: DbColumn[], row: DbRow, values: DbCells): DbCells {
  const out: DbCells = {}
  columns.forEach((c, i) => {
    if (!(c.name in values)) return
    const before = row[i] ?? null
    const after = values[c.name] ?? null
    if (before !== after) out[c.name] = after
  })
  return out
}
