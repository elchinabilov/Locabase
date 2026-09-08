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
  const [envId, setEnvId] = useState<string>(project.environments[0]?.id ?? '')
  const [editing, setEditing] = useState<RemoteEnv | null | 'new'>(null)
  const env = project.environments.find((e) => e.id === envId) ?? null

  if (project.environments.length === 0) {
    return (
      <>
        <Empty
          title="Remote mühit yoxdur"
          hint={
            <div className="flex flex-col items-center gap-3">
              <p>
                Managed (supabase.com) və ya self-hosted (SSH + Docker) mühit əlavə et — sonra lokal
                ilə arasındakı fərqi bir ekranda görəcəksən.
              </p>
              <Button variant="primary" onClick={() => setEditing('new')}>
                Mühit əlavə et
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
        <h1 className="mr-2 text-[15px] font-medium">Sync / Deploy</h1>
        {project.environments.map((e) => (
          <button
            key={e.id}
            onClick={() => setEnvId(e.id)}
            className={cx(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px]',
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
          className="rounded px-1.5 text-[15px] leading-none text-muted hover:text-accent"
          title="Mühit əlavə et"
        >
          +
        </button>
        <div className="flex-1" />
        {env && <Button onClick={() => setEditing(env)}>Mühit ayarları</Button>}
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
  const [report, setReport] = useState<SyncReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const health = useQuery('envs:ping', { id: project.id, envId: env.id }, [env.id])

  const [pickedMigrations, setPickedMigrations] = useState<Set<string>>(new Set())
  const [pickedFunctions, setPickedFunctions] = useState<Set<string>>(new Set())
  const [pickedSecrets, setPickedSecrets] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  /** fərqinə baxılan funksiya */
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
            Fərqi hesabla
          </Button>
          {report && (
            <span className="text-[11.5px] text-muted">
              hesablandı: {timeAgo(report.generatedAt)}
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
                Quru rejim (dry-run)
              </Button>
              <Button variant="primary" disabled={nothing} onClick={() => setConfirming(true)}>
                Deploy et
              </Button>
            </>
          )}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        {!report && !loading && (
          <p className="px-1 py-6 text-center text-[12px] text-muted">
            «Fərqi hesabla» ilə beş ox oxunur: miqrasiyalar, sxem, funksiyalar, secret adları, auth.
          </p>
        )}

        {report && (
          <>
            <Axis
              title="Miqrasiyalar"
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
                      <span className="text-[11px] text-muted">
                        {m.name} · {m.state}
                      </span>
                    }
                  />
                ))}
              {report.migrations.items.every((m) => m.state === 'synced') && <Clean />}
            </Axis>

            <Axis title="Sxem (db diff)" dirty={report.schema.dirty} error={report.schema.error}>
              {report.schema.dirty ? (
                <pre className="max-h-56 overflow-auto px-3.5 py-2 font-mono text-[11px] whitespace-pre-wrap text-[#9fb3c6]">
                  {report.schema.items[0]?.sql.trim().slice(0, 4000)}
                </pre>
              ) : (
                <Clean text="Lokal sxem miqrasiyalarla üst-üstə düşür." />
              )}
            </Axis>

            <Axis
              title="Funksiyalar"
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
                        <span className="text-[11px] text-muted">v{f.remote.version}</span>
                      )}
                      <Badge tone={DRIFT[f.drift].tone}>{DRIFT[f.drift].label}</Badge>
                      <button
                        onClick={(e) => {
                          // <label> daxilindəyik — klik checkbox-a keçməsin
                          e.preventDefault()
                          e.stopPropagation()
                          setDiffFn(f.name)
                        }}
                        className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent-dim hover:text-accent"
                      >
                        fərqə bax
                      </button>
                    </span>
                  }
                />
              ))}
              {report.functions.items.length === 0 && <Clean text="Funksiya yoxdur." />}
            </Axis>

            <Axis
              title="Secret adları"
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
                        {s.where === 'local-only' ? 'yalnız lokal' : 'yalnız remote'}
                      </Badge>
                    }
                  />
                ))}
              {!report.secrets.dirty && <Clean text="Açar adları üst-üstə düşür." />}
            </Axis>

            <Axis title="Auth konfiqurasiyası" dirty={false} error={report.authConfig.error} />
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
  return (
    <Card
      title={env.name}
      subtitle={env.kind === 'managed' ? `managed · ${env.projectRef}` : `self-hosted · ${env.sshHost}`}
    >
      {loading && (
        <ul className="divide-y divide-line-soft" role="status" aria-label="yoxlanılır">
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
              <span className="w-[110px] shrink-0 text-[12px]">{d.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
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
  return (
    <Card
      title={title}
      actions={
        <>
          {count !== undefined && count > 0 && <Badge tone="ok">{count} seçilib</Badge>}
          <Badge tone={dirty ? 'warn' : 'muted'}>{dirty ? 'fərq var' : 'təmiz'}</Badge>
        </>
      }
    >
      {error && (
        <p className="px-3.5 py-2 text-[11.5px] leading-relaxed text-muted">{error}</p>
      )}
      {children}
    </Card>
  )
}

function Clean({ text = 'Fərq yoxdur.' }: { text?: string }): ReactNode {
  return <p className="px-3.5 py-3 text-[12px] text-muted">{text}</p>
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
        className="accent-[#3ecf8e]"
      />
      <span className="min-w-0 flex-1 truncate text-[12px]">{label}</span>
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
        setError(res.error ?? 'Uğursuz oldu')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Deploy → ${env.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Ləğv et</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={text !== project.name}
            onClick={() => void go()}
          >
            Başlat
          </Button>
        </>
      }
    >
      <ol className="mb-3 space-y-1 text-[12.5px]">
        {plan.steps.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="text-muted">•</span>
            <span>
              {s === 'backup' && 'Yedək (sxem dəyişikliyindən əvvəl, həmişə)'}
              {s === 'migrations' && `Miqrasiyalar: ${plan.migrations.join(', ')}`}
              {s === 'functions' && `Funksiyalar: ${plan.functions.join(', ')}`}
              {s === 'secrets' && `Secrets: ${plan.secrets.join(', ')}`}
              {s === 'verify' && 'Yoxlama (REST, auth, tətbiq)'}
            </span>
          </li>
        ))}
      </ol>

      {env.kind === 'managed' && plan.migrations.length > 0 && (
        <p className="mb-3 rounded-md border border-[#4a3c17] bg-[#211c10] px-3 py-2 text-[11.5px] text-warn">
          Managed mühitdə seçmə miqrasiya tətbiqi yoxdur — `supabase db push` gözləyən bütün
          miqrasiyaları sıra ilə tətbiq edir.
        </p>
      )}

      <label className="mb-1 block text-[12px] text-muted">
        Təsdiq üçün «{project.name}» yaz
      </label>
      <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus />

      {result && (
        <p className="mt-3 rounded-md border border-[#1c4635] bg-[#0f2a20] px-3 py-2 text-[12px] text-accent">
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
