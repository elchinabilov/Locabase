export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function shortPath(path: string, keep = 2): string {
  const segs = path.split('/').filter(Boolean)
  return segs.length <= keep ? path : `…/${segs.slice(-keep).join('/')}`
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s} san. əvvəl`
  if (s < 3600) return `${Math.round(s / 60)} dəq. əvvəl`
  if (s < 86400) return `${Math.round(s / 3600)} saat əvvəl`
  return `${Math.round(s / 86400)} gün əvvəl`
}

export function clock(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('az-AZ', { hour12: false })
}
