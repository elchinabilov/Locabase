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
