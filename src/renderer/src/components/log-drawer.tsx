import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LogLine } from '@shared/types'
import { useEvent } from '../lib/ipc'
import { clock, cx } from '../lib/format'

const MAX = 800

const LEVEL_CLASS: Record<string, string> = {
  error: 'text-danger',
  warn: 'text-warn',
  info: 'text-info',
  stderr: 'text-[#d9a3a3]',
  stdout: 'text-[#9fb3c6]'
}

export function LogDrawer({
  open,
  onToggle
}: {
  open: boolean
  onToggle: () => void
}): ReactNode {
  const [lines, setLines] = useState<LogLine[]>([])
  const [filter, setFilter] = useState('')
  const [unseen, setUnseen] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEvent('log:line', (line) => {
    setLines((prev) => {
      const next = prev.length >= MAX ? [...prev.slice(prev.length - MAX + 1), line] : [...prev, line]
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
          className="flex items-center gap-1.5 text-[11.5px] text-muted hover:text-text"
        >
          <span className={cx('transition-transform', open && 'rotate-90')}>▸</span>
          Loglar
        </button>
        {!open && unseen > 0 && (
          <span className="rounded bg-[#1a242f] px-1.5 py-0.5 text-[10px] text-accent">
            {unseen}
          </span>
        )}
        <div className="flex-1" />
        {open && (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filtr…"
              className="w-40 rounded border border-line bg-[#0d141b] px-2 py-1 text-[11.5px] outline-none focus:border-accent-dim"
            />
            <button
              onClick={() => setLines([])}
              className="text-[11.5px] text-muted hover:text-text"
            >
              təmizlə
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
          className="h-[220px] overflow-auto px-3 pb-2 font-mono text-[11px] leading-[1.55]"
        >
          {shown.length === 0 && <p className="py-4 text-muted">Hələ log yoxdur.</p>}
          {shown.map((l, i) => (
            <div key={i} className="flex gap-2 whitespace-pre-wrap">
              <span className="shrink-0 text-[#4a5b6c]">{clock(l.at)}</span>
              <span className="w-[120px] shrink-0 truncate text-[#5f7488]">{l.stream}</span>
              <span className={cx('min-w-0 flex-1', LEVEL_CLASS[l.level] ?? '')}>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
