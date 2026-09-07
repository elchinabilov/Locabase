import { useCallback, useState, type ReactNode } from 'react'
import type { Project, StackStatus } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx, timeAgo } from '../lib/format'
import { Badge, Button, Card, Dot, Empty, ErrorNote, Input, Modal, Row } from '../components/ui'
import type { RouteId } from '../app'

/** Konteyner adından oxunaqlı servis adı. */
const SERVICE_LABEL: Record<string, string> = {
  db: 'Postgres',
  kong: 'Kong (API gateway)',
  auth: 'GoTrue (auth)',
  rest: 'PostgREST',
  realtime: 'Realtime',
  storage: 'Storage',
  imgproxy: 'Imgproxy',
  studio: 'Studio',
  studio_next: 'Studio',
  pg_meta: 'pg-meta',
  edge_runtime: 'Edge runtime',
  inbucket: 'Mailpit',
  analytics: 'Logflare',
  vector: 'Vector',
  pooler: 'Supavisor'
}

export function Dashboard({
  project,
  onChanged,
  onAdd,
  onRoute
}: {
  project: Project | null
  onChanged: () => void
  onAdd: () => void
  onRoute: (r: RouteId) => void
}): ReactNode {
  if (!project) {
    return (
      <Empty
        title="Layihə əlavə edilməyib"
        hint={
          <div className="flex flex-col items-center gap-3">
            <p>
              İçində <code className="text-accent">supabase/config.toml</code> olan bir repo seç.
              Tool heç nə kopyalamır — bütün fayllar olduğu yerdə qalır.
            </p>
            <Button variant="primary" onClick={onAdd}>
              Layihə əlavə et
            </Button>
          </div>
        }
      />
    )
  }
  return <ProjectView key={project.id} project={project} onChanged={onChanged} onRoute={onRoute} />
}

function ProjectView({
  project,
  onChanged,
  onRoute
}: {
  project: Project
  onChanged: () => void
  onRoute: (r: RouteId) => void
}): ReactNode {
  const status = useQuery('stack:status', { id: project.id }, [project.id], { pollMs: 6000 })
  const conflicts = useQuery('ports:conflicts', undefined, [], { pollMs: 30000 })
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const act = useCallback(
    async (kind: 'start' | 'stop' | 'restart') => {
      setBusy(kind)
      try {
        const channel = (
          { start: 'stack:start', stop: 'stack:stop', restart: 'stack:restart' } as const
        )[kind]
        await call(channel, { id: project.id })
      } finally {
        setBusy(null)
        status.refresh()
      }
    },
    [project.id, status]
  )

  const s: StackStatus | null = status.data
  const running = s?.running ?? false
  const mine = (conflicts.data ?? []).filter((c) =>
    c.holders.some((h) => h.projectId === project.id)
  )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[17px] font-medium">{project.name}</h1>
            <Badge tone={running ? 'ok' : 'muted'}>{running ? 'işləyir' : 'dayanıb'}</Badge>
            <Badge tone="muted">{project.projectId}</Badge>
          </div>
          <p className="mt-1 truncate font-mono text-[11.5px] text-muted">{project.path}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {running ? (
            <>
              <Button onClick={() => void act('restart')} loading={busy === 'restart'}>
                Restart
              </Button>
              <Button onClick={() => void act('stop')} loading={busy === 'stop'}>
                Dayandır
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => void act('start')} loading={busy === 'start'}>
              Başlat
            </Button>
          )}
          <Button variant="danger" onClick={() => setConfirmReset(true)} disabled={!running}>
            db reset
          </Button>
        </div>
      </header>

      {status.error && <ErrorNote>{status.error}</ErrorNote>}
      {s?.error && !status.error && <ErrorNote>{s.error}</ErrorNote>}

      {mine.length > 0 && (
        <div className="rounded-md border border-[#4a3c17] bg-[#211c10] px-3 py-2 text-[12px] text-warn">
          Port toqquşması:{' '}
          {mine.map((c) => c.port).join(', ')} — eyni port bir neçə layihədə yazılıb. Konfiqurasiya
          ekranından portları başqa 100-lük aralığa keçir.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Services status={s} projectId={project.id} />
        <div className="flex flex-col gap-3">
          <QuickLinks vars={s?.vars ?? {}} running={running} />
          <Environments project={project} onRoute={onRoute} onChanged={onChanged} />
        </div>
      </div>

      {s && (
        <p className="px-1 text-[11px] text-muted">Sonuncu yoxlama: {timeAgo(s.checkedAt)}</p>
      )}

      {confirmReset && (
        <ResetModal project={project} onClose={() => setConfirmReset(false)} onDone={status.refresh} />
      )}
    </div>
  )
}

