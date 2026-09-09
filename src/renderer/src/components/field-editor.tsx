import { useState, type ReactNode } from 'react'
import type { ConfigField, ConfigValue, FieldValue } from '@shared/types'
import { Input, Select, Toggle } from './ui'
import { cx } from '../lib/format'
import { useT } from '../i18n'

export type PatchInput = ConfigValue | { env: string } | undefined

/** The field's current editing value: either a literal or `env(VAR)`. */
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
  const t = useT()
  const [revealed, setRevealed] = useState(false)
  const dirty = !sameDraft(draft, draftFrom(original, field))
  const absent = original?.present !== true

  const control = (): ReactNode => {
    if (draft.kind === 'env') {
      return (
        <div className="flex items-center gap-2">
          <span className="font-mono text-small text-muted">env(</span>
          <Input
            value={String(draft.value)}
            onChange={(e) => onChange({ kind: 'env', value: e.target.value })}
            className="font-mono"
            placeholder={t('fieldEditor.varNamePlaceholder')}
          />
          <span className="font-mono text-small text-muted">)</span>
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
            options={(field.options ?? []).map((o) => ({
              value: o,
              label: o === '' ? t('fieldEditor.none') : o
            }))}
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
            placeholder={t('fieldEditor.commaSeparated')}
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
        dirty && 'bg-accent-tint'
      )}
    >
      <div className="pt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-ui text-text">{field.label}</span>
          {dirty && (
            <span className="size-1.5 rounded-full bg-accent" title={t('fieldEditor.changed')} />
          )}
          {absent && !dirty && (
            <span className="text-micro text-faint" title={t('fieldEditor.defaultTitle')}>
              {t('fieldEditor.default')}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-badge text-faint">{field.path}</div>
        {field.help && <p className="mt-1 text-small leading-snug text-muted">{field.help}</p>}
      </div>

      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{control()}</div>
          {field.secret && draft.kind === 'literal' && (
            <button
              onClick={() => setRevealed((v) => !v)}
              className="mt-1.5 text-badge text-muted hover:text-text"
            >
              {revealed ? t('fieldEditor.hide') : t('fieldEditor.reveal')}
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
                'mt-1 rounded border px-1.5 py-0.5 text-badge whitespace-nowrap',
                draft.kind === 'env'
                  ? 'border-accent-dim bg-accent-bg text-accent'
                  : 'border-line text-muted hover:text-text'
              )}
              title={t('fieldEditor.bindEnvTitle')}
            >
              env()
            </button>
          )}
        </div>
        {draft.kind === 'env' && original?.kind === 'env' && (
          <p className="mt-1 font-mono text-badge text-muted">
            {t('fieldEditor.currentValue')}{' '}
            {original.envValue === null ? (
              <span className="text-warn">{t('fieldEditor.missingInEnv')}</span>
            ) : (
              original.envValue
            )}
          </p>
        )}
      </div>
    </div>
  )
}
