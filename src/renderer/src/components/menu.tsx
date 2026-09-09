/**
 * The ⋮ row menu.
 *
 * Positioned `fixed` from the trigger's own rectangle rather than absolutely
 * inside the row: the rows live in a scrolling container, and an absolutely
 * positioned popover would be clipped by it. The flip side is that a fixed
 * popover doesn't travel with its anchor, so scrolling closes the menu instead
 * of letting it drift away from the row it belongs to.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/format'

export interface MenuItem {
  id: string
  label: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

/** Roughly one item; only used to decide whether the menu opens up or down. */
const ITEM_H = 28
const PADDING = 8
const MIN_W = 168

export function Menu({
  items,
  label,
  className
}: {
  items: MenuItem[]
  /** Accessible name for the trigger — the ⋮ glyph says nothing on its own. */
  label: string
  className?: string
}): ReactNode {
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  const open = at !== null

  const close = useCallback((focusTrigger = false) => {
    setAt(null)
    if (focusTrigger) trigger.current?.focus()
  }, [])

  const toggle = useCallback(() => {
    if (open) return close()
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const height = items.length * ITEM_H + PADDING
    // Open upwards when there isn't room below — the last rows of a long table
    // are exactly where this menu is most likely to be used.
    const below = window.innerHeight - r.bottom
    setAt({
      top: below < height ? Math.max(8, r.top - height - 4) : r.bottom + 4,
      right: Math.max(8, window.innerWidth - r.right)
    })
  }, [open, close, items.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (list.current?.contains(target) || trigger.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(true)
    }
    // Capture, because the scroll happens on an inner container, not on window.
    const onScroll = (): void => close()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, close])

  // Focus moves into the menu on open, so it can be driven from the keyboard.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [open])

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
    )
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1
    buttons[(next + buttons.length) % buttons.length]?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={toggle}
        className={cx(
          'rounded px-1.5 py-0.5 leading-none text-muted hover:bg-panel-2 hover:text-text',
          open && 'bg-panel-2 text-text',
          className
        )}
      >
        ⋮
      </button>

      {at && (
        <div
          ref={list}
          role="menu"
          onKeyDown={onListKey}
          style={{ top: at.top, right: at.right, minWidth: MIN_W }}
          className="fixed z-50 flex flex-col rounded-md border border-line bg-panel py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close()
                item.onSelect()
              }}
              className={cx(
                'px-3 py-1.5 text-left text-ui whitespace-nowrap disabled:opacity-40',
                item.tone === 'danger'
                  ? 'text-danger hover:bg-danger-bg'
                  : 'text-text hover:bg-hover'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