function Services({
  status,
  projectId
}: {
  status: StackStatus | null
  projectId: string
}): ReactNode {
  const [tailing, setTailing] = useState<string | null>(null)
  const services = status?.services ?? []

  const toggleTail = useCallback(
    async (container: string) => {
      const on = tailing !== container
      if (tailing) await call('stack:tailLogs', { id: projectId, container: tailing, on: false })
      if (on) await call('stack:tailLogs', { id: projectId, container, on: true })
      setTailing(on ? container : null)
    },
    [projectId, tailing]
  )

  return (
    <Card
      title="Servislər"
      subtitle={`${services.filter((x) => x.state === 'running').length} / ${services.length} işləyir`}
    >
      {services.length === 0 ? (
        <p className="px-3.5 py-6 text-center text-[12px] text-muted">
          Konteyner tapılmadı — stack dayanıb.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {services.map((svc) => {
            const tone =
              svc.state !== 'running'
                ? 'muted'
                : svc.health === 'unhealthy'
                  ? 'danger'
                  : svc.health === 'starting'
                    ? 'warn'
                    : 'ok'
            return (
              <li key={svc.container} className="flex items-center gap-2.5 px-3.5 py-2">
                <Dot tone={tone} />
                <span className="flex-1 truncate text-[12.5px]">
                  {SERVICE_LABEL[svc.key] ?? svc.key}
                </span>
                <span className="text-[11px] text-muted">{svc.health ?? svc.state}</span>
                <button
                  onClick={() => void toggleTail(svc.container)}
                  className={cx(
                    'rounded px-1.5 py-0.5 text-[10.5px]',
                    tailing === svc.container
                      ? 'bg-accent-dim text-accent'
                      : 'text-muted hover:bg-panel-2 hover:text-text'
                  )}
                >
                  log
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

const LINKS: Array<{ key: string; label: string; open: boolean }> = [
  { key: 'STUDIO_URL', label: 'Studio', open: true },
  { key: 'MAILPIT_URL', label: 'Mailpit', open: true },
  { key: 'API_URL', label: 'API', open: false },
  { key: 'GRAPHQL_URL', label: 'GraphQL', open: false },
  { key: 'DB_URL', label: 'Postgres', open: false },
  { key: 'ANON_KEY', label: 'anon key', open: false },
  { key: 'SERVICE_ROLE_KEY', label: 'service_role key', open: false }
]

function QuickLinks({
  vars,
  running
}: {
  vars: Record<string, string>
  running: boolean
}): ReactNode {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = useCallback((key: string, value: string) => {
    void navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }, [])

  return (
    <Card title="Sürətli linklər">
      {!running ? (
        <p className="px-3.5 py-6 text-center text-[12px] text-muted">
          Stack qalxanda ünvanlar burada görünür.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {LINKS.filter((l) => vars[l.key]).map((l) => (
            <li key={l.key} className="flex items-center gap-2 px-3.5 py-1.5">
              <span className="w-[104px] shrink-0 text-[12px] text-muted">{l.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#9fb3c6]">
                {l.key.endsWith('KEY') ? `${vars[l.key]!.slice(0, 18)}…` : vars[l.key]}
              </span>
              <button
                onClick={() => copy(l.key, vars[l.key]!)}
                className="text-[10.5px] text-muted hover:text-accent"
              >
                {copied === l.key ? '✓' : 'kopyala'}
              </button>
              {l.open && (
                <button
                  onClick={() => void call('stack:openUrl', { url: vars[l.key]! })}
                  className="text-[10.5px] text-muted hover:text-accent"
                >
                  aç
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Environments({
  project,
  onRoute
}: {
  project: Project
  onRoute: (r: RouteId) => void
  onChanged: () => void
}): ReactNode {
  return (
    <Card
      title="Remote mühitlər"
      actions={
        <Button onClick={() => onRoute('sync')}>
          {project.environments.length === 0 ? 'Əlavə et' : 'Sync'}
        </Button>
      }
    >
      {project.environments.length === 0 ? (
        <p className="px-3.5 py-4 text-[11.5px] leading-relaxed text-muted">
          Mühit yoxdur. Managed (supabase.com) və ya self-hosted (SSH) mühit əlavə edib lokal ilə
          fərqi görə bilərsən.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {project.environments.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-3.5 py-2">
              <Badge tone={e.kind === 'managed' ? 'info' : 'warn'}>
                {e.kind === 'managed' ? 'managed' : 'self-hosted'}
              </Badge>
              <span className="flex-1 truncate text-[12.5px]">{e.name}</span>
              <span className="truncate font-mono text-[10.5px] text-muted">
                {e.kind === 'managed' ? e.projectRef : e.sshHost}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ResetModal({
  project,
  onClose,
  onDone
}: {
  project: Project
  onClose: () => void
  onDone: () => void
}): ReactNode {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await call('stack:reset', { id: project.id, confirm: text })
      if (!res.ok) setError(res.error ?? 'Uğursuz oldu')
      else onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      onDone()
    }
  }, [project.id, text, onClose, onDone])

  return (
    <Modal
      title="db reset"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Ləğv et</Button>
          <Button
            variant="danger"
            onClick={() => void go()}
            loading={busy}
            disabled={text !== project.name}
          >
            Bazanı sıfırla
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12.5px] leading-relaxed">
        Lokal baza tamamilə silinir və bütün miqrasiyalar boş bazaya yenidən tətbiq olunur. Seed
        faylı da işə düşür. <span className="text-danger">Lokal data itir.</span>
      </p>
      <Row label={`Təsdiq üçün «${project.name}» yaz`}>
        <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </Row>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  )
}
