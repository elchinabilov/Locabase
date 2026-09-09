import { useMemo, type ReactNode } from 'react'
import { diffLines } from '../lib/diff'
import { cx } from '../lib/format'
import { useT } from '../i18n'

export function DiffView({
  before,
  after,
  context = 2
}: {
  before: string
  after: string
  context?: number
}): ReactNode {
  const t = useT()
  const lines = useMemo(() => diffLines(before, after, context), [before, after, context])

  if (lines.length === 0) {
    return <p className="py-4 text-center text-[12px] text-muted">{t('diffView.noDiff')}</p>
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-sunken py-1 font-mono text-[11.5px] leading-[1.6]">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx(
            'flex gap-3 px-2 whitespace-pre',
            l.kind === 'add' && 'bg-accent-bg text-accent',
            l.kind === 'del' && 'bg-danger-tint text-danger-soft',
            l.kind === 'gap' && 'text-dimmer'
          )}
        >
          <span className="w-9 shrink-0 text-right text-dimmer select-none">
            {l.kind === 'gap' ? '' : (l.b ?? l.a ?? '')}
          </span>
          <span className="w-3 shrink-0 select-none">
            {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
          </span>
          <span>{l.text || ' '}</span>
        </div>
      ))}
    </div>
  )
}
