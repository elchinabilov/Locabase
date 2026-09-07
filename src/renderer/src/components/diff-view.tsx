import { useMemo, type ReactNode } from 'react'
import { diffLines } from '../lib/diff'
import { cx } from '../lib/format'

export function DiffView({
  before,
  after,
  context = 2
}: {
  before: string
  after: string
  context?: number
}): ReactNode {
  const lines = useMemo(() => diffLines(before, after, context), [before, after, context])

  if (lines.length === 0) {
    return <p className="py-4 text-center text-[12px] text-muted">Fərq yoxdur.</p>
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-[#0d141b] py-1 font-mono text-[11.5px] leading-[1.6]">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx(
            'flex gap-3 px-2 whitespace-pre',
            l.kind === 'add' && 'bg-[#0f2a20] text-accent',
            l.kind === 'del' && 'bg-[#241417] text-[#e79a9a]',
            l.kind === 'gap' && 'text-[#3f4f5f]'
          )}
        >
          <span className="w-9 shrink-0 text-right text-[#3f4f5f] select-none">
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
