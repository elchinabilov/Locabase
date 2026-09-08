import { useCallback, useState, type ReactNode } from 'react'
import type { FieldValue, Project, ServiceStatus, StackStatus } from '@shared/types'
import { formatBytes, SERVICE_GROUPS } from '@shared/services'
import { call, useQuery } from '../lib/ipc'
import { cx, timeAgo } from '../lib/format'
import { Badge, Button, Card, Dot, Empty, ErrorNote, Input, Modal, Row, Skeleton, Toggle } from '../components/ui'
import type { RouteId } from '../app'

export function Dashboard({
  project,
  onChanged,
  onOpen,
  onNew,
  onRoute
}: {
  project: Project | null
  onChanged: () => void
  onOpen: () => void
  onNew: () => void
  onRoute: (r: RouteId) => void
}): ReactNode {
  if (!project) {
    return (
      <Empty
        title="Layihə əlavə edilməyib"
        hint={
          <div className="flex flex-col items-center gap-3">
            <p>
              Boş qovluqda sıfırdan yeni layihə qur, ya da içində{' '}
              <code className="text-accent">supabase/config.toml</code> olan repo-nu aç. Mövcud
              layihədə tool heç nə kopyalamır — bütün fayllar olduğu yerdə qalır.
            </p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={onNew}>
                Yeni layihə
              </Button>
              <Button onClick={onOpen}>Mövcud layihəni aç</Button>
            </div>
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
  const status = useQuery('stack:status', { id: project.id, withStats: true }, [project.id], {
    pollMs: 8000
  })
  const config = useQuery('config:read', { id: project.id }, [project.id])
  const conflicts = useQuery('ports:conflicts', undefined, [], { pollMs: 30000 })
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [needsRestart, setNeedsRestart] = useState(false)

  const act = useCallback(
    async (kind: 'start' | 'stop' | 'restart') => {
      setBusy(kind)
      try {
        const channel = (
          { start: 'stack:start', stop: 'stack:stop', restart: 'stack:restart' } as const
        )[kind]
        await call(channel, { id: project.id })
        setNeedsRestart(false)
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

      {needsRestart && (
        <div className="flex items-center gap-3 rounded-md border border-[#4a3c17] bg-[#211c10] px-3.5 py-2 text-[12px] text-warn">
          Servis keçidi `config.toml`-a yazıldı. Konteynerlər yalnız restartdan sonra dəyişəcək.
          <Button onClick={() => void act('restart')} loading={busy === 'restart'}>
            İndi restart et
          </Button>
          <button onClick={() => setNeedsRestart(false)} className="text-muted hover:text-text">
            sonra
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Services
          status={s}
          loading={status.loading && status.data === null}
          projectId={project.id}
          configValues={config.data?.values}
          onToggled={() => {
            setNeedsRestart(true)
            config.refresh()
          }}
        />
        <div className="flex flex-col gap-3">
          <QuickLinks
            vars={s?.vars ?? {}}
            running={running}
            loading={status.loading && status.data === null}
          />
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

/**
 * Servis siyahısı: hər sətir bir `config.toml` açarına bağlıdır. Söndürmək
 * konteyneri dayandırmır — CLI-yə onu ümumiyyətlə qaldırmamağı deyir, ona görə
 * dəyişiklik restartdan sonra qüvvəyə minir.
 */
function Services({
  status,
  loading,
  projectId,
  configValues,
  onToggled
}: {
  status: StackStatus | null
  /** İlk `stack:status` hələ gəlməyib — hər sətir «dayanıb» görünməsin. */
  loading?: boolean
  projectId: string
  configValues: Record<string, FieldValue> | undefined
  onToggled: () => void
}): ReactNode {
  const [tailing, setTailing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const services = status?.services ?? []
  const byKey = new Map(services.map((s) => [s.key, s]))

  const toggleTail = useCallback(
    async (container: string) => {
      const on = tailing !== container
      if (tailing) await call('stack:tailLogs', { id: projectId, container: tailing, on: false })
      if (on) await call('stack:tailLogs', { id: projectId, container, on: true })
      setTailing(on ? container : null)
    },
    [projectId, tailing]
  )

  const setGroup = useCallback(
    async (configPath: string, on: boolean) => {
      setSaving(configPath)
      setError(null)
      try {
        await call('stack:setService', { id: projectId, configPath, on })
        onToggled()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setSaving(null)
      }
    },
    [projectId, onToggled]
  )

  const total = services.reduce((sum, s) => sum + (s.memory ?? 0), 0)

  // Sətirlər `SERVICE_GROUPS`-dur, konteynerlər yox: Kong+PostgREST kimi
  // qruplarda bir sətrin arxasında iki konteyner dayanır. Başlıqdakı say da
  // gözlə görünən sətirləri saysın deyə eyni siyahıdan gəlir.
  const rows = SERVICE_GROUPS.map((group) => {
    const members = group.keys.map((k) => byKey.get(k)).filter(Boolean) as ServiceStatus[]
    const live = members.filter((m) => m.state === 'running')
    // Həqiqət mənbəyi `config.toml`-dur; açar faylda yoxdursa konteynerin
    // işləyib-işləməməsinə baxırıq (CLI default-u onda qüvvədədir).
    const fv = group.configPath ? configValues?.[group.configPath] : undefined
    const enabled =
      group.configPath === null ? true : fv?.present ? fv.value === true : live.length > 0
    const mem = members.reduce((sum, m) => sum + (m.memory ?? 0), 0)
    const isRunning = live.length > 0
    // Konfiqurasiya «açıq» deyir, amma konteyner qalxmayıb: stack köhnə
    // konfiqurasiya ilə işləyir — keçid yaşıl yox, sarı görünməlidir.
    const pending = enabled && !isRunning && (status?.running ?? false)
    const tone: 'ok' | 'warn' | 'danger' | 'muted' = !isRunning
      ? pending
        ? 'warn'
        : 'muted'
      : members.some((m) => m.health === 'unhealthy')
        ? 'danger'
        : members.some((m) => m.health === 'starting')
          ? 'warn'
          : 'ok'
    const statusText = !enabled
      ? 'söndürülüb'
      : isRunning
        ? (members[0]?.health ?? 'running')
        : pending
          ? 'restart lazım'
          : 'dayanıb'
    return { group, members, enabled, mem, isRunning, pending, tone, statusText }
  })

  // Məxrəc — siyahıdakı bütün sətirlər (söndürülmüşlər də daxil), sol tərəf isə
  // hazırda işləyənlər. İkisi də eyni vahiddədir: sətir, konteyner yox.
  const running = rows.filter((r) => r.isRunning).length

  if (loading) {
    return (
      <Card title="Servislər" subtitle="docker yoxlanılır…">
        <ul className="divide-y divide-line-soft" role="status" aria-label="yüklənir">
          {SERVICE_GROUPS.map((group, i) => (
            <li key={group.label} className="flex items-center gap-2.5 px-3.5 py-2">
              <Skeleton w={32} h={18} delay={i * 70} className="shrink-0 rounded-full" />
              <Skeleton w={6} h={6} round delay={i * 70 + 30} />
              <Skeleton h={10} w={`${58 - (i % 4) * 10}%`} delay={i * 70 + 50} />
              <div className="flex-1" />
              <Skeleton w={46} h={9} delay={i * 70 + 80} className="shrink-0" />
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  return (
    <Card
      title="Servislər"
      subtitle={`${running} / ${rows.length} işləyir${total > 0 ? ` · ${formatBytes(total)} RAM` : ''}`}
    >
      {error && (
        <div className="px-3.5 pt-2.5">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <ul className="divide-y divide-line-soft">
        {rows.map(({ group, members, enabled, mem, pending, tone, statusText }) => {
          const open = expanded === group.label

          return (
            <li key={group.label}>
              <div className="flex items-center gap-2.5 px-3.5 py-2">
                <Toggle
                  checked={enabled}
                  tone={pending ? 'pending' : 'accent'}
                  disabled={group.required || saving !== null}
                  onChange={(v) => group.configPath && void setGroup(group.configPath, v)}
                />
                <Dot tone={tone} />
                <button
                  onClick={() => setExpanded(open ? null : group.label)}
                  disabled={members.length < 2}
                  className="min-w-0 flex-1 truncate text-left text-[12.5px] disabled:cursor-default"
                  title={group.note}
                >
                  {group.label}
                  {members.length > 1 && (
                    <span className="ml-1.5 text-[10px] text-muted">{open ? '▾' : '▸'}</span>
                  )}
                </button>
                <span className="w-[68px] shrink-0 text-right font-mono text-[11px] text-muted">
                  {mem > 0 ? formatBytes(mem) : ''}
                </span>
                <span
                  className={cx(
                    'w-[74px] shrink-0 text-right text-[10.5px]',
                    pending ? 'text-warn' : 'text-muted'
                  )}
                >
                  {statusText}
                </span>
                {members.length === 1 && members[0] && (
                  <LogButton
                    active={tailing === members[0].container}
                    onClick={() => void toggleTail(members[0]!.container)}
                  />
                )}
                {members.length !== 1 && <span className="w-[26px] shrink-0" />}
              </div>

              {open &&
                members.map((m) => (
                  <div
                    key={m.container}
                    className="flex items-center gap-2.5 border-t border-line-soft bg-[#0d141b] py-1.5 pr-3.5 pl-[52px]"
                  >
                    <Dot tone={m.state === 'running' ? 'ok' : 'muted'} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                      {m.container}
                    </span>
                    <span className="w-[68px] shrink-0 text-right font-mono text-[11px] text-muted">
                      {m.memory ? formatBytes(m.memory) : ''}
                    </span>
                    <LogButton
                      active={tailing === m.container}
                      onClick={() => void toggleTail(m.container)}
                    />
                  </div>
                ))}
            </li>
          )
        })}
      </ul>
      {services.length === 0 && (
        <p className="px-3.5 py-3 text-center text-[11.5px] text-muted">
          Konteyner yoxdur — keçidlər `config.toml`-u göstərir, stack qalxanda vəziyyət də gələcək.
        </p>
      )}
    </Card>
  )
}

function LogButton({ active, onClick }: { active: boolean; onClick: () => void }): ReactNode {
  return (
    <button
      onClick={onClick}
      className={cx(
        'w-[26px] shrink-0 rounded px-1 py-0.5 text-[10.5px]',
        active ? 'bg-accent-dim text-accent' : 'text-muted hover:bg-panel-2 hover:text-text'
      )}
    >
      log
    </button>
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
  running,
  loading
}: {
  vars: Record<string, string>
  running: boolean
  loading?: boolean
}): ReactNode {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = useCallback((key: string, value: string) => {
    void navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }, [])

  return (
    <Card title="Sürətli linklər">
      {loading ? (
        <ul className="divide-y divide-line-soft" role="status" aria-label="yüklənir">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-2 px-3.5 py-2">
              <Skeleton w={104} h={10} delay={i * 80} className="shrink-0" />
              <Skeleton h={9} w={`${64 - (i % 3) * 12}%`} delay={i * 80 + 40} />
            </li>
          ))}
        </ul>
      ) : !running ? (
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
