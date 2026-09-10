export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function shortPath(path: string, keep = 2): string {
  const segs = path.split('/').filter(Boolean)
  return segs.length <= keep ? path : `…/${segs.slice(-keep).join('/')}`
}

/**
 * Relative time, localized through `Intl` rather than a phrase in the
 * dictionaries — the wording of "3 minutes ago" is grammar, not copy.
 */
export function timeAgo(iso: string, locale = 'en'): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (s < 60) return rtf.format(-s, 'second')
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  return rtf.format(-Math.round(s / 86400), 'day')
}

export function clock(iso: string, locale = 'en'): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(locale, { hour12: false })
}

/** `1536` → `1.5 KB`. Sizes are read at a glance, so one decimal is plenty. */
export function bytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const value = n / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/**
 * Date + time in the interface language, no seconds.
 *
 * Absolute, not relative: "3 days ago" is useless when comparing two sign-ups.
 * `hour12` is pinned off so the shape does not change with the locale — a table
 * of timestamps has to line up.
 */
export function stamp(iso: string | null, locale = 'en'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  // A timestamp the database gave us in a shape `Date` cannot read is still
  // worth showing raw; blanking it would hide that something is wrong.
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale === 'az' ? 'az-AZ' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}
