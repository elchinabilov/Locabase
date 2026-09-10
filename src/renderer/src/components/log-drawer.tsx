import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LogLine } from '@shared/types'
import { useEvent } from '../lib/ipc'
import { clock, cx } from '../lib/format'
import { useI18n, useT } from '../i18n'

const MAX = 800

const LEVEL_CLASS: Record<string, string> = {
  error: 'text-danger',
  warn: 'text-warn',
  info: 'text-info',
  stderr: 'text-danger-soft',
  stdout: 'text-text-soft'
}

export function LogDrawer({ open, onToggle }: { open: boolean; onToggle: () => void }): ReactNode {
  const [lines, setLines] = useState<LogLine[]>([])
  const [filter, setFilter] = useState('')
  const [unseen, setUnseen] = useState(0)
  const t = useT()
  const { locale } = useI18n()
  const boxRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEvent('log:line', (line) => {
    setLines((prev) => {
      const next =
        prev.length >= MAX ? [...prev.slice(prev.length - MAX + 1), line] : [...prev, line]
      return next
    })
    if (!open) setUnseen((n) => n + 1)
  })

  useEffect(() => {
    if (open) setUnseen(0)
  }, [open, lines.length])

  useEffect(() => {
    if (!open || !stickRef.current) return
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [lines, open])

  const shown = filter
    ? lines.filter((l) => (l.text + l.stream).toLowerCase().includes(filter.toLowerCase()))
    : lines

  return (
    <div className={cx('shrink-0 border-t border-line bg-panel', open && 'h-[260px]')}>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-small text-muted hover:text-text"
        >
          <span className={cx('transition-transform', open && 'rotate-90')}>▸</span>
          {t('logDrawer.title')}
        </button>
        {!open && unseen > 0 && (
          <span className="rounded bg-chip px-1.5 py-0.5 text-micro text-accent">{unseen}</span>
        )}
        <div className="flex-1" />
        {open && (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('logDrawer.filterPlaceholder')}
              className="w-40 rounded border border-line bg-sunken px-2 py-1 text-small outline-none focus:border-accent-dim"
            />
            <button onClick={() => setLines([])} className="text-small text-muted hover:text-text">
              {t('logDrawer.clear')}
            </button>
          </>
        )}
      </div>

      {open && (
        <div
          ref={boxRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="h-[220px] overflow-auto px-3 pb-2 font-mono text-meta leading-[1.55]"
        >
          {shown.length === 0 && <p className="py-4 text-muted">{t('logDrawer.empty')}</p>}
          {shown.map((l, i) => (
            <div key={i} className="flex gap-2 whitespace-pre-wrap">
              <span className="shrink-0 text-dim">{clock(l.at, locale)}</span>
              <span className="w-[120px] shrink-0 truncate text-faint">{l.stream}</span>
              <span className={cx('min-w-0 flex-1', LEVEL_CLASS[l.level] ?? '')}>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
