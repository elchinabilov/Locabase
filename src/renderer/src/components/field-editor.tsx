import { useState, type ReactNode } from 'react'
import type { ConfigField, ConfigValue, FieldValue } from '@shared/types'
import { Input, Select, Toggle } from './ui'
import { cx } from '../lib/format'

export type PatchInput = ConfigValue | { env: string } | undefined

/** Sahənin hazırkı redaktə dəyəri: ya literal, ya `env(VAR)`. */
export interface Draft {
  kind: 'literal' | 'env'
  value: ConfigValue
}

export function draftFrom(fv: FieldValue | undefined, field: ConfigField): Draft {
  if (!fv || !fv.present) {
    return { kind: 'literal', value: field.default ?? defaultFor(field) }
  }
  return { kind: fv.kind, value: fv.value }
}

function defaultFor(field: ConfigField): ConfigValue {
  switch (field.type) {
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'string[]':
      return []
    default:
      return ''
  }
}

export function toPatchValue(draft: Draft): PatchInput {
  if (draft.kind === 'env') return { env: String(draft.value) }
  return draft.value
}

export function sameDraft(a: Draft, b: Draft): boolean {
  if (a.kind !== b.kind) return false
  if (Array.isArray(a.value) || Array.isArray(b.value)) {
    const x = Array.isArray(a.value) ? a.value : []
    const y = Array.isArray(b.value) ? b.value : []
    return x.length === y.length && x.every((v, i) => v === y[i])
  }
  return a.value === b.value
}

export function FieldEditor({
  field,
  draft,
  original,
  onChange
}: {
  field: ConfigField
  draft: Draft
  original: FieldValue | undefined
  onChange: (d: Draft) => void
}): ReactNode {
  const [revealed, setRevealed] = useState(false)
  const dirty = !sameDraft(draft, draftFrom(original, field))
  const absent = original?.present !== true

  const control = (): ReactNode => {
    if (draft.kind === 'env') {
      return (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-muted">env(</span>
          <Input
            value={String(draft.value)}
            onChange={(e) => onChange({ kind: 'env', value: e.target.value })}
            className="font-mono"
            placeholder="DƏYİŞƏN_ADI"
          />
          <span className="font-mono text-[11.5px] text-muted">)</span>
        </div>
      )
    }
    switch (field.type) {
      case 'boolean':
        return (
          <Toggle
            checked={draft.value === true}
            onChange={(v) => onChange({ kind: 'literal', value: v })}
          />
        )
      case 'number':
        return (
          <Input
            type="number"
            value={String(draft.value)}
            onChange={(e) => onChange({ kind: 'literal', value: Number(e.target.value) })}
            className="max-w-[160px]"
          />
        )
      case 'enum':
        return (
          <Select
            value={String(draft.value)}
            options={(field.options ?? []).map((o) => ({ value: o, label: o === '' ? '(yoxdur)' : o }))}
            onChange={(v) => onChange({ kind: 'literal', value: v })}
            className="max-w-[320px]"
          />
        )
      case 'string[]':
        return (
          <Input
            value={(Array.isArray(draft.value) ? draft.value : []).join(', ')}
            onChange={(e) =>
              onChange({
                kind: 'literal',
                value: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
            placeholder="vergüllə ayır"
            className="font-mono"
          />
        )
      default:
        return (
          <Input
            type={field.secret && !revealed ? 'password' : 'text'}
            value={String(draft.value)}
            onChange={(e) => onChange({ kind: 'literal', value: e.target.value })}
            placeholder={field.placeholder}
          />
        )
    }
  }

  return (
    <div
      className={cx(
        'grid grid-cols-[minmax(200px,300px)_1fr] items-start gap-4 px-3.5 py-2.5',
        dirty && 'bg-[#101c17]'
      )}
    >
      <div className="pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] text-text">{field.label}</span>
          {dirty && <span className="size-1.5 rounded-full bg-accent" title="dəyişib" />}
          {absent && !dirty && (
            <span className="text-[10px] text-[#54677a]" title="faylda yoxdur — default işləyir">
              default
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[10.5px] text-[#54677a]">{field.path}</div>
        {field.help && <p className="mt-1 text-[11.5px] leading-snug text-muted">{field.help}</p>}
      </div>

      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{control()}</div>
          {field.secret && draft.kind === 'literal' && (
            <button
              onClick={() => setRevealed((v) => !v)}
              className="mt-1.5 text-[10.5px] text-muted hover:text-text"
            >
              {revealed ? 'gizlət' : 'göstər'}
            </button>
          )}
          {field.envAllowed && (
            <button
              onClick={() =>
                onChange(
                  draft.kind === 'env'
                    ? { kind: 'literal', value: '' }
                    : { kind: 'env', value: String(draft.value || '') }
                )
              }
              className={cx(
                'mt-1 rounded border px-1.5 py-0.5 text-[10.5px] whitespace-nowrap',
                draft.kind === 'env'
                  ? 'border-accent-dim bg-[#0f2a20] text-accent'
                  : 'border-line text-muted hover:text-text'
              )}
              title=".env faylındakı dəyişənə bağla"
            >
              env()
            </button>
          )}
        </div>
        {draft.kind === 'env' && original?.kind === 'env' && (
          <p className="mt-1 font-mono text-[10.5px] text-muted">
            hazırkı dəyər:{' '}
            {original.envValue === null ? (
              <span className="text-warn">.env-də yoxdur</span>
            ) : (
              original.envValue
            )}
          </p>
        )}
      </div>
    </div>
  )
}
