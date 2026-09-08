/**
 * SQL və cədvəl ekranlarının mühit seçimi. Default **lokal**-dır və elə qalır
 * — uzaq mühit yalnız açıq seçimlə işə düşür.
 *
 * Uzaq mühitdə nəqliyyat fərqlidir (Management API / SSH+psql), ona görə bir
 * neçə imkan yoxdur. Bunu gizlətmək əvəzinə seçimin altında açıq yazılır.
 */
import type { ReactNode } from 'react'
import type { Project, RemoteEnv } from '@shared/types'
import { useQuery } from '../lib/ipc'
import { Badge, Empty, Select, Spinner } from './ui'

export function EnvPicker({
  project,
  envId,
  onChange,
  className
}: {
  project: Project
  envId: string | null
  onChange: (envId: string | null) => void
  className?: string
}): ReactNode {
  return (
    <div className={className ?? 'w-[190px]'}>
      <Select
        value={envId ?? ''}
        onChange={(v) => onChange(v || null)}
        options={[
          { value: '', label: '⌂ Lokal' },
          ...project.environments.map((e) => ({
            value: e.id,
            label: `${e.kind === 'managed' ? '☁' : '⛁'} ${e.name}`
          }))
        ]}
      />
    </div>
  )
}

export function envOf(project: Project, envId: string | null): RemoteEnv | null {
  if (!envId) return null
  return project.environments.find((e) => e.id === envId) ?? null
}

/** Uzaq mühitdə nəqliyyatın gətirdiyi məhdudiyyətlər. */
export function RemoteNote({ env }: { env: RemoteEnv }): ReactNode {
  const lines =
    env.kind === 'managed'
      ? [
          'Management API ilə işləyir: sütun tipləri yoxdur, eyniadlı sütunlar birləşir.',
          '«Yalnız oxu» Supabase-in API-si tərəfindən tətbiq olunur.'
        ]
      : [
          'SSH + psql ilə işləyir: bir nəticə bloku göstərilir, xəta mövqeyi işarələnmir.',
          '«Yalnız oxu» serverdə `begin read only` ilə tətbiq olunur.'
        ]
  return (
    <p className="border-b border-line-soft bg-[#101d2b] px-3 py-1.5 text-[11px] leading-relaxed text-info">
      <b>{env.name}</b> — {lines.join(' ')} Sorğunu ləğv etmək yalnız lokalda mümkündür.
    </p>
  )
}

/**
 * Lokal Postgres `stack:status`-a görə gözlənilir; uzaq mühitdə belə bir siqnal
 * yoxdur, ona görə orada gate açıqdır və xətalar sorğunun özündən gəlir.
 */
export function useDbGate(
  projectId: string,
  envId: string | null
): { ready: boolean; blocked: ReactNode | null } {
  const status = useQuery('stack:status', { id: projectId }, [projectId], {
    pollMs: 10_000,
    enabled: envId === null
  })
  if (envId !== null) return { ready: true, blocked: null }

  const dbUp = status.data?.services.some((s) => s.key === 'db' && s.state === 'running') ?? false
  if (dbUp) return { ready: true, blocked: null }

  if (status.loading && status.data === null) {
    return {
      ready: false,
      blocked: (
        <div className="flex h-full items-center justify-center text-[12px] text-muted">
          <Spinner /> <span className="ml-2">baza yoxlanılır…</span>
        </div>
      )
    }
  }
  return {
    ready: false,
    blocked: (
      <Empty
        title="Lokal baza işləmir"
        hint={
          <>
            Bu ekran lokal Postgres-ə birbaşa qoşulur. «Ümumi» səhifəsindən stack-i başlat — və ya
            yuxarıdakı seçimdən uzaq mühitə keç.
          </>
        }
      />
    )
  }
}

export function EnvBadge({ env }: { env: RemoteEnv | null }): ReactNode {
  if (!env) return <Badge tone="muted">lokal</Badge>
  return <Badge tone={env.kind === 'managed' ? 'info' : 'warn'}>{env.name}</Badge>
}
