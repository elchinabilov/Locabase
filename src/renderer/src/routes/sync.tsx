import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type {
  DeployStep,
  HealthReport,
  Project,
  RemoteEnv,
  SyncReport
} from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx, timeAgo } from '../lib/format'
import { useI18n, useT } from '../i18n'
import { Badge, Button, Card, Dot, Empty, ErrorNote, Input, Modal, Skeleton } from '../components/ui'
import { EnvForm } from '../components/env-form'
import { RemoteServices } from '../components/remote-services'
import { DRIFT, FunctionDiffModal } from '../components/function-diff'

export function SyncRoute({
  project,
  onChanged
}: {
  project: Project
  onChanged: () => void
}): ReactNode {
  const t = useT()
  // Derived, not seeded from props: seeding at mount left `envId` empty forever
  // when the first environment was added from the empty state below, so the
  // panel never appeared. `picked` is only what the user chose explicitly.
  const [picked, setPicked] = useState<string | null>(null)
  const [editing, setEditing] = useState<RemoteEnv | null | 'new'>(null)
  const env =
    project.environments.find((e) => e.id === picked) ?? project.environments[0] ?? null
  const envId = env?.id ?? ''

  if (project.environments.length === 0) {
    return (
      <>
        <Empty
          title={t('sync.noEnv.title')}
          hint={
            <div className="flex flex-col items-center gap-3">
              <p>{t('sync.noEnv.hint')}</p>
              <Button variant="primary" onClick={() => setEditing('new')}>
                {t('sync.addEnv')}
              </Button>
            </div>
          }
        />
        {editing && (
          <EnvForm
            project={project}
            initial={null}
            onClose={() => setEditing(null)}
            onSaved={onChanged}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h1 className="mr-2 text-h2 font-medium">{t('app.nav.sync')}</h1>
        {project.environments.map((e) => (
          <button
            key={e.id}
            onClick={() => setPicked(e.id)}
            className={cx(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-note',
              e.id === envId
                ? 'border-line bg-panel-2 text-text'
                : 'border-transparent text-muted hover:text-text'
            )}
          >
            <span
              className={cx(
                'size-1.5 rounded-full',
                e.kind === 'managed' ? 'bg-info' : 'bg-warn'
              )}
            />
            {e.name}
          </button>
        ))}
        <button
          onClick={() => setEditing('new')}
          className="rounded px-1.5 text-h2 leading-none text-muted hover:text-accent"
          title={t('sync.addEnv')}
        >
          +
        </button>
        <div className="flex-1" />
        {env && <Button onClick={() => setEditing(env)}>{t('sync.envSettings')}</Button>}
      </header>

      {env && <EnvPanel key={env.id} project={project} env={env} />}

      {editing && (
        <EnvForm
          project={project}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}

function EnvPanel({ project, env }: { project: Project; env: RemoteEnv }): ReactNode {
  const t = useT()
  const { locale } = useI18n()
  const [report, setReport] = useState<SyncReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const health = useQuery('envs:ping', { id: project.id, envId: env.id })

  const [pickedMigrations, setPickedMigrations] = useState<Set<string>>(new Set())
  const [pickedFunctions, setPickedFunctions] = useState<Set<string>>(new Set())
  const [pickedSecrets, setPickedSecrets] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  /** the function whose diff is open */
  const [diffFn, setDiffFn] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await call('sync:report', { id: project.id, envId: env.id })
      setReport(r)
      setPickedMigrations(
        new Set(r.migrations.items.filter((m) => m.state === 'pending-remote').map((m) => m.version))
      )
      setPickedFunctions(
        new Set(
          r.functions.items
            .filter((f) => f.path !== '' && (f.drift === 'local-only' || f.drift === 'changed'))
            .map((f) => f.name)
        )
      )
      setPickedSecrets(new Set())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [project.id, env.id])

  const plan = useMemo(() => {
    const steps: DeployStep[] = ['backup']
    if (pickedMigrations.size > 0) steps.push('migrations')
    if (pickedFunctions.size > 0) steps.push('functions')
    if (pickedSecrets.size > 0) steps.push('secrets')
    steps.push('verify')
    return {
      envId: env.id,
      steps,
      migrations: [...pickedMigrations].sort(),
      functions: [...pickedFunctions].sort(),
      secrets: [...pickedSecrets].sort(),
      dryRun: false
    }
  }, [env.id, pickedMigrations, pickedFunctions, pickedSecrets])

  const nothing =
    pickedMigrations.size === 0 && pickedFunctions.size === 0 && pickedSecrets.size === 0

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <Health report={health.data ?? null} loading={health.loading} error={health.error} env={env} />

        <RemoteServices project={project} env={env} />

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => void load()} loading={loading}>
            {t('sync.computeDiff')}
          </Button>
          {report && (
            <span className="text-small text-muted">
              {t('sync.computedAt', { time: timeAgo(report.generatedAt, locale) })}
            </span>
          )}
          <div className="flex-1" />
          {report && (
            <>
              <Button
                onClick={() =>
                  void call('sync:deploy', {
                    id: project.id,
                    confirm: project.name,
                    plan: { ...plan, dryRun: true }
                  })
                }
              >
                {t('sync.dryRun')}
              </Button>
              <Button variant="primary" disabled={nothing} onClick={() => setConfirming(true)}>
                {t('functions.deployNow')}
              </Button>
            </>
          )}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        {!report && !loading && (
          <p className="px-1 py-6 text-center text-note text-muted">{t('sync.beforeReport')}</p>
        )}

        {report && (
          <>
            <Axis
              title={t('app.nav.migrations')}
              dirty={report.migrations.dirty}
              error={report.migrations.error}
              count={report.migrations.items.filter((m) => m.state === 'pending-remote').length}
            >
              {report.migrations.items
                .filter((m) => m.state !== 'synced')
                .map((m) => (
                  <Pick
                    key={m.version}
                    checked={pickedMigrations.has(m.version)}
                    disabled={m.state !== 'pending-remote'}
                    onChange={(v) =>
                      setPickedMigrations((prev) => {
                        const next = new Set(prev)
                        if (v) next.add(m.version)
                        else next.delete(m.version)
                        return next
                      })
                    }
                    label={<code className="font-mono">{m.version}</code>}
                    right={
                      <span className="text-meta text-muted">
                        {m.name} · {m.state}
                      </span>
                    }
                  />
                ))}
              {report.migrations.items.every((m) => m.state === 'synced') && <Clean />}
            </Axis>

            <Axis title={t('sync.schema')} dirty={report.schema.dirty} error={report.schema.error}>
              {report.schema.dirty ? (
                <pre className="max-h-56 overflow-auto px-3.5 py-2 font-mono text-meta whitespace-pre-wrap text-text-soft">
                  {report.schema.items[0]?.sql.trim().slice(0, 4000)}
                </pre>
              ) : (
                <Clean text={t('sync.schemaClean')} />
              )}
            </Axis>

            <Axis
              title={t('app.nav.functions')}
              dirty={report.functions.dirty}
              error={report.functions.error}
              count={pickedFunctions.size}
            >
              {report.functions.items.map((f) => (
                <Pick
                  key={f.name}
                  checked={pickedFunctions.has(f.name)}
                  disabled={f.path === ''}
                  onChange={(v) =>
                    setPickedFunctions((prev) => {
                      const next = new Set(prev)
                      if (v) next.add(f.name)
                      else next.delete(f.name)
                      return next
                    })
                  }
                  label={<code className="font-mono">{f.name}</code>}
                  right={
                    <span className="flex items-center gap-2">
                      {f.remote?.version != null && (
                        <span className="text-meta text-muted">v{f.remote.version}</span>
                      )}
                      <Badge tone={DRIFT[f.drift].tone}>{t(DRIFT[f.drift].labelKey)}</Badge>
                      <button
                        onClick={(e) => {
                          // we are inside a <label> — don't let the click reach the checkbox
                          e.preventDefault()
                          e.stopPropagation()
                          setDiffFn(f.name)
                        }}
                        className="rounded border border-line px-1.5 py-0.5 text-meta text-muted hover:border-accent-dim hover:text-accent"
                      >
                        {t('sync.viewDiff')}
                      </button>
                    </span>
                  }
                />
              ))}
              {report.functions.items.length === 0 && <Clean text={t('functions.empty')} />}
            </Axis>

            <Axis
              title={t('sync.secretNames')}
              dirty={report.secrets.dirty}
              error={report.secrets.error}
              count={pickedSecrets.size}
            >
              {report.secrets.items
                .filter((s) => s.where !== 'both')
                .map((s) => (
                  <Pick
                    key={s.key}
                    checked={pickedSecrets.has(s.key)}
                    disabled={s.where === 'remote-only'}
                    onChange={(v) =>
                      setPickedSecrets((prev) => {
                        const next = new Set(prev)
                        if (v) next.add(s.key)
                        else next.delete(s.key)
                        return next
                      })
                    }
                    label={<code className="font-mono">{s.key}</code>}
                    right={
                      <Badge tone={s.where === 'local-only' ? 'info' : 'warn'}>
                        {s.where === 'local-only' ? t('sync.localOnly') : t('functions.remoteOnly')}
                      </Badge>
                    }
                  />
                ))}
              {!report.secrets.dirty && <Clean text={t('sync.secretsClean')} />}
            </Axis>

            <Axis title={t('sync.authConfig')} dirty={false} error={report.authConfig.error} />
          </>
        )}
      </div>

      {diffFn && (
        <FunctionDiffModal
          projectId={project.id}
          envId={env.id}
          name={diffFn}
          onClose={() => setDiffFn(null)}
        />
      )}

      {confirming && (
        <DeployModal
          project={project}
          env={env}
          plan={plan}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function Health({
  report,
  loading,
  error,
  env
}: {
  report: HealthReport | null
  loading: boolean
  error: string | null
  env: RemoteEnv
}): ReactNode {
  const t = useT()
  return (
    <Card
      title={env.name}
      subtitle={env.kind === 'managed' ? `managed · ${env.projectRef}` : `self-hosted · ${env.sshHost}`}
    >
      {loading && (
        <ul className="divide-y divide-line-soft" role="status" aria-label={t('common.checking')}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-2.5 px-3.5 py-2">
              <Skeleton w={6} h={6} round delay={i * 90} />
              <Skeleton w={110} h={10} delay={i * 90} className="shrink-0" />
              <Skeleton h={9} w={`${52 - (i % 3) * 10}%`} delay={i * 90 + 50} />
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="px-3.5 py-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {report && (
        <ul className="divide-y divide-line-soft">
          {report.details.map((d) => (
            <li key={d.label} className="flex items-center gap-2.5 px-3.5 py-1.5">
              <Dot tone={d.ok ? 'ok' : 'danger'} />
              <span className="w-[110px] shrink-0 text-note">{d.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-meta text-muted">
                {d.info}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Axis({
  title,
  dirty,
  error,
  count,
  children
}: {
  title: string
  dirty: boolean
  error: string | null
  count?: number
  children?: ReactNode
}): ReactNode {
  const t = useT()
  return (
    <Card
      title={title}
      actions={
        <>
          {count !== undefined && count > 0 && (
            <Badge tone="ok">{t('sync.selectedCount', { count })}</Badge>
          )}
          <Badge tone={dirty ? 'warn' : 'muted'}>
            {dirty ? t('sync.hasDiff') : t('sync.cleanAxis')}
          </Badge>
        </>
      }
    >
      {error && (
        <p className="px-3.5 py-2 text-small leading-relaxed text-muted">{error}</p>
      )}
      {children}
    </Card>
  )
}

function Clean({ text }: { text?: string }): ReactNode {
  const t = useT()
  return <p className="px-3.5 py-3 text-note text-muted">{text ?? t('diffView.noDiff')}</p>
}

function Pick({
  checked,
  disabled,
  onChange,
  label,
  right
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  right: ReactNode
}): ReactNode {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-center gap-2.5 border-t border-line-soft px-3.5 py-1.5 first:border-t-0',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      <span className="min-w-0 flex-1 truncate text-note">{label}</span>
      {right}
    </label>
  )
}

function DeployModal({
  project,
  env,
  plan,
  onClose,
  onDone
}: {
  project: Project
  env: RemoteEnv
  plan: {
    envId: string
    steps: DeployStep[]
    migrations: string[]
    functions: string[]
    secrets: string[]
    dryRun: boolean
  }
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const t = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const go = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await call('sync:deploy', { id: project.id, plan, confirm: text })
      if (res.ok) {
        setResult(res.output)
        setTimeout(onDone, 1200)
      } else {
        setError(res.error ?? t('dashboard.reset.genericError'))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('sync.deployTitle', { name: env.name })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={text !== project.name}
            onClick={() => void go()}
          >
            {t('sync.start')}
          </Button>
        </>
      }
    >
      <ol className="mb-3 space-y-1 text-ui">
        {plan.steps.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="text-muted">•</span>
            <span>
              {s === 'backup' && t('sync.step.backup')}
              {s === 'migrations' && t('sync.step.migrations', { list: plan.migrations.join(', ') })}
              {s === 'functions' && t('sync.step.functions', { list: plan.functions.join(', ') })}
              {s === 'secrets' && t('sync.step.secrets', { list: plan.secrets.join(', ') })}
              {s === 'verify' && t('sync.step.verify')}
            </span>
          </li>
        ))}
      </ol>

      {env.kind === 'managed' && plan.migrations.length > 0 && (
        <p className="mb-3 rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-small text-warn">
          {t('sync.managedMigrationWarning')}
        </p>
      )}

      <label className="mb-1 block text-note text-muted">
        {t('dashboard.reset.confirmLabel', { name: project.name })}
      </label>
      <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus />

      {result && (
        <p className="mt-3 rounded-md border border-accent-border bg-accent-bg px-3 py-2 text-note text-accent">
          {result}
        </p>
      )}
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  )
}
