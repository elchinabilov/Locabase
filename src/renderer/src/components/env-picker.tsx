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
import { useStackStatus } from '../lib/stack-status'
import { useT } from '../i18n'
import { Empty, Select, Spinner } from './ui'

/**
 * The environment list as `<Select>` options, with the local stack first.
 *
 * Five screens built this inline, and they had drifted into three different icon
 * conventions for the same three things — `⌂/☁/⛁` here, a bare `↔` on
 * Migrations and Functions. One list, one set of icons.
 */
export function envOptions(
  project: Project,
  localLabel: string
): Array<{ value: string; label: string }> {
  return [
    { value: '', label: `⌂ ${localLabel}` },
    ...project.environments.map((e) => ({
      value: e.id,
      label: `${e.kind === 'managed' ? '☁' : '⛁'} ${e.name}`
    }))
  ]
}

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
        options={envOptions(project, t('envPicker.local'))}
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
    <p className="border-b border-line-soft bg-info-bg px-3 py-1.5 text-meta leading-relaxed text-info">
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
  // Subscribing unconditionally keeps the hook order fixed; the shared poller
  // already collapses this into the one request the screen behind it makes.
  const status = useStackStatus(projectId)
  if (envId !== null) return { ready: true, blocked: null }

  const dbUp = status.data?.services.some((s) => s.key === 'db' && s.state === 'running') ?? false
  if (dbUp) return { ready: true, blocked: null }

  if (status.loading && status.data === null) {
    return {
      ready: false,
      blocked: (
        <div className="flex h-full items-center justify-center text-note text-muted">
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
            {t('envPicker.dbDownHintBefore')} «{t('app.nav.dashboard')}»{' '}
            {t('envPicker.dbDownHintAfter')}
          </>
        }
      />
    )
  }
}
