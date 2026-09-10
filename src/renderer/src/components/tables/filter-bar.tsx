/**
 * The row filter strip above the grid: add a column/operator/value condition,
 * or drop one. The operator tables live here because nothing else needs them.
 */
import { useState, type ReactNode } from 'react'
import type { DbColumn, DbFilter, DbOp } from '@shared/types'
import { useT, type TranslationKey } from '../../i18n'
import { Button, Input, Modal, Select } from '../ui'

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

export function FilterBar({
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
          className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-badge text-muted hover:text-danger"
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
              options={(Object.keys(OP_SYMBOLS) as DbOp[]).map((op) => ({
                value: op,
                label: opLabel(op)
              }))}
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
