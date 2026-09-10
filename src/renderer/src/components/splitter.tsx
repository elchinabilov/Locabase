/**
 * A draggable seam between two panes.
 *
 * It renders the dividing line itself — the panes around it should not also
 * draw a border, or there will be two. The hit area is deliberately wider than
 * the 1px line: a hairline is almost impossible to grab, so the element is 5px
 * and the line is drawn inside it.
 *
 * The size being changed stays with the caller. This only reports where the
 * pointer went, in whichever unit the caller keeps its size in:
 *  - `mode="px"` — the delta in pixels (a sidebar width, say);
 *  - `mode="percent"` — the delta as a share of `containerRef`'s size, for a
 *    pane that should keep its proportion when the window is resized.
 *
 * `invert` is for a pane that sits *after* the seam: dragging down makes the
 * pane below smaller, not bigger.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/format'

export interface SplitterProps {
  /** `x` — a vertical seam dragged sideways; `y` — a horizontal one dragged up and down. */
  axis: 'x' | 'y'
  value: number
  min: number
  max: number
  onChange: (next: number) => void
  /** Double-click, or Home, goes back to this. Omitted — neither does anything. */
  defaultValue?: number
  mode?: 'px' | 'percent'
  /** Required for `mode="percent"` — the box the percentage is measured against. */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Keyboard step. Pixels or percentage points, matching `mode`. */
  step?: number
  /** The pane being sized sits *after* the seam, so the drag direction flips. */
  invert?: boolean
  label: string
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

export function Splitter({
  axis,
  value,
  min,
  max,
  onChange,
  defaultValue,
  mode = 'px',
  containerRef,
  step,
  invert,
  label
}: SplitterProps): ReactNode {
  const [dragging, setDragging] = useState(false)
  // The origin of the gesture, not the previous frame — measuring against the
  // start is what keeps a long drag from accumulating rounding drift.
  const origin = useRef<{ pos: number; value: number } | null>(null)

  const containerSize = useCallback((): number => {
    const el = containerRef?.current
    if (!el) return 0
    return axis === 'x' ? el.clientWidth : el.clientHeight
  }, [axis, containerRef])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      origin.current = { pos: axis === 'x' ? e.clientX : e.clientY, value }
      setDragging(true)
      // The cursor has to survive leaving the 5px strip, and a drag must not
      // start selecting the text it passes over.
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [axis, value]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = origin.current
      if (!start) return
      const pos = axis === 'x' ? e.clientX : e.clientY
      let delta = (pos - start.pos) * (invert ? -1 : 1)
      if (mode === 'percent') {
        const size = containerSize()
        if (size <= 0) return
        delta = (delta / size) * 100
      }
      onChange(clamp(start.value + delta, min, max))
    },
    [axis, mode, invert, containerSize, onChange, min, max]
  )

  const stop = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!origin.current) return
    origin.current = null
    setDragging(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const unit = (step ?? (mode === 'percent' ? 2 : 16)) * (e.shiftKey ? 3 : 1)
      const [back, fwd] =
        axis === 'x'
          ? invert
            ? ['ArrowRight', 'ArrowLeft']
            : ['ArrowLeft', 'ArrowRight']
          : invert
            ? ['ArrowDown', 'ArrowUp']
            : ['ArrowUp', 'ArrowDown']
      if (e.key === back) onChange(clamp(value - unit, min, max))
      else if (e.key === fwd) onChange(clamp(value + unit, min, max))
      else if (e.key === 'Home' && defaultValue !== undefined) onChange(defaultValue)
      else return
      e.preventDefault()
    },
    [axis, step, mode, invert, value, min, max, onChange, defaultValue]
  )

  /*
   * A window splitter is the one `separator` that is *meant* to be focusable and
   * operable (WAI-ARIA window-splitter pattern) — the generic rules cannot tell
   * it apart from a decorative rule, so they are turned off for this element.
   */
  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      className={cx(
        // Exactly as wide as the border it replaces. A thicker element would
        // take up layout, and its own background would read as a gap between
        // the two panes — so the grab area is the overlay below, not this.
        'relative z-10 shrink-0 touch-none transition-colors',
        axis === 'x' ? 'w-px' : 'h-px',
        dragging ? 'bg-accent' : 'bg-line hover:bg-accent-dim'
      )}
    >
      {/* A hairline is unusable as a pointer target, so the grab area reaches
          3px into each neighbour — overhanging rather than displacing them. */}
      <span
        className={cx(
          'absolute',
          axis === 'x'
            ? 'inset-y-0 -right-[3px] -left-[3px] cursor-col-resize'
            : 'inset-x-0 -top-[3px] -bottom-[3px] cursor-row-resize'
        )}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- storage */

/**
 * A pane size that survives a restart. Same idea as the theme and font
 * settings: `localStorage`, read once, written on change — a layout the user
 * dragged into place should still be there tomorrow.
 */
export function useStoredSize(key: string, initial: number): [number, (n: number) => void] {
  const [size, setSize] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key)
      const n = raw === null ? NaN : Number(raw)
      return Number.isFinite(n) ? n : initial
    } catch {
      return initial
    }
  })

  const set = useCallback(
    (n: number) => {
      setSize(n)
      try {
        localStorage.setItem(key, String(n))
      } catch {
        // unsaved is fine — the drag still applies to this session
      }
    },
    [key]
  )

  return [size, set]
}
