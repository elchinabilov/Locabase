import type { ReactNode, InputHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { useEffect, useRef } from 'react'
import { cx } from '../lib/format'
import { useT } from '../i18n'

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-[#062018] hover:bg-[#4ee0a0] border-transparent font-medium',
  subtle: 'bg-panel-2 text-text hover:bg-[#1d2a37] border-line',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-panel-2 border-transparent',
  danger: 'bg-transparent text-danger hover:bg-[#2a1618] border-[#3a1f22]'
}

export function Button({
  variant = 'subtle',
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }): ReactNode {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] leading-none',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        className
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner(): ReactNode {
  return (
    <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
  )
}

/* -------------------------------------------------------------------- Card */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}): ReactNode {
  return (
    <section className={cx('rounded-lg border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-3.5 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[13px] font-medium text-text">{title}</h2>}
            {subtitle && <p className="mt-0.5 truncate text-[11.5px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------- Badge */

export function Badge({
  tone = 'muted',
  children
}: {
  tone?: 'muted' | 'ok' | 'warn' | 'danger' | 'info'
  children: ReactNode
}): ReactNode {
  const tones: Record<string, string> = {
    muted: 'bg-[#1a242f] text-muted border-line',
    ok: 'bg-[#0f2a20] text-accent border-[#1c4635]',
    warn: 'bg-[#2b2312] text-warn border-[#4a3c17]',
    danger: 'bg-[#2a1618] text-danger border-[#452023]',
    info: 'bg-[#132335] text-info border-[#1d3a55]'
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide whitespace-nowrap',
        tones[tone]
      )}
    >
      {children}
    </span>
  )
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'muted' }): ReactNode {
  const c: Record<string, string> = {
    ok: 'bg-accent',
    warn: 'bg-warn',
    danger: 'bg-danger',
    muted: 'bg-[#3a4a5a]'
  }
  return <span className={cx('inline-block size-1.5 shrink-0 rounded-full', c[tone])} />
}

/* ------------------------------------------------------------------ Inputs */

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return (
    <input
      {...rest}
      className={cx(
        'w-full rounded-md border border-line bg-[#0d141b] px-2 py-1.5 text-[12.5px] text-text',
        'placeholder:text-[#54677a] focus:border-accent-dim focus:outline-none disabled:opacity-50',
        className
      )}
    />
  )
}

/**
 * `tone` separates what the toggle **actually means**: `accent` = on and running,
 * `pending` = on in the configuration but the container isn't up yet (waiting for
 * a restart). This way a stopped service never looks green.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  tone = 'accent'
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  tone?: 'accent' | 'pending'
}): ReactNode {
  const on = checked && tone === 'accent'
  const pending = checked && tone === 'pending'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-tone={tone}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-[18px] w-[32px] shrink-0 rounded-full border transition-colors disabled:opacity-40',
        on && 'border-accent-dim bg-accent-dim',
        pending && 'border-[#4a3c17] bg-[#2b2312]',
        !checked && 'border-line bg-[#0d141b]'
      )}
    >
      <span
        className={cx(
          'absolute top-[2px] size-3 rounded-full transition-all',
          checked ? 'left-[16px]' : 'left-[2px]',
          on && 'bg-accent',
          pending && 'bg-warn',
          !checked && 'bg-[#4a5b6c]'
        )}
      />
    </button>
  )
}

export function Select({
  value,
  options,
  onChange,
  className
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
  className?: string
}): ReactNode {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'w-full rounded-md border border-line bg-[#0d141b] px-2 py-1.5 text-[12.5px] text-text',
        'focus:border-accent-dim focus:outline-none',
        className
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): ReactNode {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          'flex max-h-full w-full flex-col rounded-lg border border-line bg-panel shadow-2xl outline-none',
          wide ? 'max-w-4xl' : 'max-w-lg'
        )}
      >
        <header className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <h2 className="text-[13px] font-medium">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label={t('common.close')}>
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Misc */

export function Empty({ title, hint }: { title: string; hint?: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-[13px] text-muted">{title}</p>
      {hint && <div className="max-w-md text-[12px] text-[#5f7488]">{hint}</div>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="rounded-md border border-[#452023] bg-[#1e1315] px-3 py-2 text-[12px] text-[#f2a0a0]">
      {children}
    </div>
  )
}

export function Row({
  label,
  hint,
  children
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <div className="grid grid-cols-[minmax(180px,260px)_1fr] items-start gap-4 px-3.5 py-2.5">
      <div className="pt-1">
        <div className="text-[12.5px] text-text">{label}</div>
        {hint && <div className="mt-1 text-[11.5px] leading-snug text-muted">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- Skeleton */

/**
 * The basic building block of the loading state. Instead of a spinner it draws
 * the *shape* of the content to come — so the page doesn't jump and the wait
 * feels shorter. `delay` gives lists a wave effect (each row wakes slightly later).
 */
export function Skeleton({
  className,
  w,
  h = 12,
  delay = 0,
  round
}: {
  className?: string
  /** width: a number = px, a string = a CSS value (e.g. '60%'). Full width when omitted. */
  w?: number | string
  h?: number | string
  delay?: number
  round?: boolean
}): ReactNode {
  return (
    <span
      aria-hidden
      className={cx('skeleton block', round && 'rounded-full', className)}
      style={{
        width: w === undefined ? '100%' : typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        ['--sk-delay' as string]: `${delay}ms`
      }}
    />
  )
}

/** A few lines of text; the last line is short so it reads like a paragraph. */
export function SkeletonText({
  lines = 3,
  delay = 0,
  className
}: {
  lines?: number
  delay?: number
  className?: string
}): ReactNode {
  const t = useT()
  return (
    <div className={cx('flex flex-col gap-2', className)} role="status" aria-label={t('common.loading')}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          h={10}
          w={i === lines - 1 ? '55%' : `${88 - (i % 3) * 9}%`}
          delay={delay + i * 70}
        />
      ))}
    </div>
  )
}

/**
 * The loading stand-in for `divide-y` lists (a `<ul>` inside a Card). `avatar`
 * leaves room for a dot/toggle on the left, `trailing` for the badge column on the right.
 */
export function SkeletonList({
  rows = 4,
  avatar,
  trailing,
  compact,
  className
}: {
  rows?: number
  avatar?: boolean
  trailing?: boolean
  compact?: boolean
  className?: string
}): ReactNode {
  const t = useT()
  return (
    <ul
      className={cx('divide-y divide-line-soft', className)}
      role="status"
      aria-label={t('common.loading')}
    >
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className={cx('flex items-center gap-3 px-3.5', compact ? 'py-2' : 'py-2.5')}
        >
          {avatar && <Skeleton w={14} h={14} round delay={i * 80} />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton h={10} w={`${58 - (i % 3) * 11}%`} delay={i * 80} />
            {!compact && <Skeleton h={8} w={`${34 + (i % 2) * 12}%`} delay={i * 80 + 40} />}
          </div>
          {trailing && <Skeleton w={52} h={14} delay={i * 80 + 60} className="rounded" />}
        </li>
      ))}
    </ul>
  )
}

/** For sidebar/panel lists — no card, no separators between rows. */
export function SkeletonRows({
  rows = 5,
  className
}: {
  rows?: number
  className?: string
}): ReactNode {
  const t = useT()
  return (
    <div className={cx('flex flex-col gap-0.5', className)} role="status" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md px-2.5 py-2">
          <Skeleton w={6} h={6} round delay={i * 80} />
          <Skeleton h={10} w={`${70 - (i % 4) * 13}%`} delay={i * 80} />
        </div>
      ))}
    </div>
  )
}

/** Table-shaped loading — the column count and widths follow the real headers. */
export function SkeletonTable({
  rows = 6,
  cols = 4,
  widths,
  className
}: {
  rows?: number
  cols?: number
  widths?: Array<number | string>
  className?: string
}): ReactNode {
  const t = useT()
  return (
    <div className={cx('flex flex-col', className)} role="status" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex items-center gap-3 border-b border-line-soft px-3.5 py-2 last:border-0"
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton
              key={c}
              h={10}
              w={widths?.[c] ?? (c === 0 ? '22%' : `${Math.max(9, 20 - c * 3)}%`)}
              delay={r * 70 + c * 30}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
