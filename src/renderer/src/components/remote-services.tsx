import { useCallback, type ReactNode } from 'react'
import type { Project, RemoteEnv } from '@shared/types'
import { formatBytes } from '@shared/services'
import { call, useQuery } from '../lib/ipc'
import { useAction } from '../lib/use-action'
import { useT } from '../i18n'
import { Badge, Button, Card, Dot, ErrorNote, Skeleton, Toggle } from '../components/ui'

/**
 * Containers on the remote server. A managed project has no such control —
 * the card says so plainly and shows nothing.
 */
export function RemoteServices({ project, env }: { project: Project; env: RemoteEnv }): ReactNode {
  const t = useT()
  const services = useQuery(
    'remote:services',
    { id: project.id, envId: env.id },
    { enabled: env.kind === 'self-hosted' }
  )
  const { run, runningLabel: pending, error } = useAction()

  const toggle = useCallback(
    async (container: string, on: boolean) => {
      await run(async () => {
        const res = await call('remote:setService', {
          id: project.id,
          envId: env.id,
          container,
          on
        })
        // The handler reports a refusal in the result rather than throwing.
        if (!res.ok) throw new Error(res.error ?? t('dashboard.reset.genericError'))
        return res
      }, container)
      services.refresh()
    },
    [project.id, env.id, services, t, run]
  )

  if (env.kind === 'managed') {
    return (
      <Card title={t('remoteServices.title')}>
        <p className="px-3.5 py-3 text-small leading-relaxed text-muted">
          {t('remoteServices.managedHint')}
        </p>
      </Card>
    )
  }

  const items = services.data ?? []
  const total = items.reduce((sum, s) => sum + (s.memory ?? 0), 0)
  const running = items.filter((s) => s.state === 'running').length

  return (
    <Card
      title={t('remoteServices.title')}
      subtitle={
        items.length > 0
          ? t('dashboard.services.subtitle', { running, total: items.length }) +
            (total > 0 ? t('dashboard.services.ramSuffix', { size: formatBytes(total) }) : '')
          : env.sshHost
      }
      actions={
        <Button onClick={services.refresh} loading={services.loading}>
          {t('remoteServices.refresh')}
        </Button>
      }
    >
      {services.loading && items.length === 0 && (
        <ul
          className="divide-y divide-line-soft"
          role="status"
          aria-label={t('remoteServices.checkingServer')}
        >
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
              <span className="min-w-0 flex-1 truncate text-ui">
                {svc.key}
                {isDb && (
                  <span className="ml-1.5">
                    <Badge tone="muted">{t('remoteServices.required')}</Badge>
                  </span>
                )}
              </span>
              <span className="w-[70px] shrink-0 text-right font-mono text-meta text-muted">
                {svc.memory ? formatBytes(svc.memory) : ''}
              </span>
              <span className="w-[64px] shrink-0 text-right text-badge text-muted">
                {svc.health ?? svc.state}
              </span>
            </li>
          )
        })}
      </ul>

      {items.length > 0 && (
        <p className="border-t border-line-soft px-3.5 py-2 text-meta leading-relaxed text-muted">
          {t('remoteServices.stopHint')}
        </p>
      )}
    </Card>
  )
}
