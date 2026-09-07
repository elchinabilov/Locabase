/**
 * Supabase stack-inin servisləri və onları idarə edən `config.toml` açarları.
 *
 * Lokal stack-də servis "söndürmək" konteyneri dayandırmaq deyil — CLI onu
 * ümumiyyətlə qaldırmır. Ona görə açar/dəyər cütü buradadır: `analytics` və
 * `studio` kimi ağır servisləri bağlamaq RAM-da ən çox qazandıran addımdır.
 */

export interface ServiceDef {
  /** konteyner adındakı açar: `supabase_<key>_<project_id>` */
  key: string
  label: string
  /** eyni `configPath`-i bölüşən servislər bir keçidlə idarə olunur */
  configPath: string | null
  /** dayandırıla bilməz */
  required?: boolean
  note?: string
}

export const SERVICES: ServiceDef[] = [
  { key: 'db', label: 'Postgres', configPath: null, required: true },
  { key: 'kong', label: 'Kong (API gateway)', configPath: 'api.enabled' },
  { key: 'rest', label: 'PostgREST', configPath: 'api.enabled' },
  { key: 'auth', label: 'GoTrue (auth)', configPath: 'auth.enabled' },
  { key: 'realtime', label: 'Realtime', configPath: 'realtime.enabled' },
  { key: 'storage', label: 'Storage', configPath: 'storage.enabled' },
  {
    key: 'imgproxy',
    label: 'Imgproxy',
    configPath: 'storage.image_transformation.enabled',
    note: 'Şəkil çevirmə. Storage bağlıdırsa onsuz da qalxmır.'
  },
  { key: 'studio', label: 'Studio', configPath: 'studio.enabled' },
  { key: 'pg_meta', label: 'pg-meta', configPath: 'studio.enabled' },
  { key: 'edge_runtime', label: 'Edge runtime', configPath: 'edge_runtime.enabled' },
  { key: 'inbucket', label: 'Mailpit', configPath: 'local_smtp.enabled' },
  {
    key: 'analytics',
    label: 'Logflare',
    configPath: 'analytics.enabled',
    note: 'Lokalda ən ağır və ən tez sınan servis. Lazım deyilsə bağlı saxla.'
  },
  { key: 'vector', label: 'Vector', configPath: 'analytics.enabled' },
  { key: 'pooler', label: 'Supavisor (pooler)', configPath: 'db.pooler.enabled' }
]

export interface ServiceGroup {
  /** keçidin yazdığı açar; `null` = məcburi servis */
  configPath: string | null
  label: string
  keys: string[]
  required: boolean
  note?: string
}

/** Eyni açarla idarə olunan servisləri bir sətirdə birləşdirir. */
export const SERVICE_GROUPS: ServiceGroup[] = (() => {
  const byPath = new Map<string, ServiceDef[]>()
  const groups: ServiceGroup[] = []
  for (const svc of SERVICES) {
    if (svc.configPath === null) {
      groups.push({
        configPath: null,
        label: svc.label,
        keys: [svc.key],
        required: true,
        note: svc.note
      })
      continue
    }
    byPath.set(svc.configPath, [...(byPath.get(svc.configPath) ?? []), svc])
  }
  for (const [configPath, defs] of byPath) {
    groups.push({
      configPath,
      label: defs.map((d) => d.label).join(' + '),
      keys: defs.map((d) => d.key),
      required: false,
      note: defs.find((d) => d.note)?.note
    })
  }
  return groups
})()

export const SERVICE_BY_KEY = new Map(SERVICES.map((s) => [s.key, s]))

export function labelFor(key: string): string {
  return SERVICE_BY_KEY.get(key)?.label ?? key
}

/**
 * `192.5MiB`, `1.2GiB`, `15.66GiB` → bayt. Docker CLI-nin `MemUsage` sütunu bu
 * formatdadır və self-hosted tərəfdə yeganə mənbədir.
 */
export function parseBytes(text: string): number | null {
  const m = /([\d.]+)\s*([KMGT]?i?B)/i.exec(text.trim())
  if (!m) return null
  const value = Number(m[1])
  if (!Number.isFinite(value)) return null
  const factor: Record<string, number> = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1000 ** 2,
    MIB: 1024 ** 2,
    GB: 1000 ** 3,
    GIB: 1024 ** 3,
    TB: 1000 ** 4,
    TIB: 1024 ** 4
  }
  return value * (factor[m[2]!.toUpperCase()] ?? 1)
}

/** `1048576` → `1.0 MiB` */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
