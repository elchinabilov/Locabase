import { useCallback, useState, type ReactNode } from 'react'
import type { Project, RemoteEnv } from '@shared/types'
import { formatBytes } from '@shared/services'
import { call, useQuery } from '../lib/ipc'
import { Badge, Button, Card, Dot, ErrorNote, Skeleton, Toggle } from '../components/ui'

/**
 * Uzaq serverdəki konteynerlər. Managed layihədə belə bir idarəetmə yoxdur —
 * kart bunu açıq deyir və heç nə göstərmir.
 */
export function RemoteServices({
  project,
  env
}: {
  project: Project
  env: RemoteEnv
}): ReactNode {
  const services = useQuery(
    'remote:services',
    { id: project.id, envId: env.id },
    [env.id],
    { enabled: env.kind === 'self-hosted' }
  )
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = useCallback(
    async (container: string, on: boolean) => {
      setPending(container)
      setError(null)
      try {
        const res = await call('remote:setService', {
          id: project.id,
          envId: env.id,
          container,
          on
        })
        if (!res.ok) setError(res.error ?? 'Uğursuz oldu')
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setPending(null)
        services.refresh()
      }
    },
    [project.id, env.id, services]
  )

  if (env.kind === 'managed') {
    return (
      <Card title="Remote servislər">
        <p className="px-3.5 py-3 text-[11.5px] leading-relaxed text-muted">
          Managed layihədə ayrı-ayrı servisləri söndürmək mümkün deyil — supabase.com onları özü
          idarə edir və belə bir API yoxdur. RAM idarəsi yalnız self-hosted mühitlərdə var.
        </p>
      </Card>
    )
  }

  const items = services.data ?? []
  const total = items.reduce((sum, s) => sum + (s.memory ?? 0), 0)
  const running = items.filter((s) => s.state === 'running').length

  return (
    <Card
      title="Remote servislər"
      subtitle={
        items.length > 0
          ? `${running} / ${items.length} işləyir${total > 0 ? ` · ${formatBytes(total)} RAM` : ''}`
          : env.sshHost
      }
      actions={
        <Button onClick={services.refresh} loading={services.loading}>
          yenilə
        </Button>
      }
    >
      {services.loading && items.length === 0 && (
        <ul className="divide-y divide-line-soft" role="status" aria-label="serverə baxılır">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-2.5 px-3.5 py-2">
              <Skeleton w={32} h={18} delay={i * 90} className="shrink-0 rounded-full" />
              <Skeleton w={6} h={6} round delay={i * 90 + 30} />
              <Skeleton h={10} w={`${54 - (i % 3) * 12}%`} delay={i * 90 + 50} />
              <div className="flex-1" />
              <Skeleton w={50} h={10} delay={i * 90 + 80} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
      {services.error && (
        <div className="px-3.5 py-3">
          <ErrorNote>{services.error}</ErrorNote>
        </div>
      )}
      {error && (
        <div className="px-3.5 py-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <ul className="divide-y divide-line-soft">
        {items.map((svc) => {
          const isDb = svc.container === env.dbContainer
          const on = svc.state === 'running'
          return (
            <li key={svc.container} className="flex items-center gap-2.5 px-3.5 py-2">
              <Toggle
                checked={on}
                disabled={isDb || pending !== null}
                onChange={(v) => void toggle(svc.container, v)}
              />
              <Dot tone={on ? (svc.health === 'unhealthy' ? 'danger' : 'ok') : 'muted'} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                {svc.key}
                {isDb && (
                  <span className="ml-1.5">
                    <Badge tone="muted">məcburi</Badge>
                  </span>
                )}
              </span>
              <span className="w-[70px] shrink-0 text-right font-mono text-[11px] text-muted">
                {svc.memory ? formatBytes(svc.memory) : ''}
              </span>
              <span className="w-[64px] shrink-0 text-right text-[10.5px] text-muted">
                {svc.health ?? svc.state}
              </span>
            </li>
          )
        })}
      </ul>

      {items.length > 0 && (
        <p className="border-t border-line-soft px-3.5 py-2 text-[11px] leading-relaxed text-muted">
          Burada söndürmək `docker stop`-dur. Coolify növbəti deploy-da konteyneri yenidən qaldıra
          bilər — davamlı söndürmək üçün servisin compose faylından çıxar.
        </p>
      )}
    </Card>
  )
}
