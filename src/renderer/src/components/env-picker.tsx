/**
 * The environment picker for the SQL and Tables screens. The default is **local**
 * and stays that way — a remote environment only kicks in on an explicit choice.
 *
 * On a remote environment the transport is different (Management API / SSH+psql),
 * so a few capabilities are missing. Rather than hide that, it is spelled out
 * under the picker.
 */
import type { ReactNode } from 'react'
import type { Project, RemoteEnv } from '@shared/types'
import { useQuery } from '../lib/ipc'
import { useT } from '../i18n'
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
  const t = useT()
  return (
    <div className={className ?? 'w-[190px]'}>
      <Select
        value={envId ?? ''}
        onChange={(v) => onChange(v || null)}
        options={[
          { value: '', label: `⌂ ${t('envPicker.local')}` },
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

/** The limits the remote transport brings with it. */
export function RemoteNote({ env }: { env: RemoteEnv }): ReactNode {
  const t = useT()
  const lines =
    env.kind === 'managed'
      ? [t('envPicker.managedLine1'), t('envPicker.managedLine2')]
      : [t('envPicker.selfHostedLine1'), t('envPicker.selfHostedLine2')]
  return (
    <p className="border-b border-line-soft bg-info-bg px-3 py-1.5 text-[11px] leading-relaxed text-info">
      <b>{env.name}</b> — {lines.join(' ')} {t('envPicker.cancelHint')}
    </p>
  )
}

/**
 * The local Postgres is awaited through `stack:status`; a remote environment has
 * no such signal, so the gate is open there and errors come from the query itself.
 */
export function useDbGate(
  projectId: string,
  envId: string | null
): { ready: boolean; blocked: ReactNode | null } {
  const t = useT()
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
          <Spinner /> <span className="ml-2">{t('envPicker.checkingDb')}</span>
        </div>
      )
    }
  }
  return {
    ready: false,
    blocked: (
      <Empty
        title={t('envPicker.dbDownTitle')}
        hint={
          <>
            {t('envPicker.dbDownHintBefore')} «{t('app.nav.dashboard')}» {t('envPicker.dbDownHintAfter')}
          </>
        }
      />
    )
  }
}

export function EnvBadge({ env }: { env: RemoteEnv | null }): ReactNode {
  const t = useT()
  if (!env) return <Badge tone="muted">{t('envPicker.localBadge')}</Badge>
  return <Badge tone={env.kind === 'managed' ? 'info' : 'warn'}>{env.name}</Badge>
}
