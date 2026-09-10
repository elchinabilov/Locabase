import type {
  ReactNode,
  InputHTMLAttributes,
  ButtonHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/format'
import { useI18n, useT } from '../i18n'

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border-transparent font-medium',
  subtle: 'bg-panel-2 text-text hover:bg-panel-3 border-line',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-panel-2 border-transparent',
  danger: 'bg-transparent text-danger hover:bg-danger-bg border-danger-border'
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
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-ui leading-none',
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
            {title && <h2 className="truncate text-card font-medium text-text">{title}</h2>}
            {subtitle && <p className="mt-0.5 truncate text-small text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------- Badge */

export type Tone = 'muted' | 'ok' | 'warn' | 'danger' | 'info'

/**
 * Module scope, and typed by the union rather than by `string`: rebuilding the
 * map on every render bought nothing, and `Record<string, string>` meant a tone
 * added to the union without a class here would compile.
 */
const BADGE_TONES: Record<Tone, string> = {
  muted: 'bg-chip text-muted border-line',
  ok: 'bg-accent-bg text-accent border-accent-border',
  warn: 'bg-warn-chip text-warn border-warn-border',
  danger: 'bg-danger-bg text-danger border-danger-border',
  info: 'bg-info-bg text-info border-info-border'
}

export function Badge({
  tone = 'muted',
  children
}: {
  tone?: Tone
  children: ReactNode
}): ReactNode {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-badge font-medium tracking-wide whitespace-nowrap',
        BADGE_TONES[tone]
      )}
    >
      {children}
    </span>
  )
}

const DOT_TONES: Record<Exclude<Tone, 'info'>, string> = {
  ok: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-dimmer'
}

export function Dot({ tone }: { tone: Exclude<Tone, 'info'> }): ReactNode {
  return <span className={cx('inline-block size-1.5 shrink-0 rounded-full', DOT_TONES[tone])} />
}

/* ------------------------------------------------------------------ Inputs */

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return (
    <input
      {...rest}
      className={cx(
        'w-full rounded-md border border-line bg-sunken px-2 py-1.5 text-ui text-text',
        'placeholder:text-faint focus:border-accent-dim focus:outline-none disabled:opacity-50',
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
        pending && 'border-warn-border bg-warn-chip',
        !checked && 'border-line bg-sunken'
      )}
    >
      <span
        className={cx(
          'absolute top-[2px] size-3 rounded-full transition-all',
          checked ? 'left-[16px]' : 'left-[2px]',
          on && 'bg-accent',
          pending && 'bg-warn',
          !checked && 'bg-dim'
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
        'w-full rounded-md border border-line bg-sunken px-2 py-1.5 text-ui text-text',
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let modalSeq = 0

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
  const titleId = useRef(`modal-title-${++modalSeq}`).current

  useEffect(() => {
    const dialog = ref.current
    // Where focus was before the dialog opened, so it can be handed back. Without
    // this the caret lands at the top of the document on close.
    const opener = document.activeElement as HTMLElement | null
    dialog?.focus()
    return () => opener?.focus?.()
  }, [])

  /**
   * Escape and Tab are handled ON the dialog rather than on `window`: a nested
   * dialog (the grid's value zoom inside a row editor) would otherwise see one
   * Escape close both. Tab is cycled inside, so focus cannot wander into the
   * sidebar behind the overlay.
   */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--lb-overlay)] p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      // Presentational: it exists to catch a click outside the dialog. It must
      // NOT be `aria-hidden` — that would hide the dialog inside it from screen
      // readers. Escape on the dialog is the keyboard equivalent of this click.
      role="presentation"
    >
      {/* A dialog handling its own Escape and Tab is the point of a focus trap;
          the rule classes `dialog` as non-interactive and cannot see that. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cx(
          'flex max-h-full w-full flex-col rounded-lg border border-line bg-panel shadow-2xl outline-none',
          wide ? 'max-w-4xl' : 'max-w-lg'
        )}
      >
        <header className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <h2 id={titleId} className="text-card font-medium">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-text"
            aria-label={t('common.close')}
          >
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

/**
 * A dialog that will not act until the exact name is typed back.
 *
 * Three of these existed — reset the local database, deploy to an environment,
 * restore over one — each with its own copy of the typed-name check, the busy
 * button and the error note. The guard is the point of the dialog, so it lives
 * in one place rather than three.
 */
export function ConfirmModal({
  title,
  expected,
  confirmLabel,
  busy,
  error,
  onClose,
  onConfirm,
  children,
  hint
}: {
  title: string
  /** What the user has to type — usually the project or environment name. */
  expected: string
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
  /** The explanation of what is about to happen. */
  children: ReactNode
  /** Label for the input, naming what has to be typed. */
  hint: string
}): ReactNode {
  const t = useT()
  const [text, setText] = useState('')

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} disabled={text !== expected}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="mb-3 text-ui leading-relaxed">{children}</div>
      <Row label={hint}>
        <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </Row>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  )
}

/* ------------------------------------------------------------------ Misc */

export function Empty({ title, hint }: { title: string; hint?: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-card text-muted">{title}</p>
      {hint && <div className="max-w-md text-note text-faint">{hint}</div>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-note text-danger-soft">
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
        <div className="text-ui text-text">{label}</div>
        {hint && <div className="mt-1 text-small leading-snug text-muted">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------- Pager */

export function Pager({
  page,
  pageSize,
  count,
  total,
  onPage
}: {
  page: number
  pageSize: number
  count: number
  total: number | null
  onPage: (p: number) => void
}): ReactNode {
  const { locale } = useI18n()
  const from = count === 0 ? 0 : page * pageSize + 1
  const to = page * pageSize + count
  const last = total !== null && to >= total
  return (
    <div className="flex items-center gap-1.5 text-small text-muted">
      <Button disabled={page === 0} onClick={() => onPage(page - 1)}>
        ‹
      </Button>
      <span className="tabular-nums">
        {from}–{to}
        {total !== null && ` / ${formatCount(total, locale)}`}
      </span>
      <Button disabled={count < pageSize || last} onClick={() => onPage(page + 1)}>
        ›
      </Button>
    </div>
  )
}

/** Thousands separators follow the interface language, not the system locale. */
export function formatCount(n: number, locale: 'az' | 'en'): string {
  return n.toLocaleString(locale === 'az' ? 'az-AZ' : 'en-US')
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
        <li key={i} className={cx('flex items-center gap-3 px-3.5', compact ? 'py-2' : 'py-2.5')}>
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
    <div
      className={cx('flex flex-col gap-0.5', className)}
      role="status"
      aria-label={t('common.loading')}
    >
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
