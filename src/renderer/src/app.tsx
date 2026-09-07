import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { call, useQuery } from './lib/ipc'
import { cx, shortPath } from './lib/format'
import { Badge, Button, Dot, Empty, ErrorNote, Spinner } from './components/ui'
import { LogDrawer } from './components/log-drawer'
import { Dashboard } from './routes/dashboard'
import { ConfigRoute } from './routes/config'
import { AuthRoute } from './routes/auth'
import { SecretsRoute } from './routes/secrets'
import { MigrationsRoute } from './routes/migrations'
import { FunctionsRoute } from './routes/functions'
import { SyncRoute } from './routes/sync'
import { SettingsRoute } from './routes/settings'

export type RouteId =
  | 'dashboard'
  | 'config'
  | 'auth'
  | 'secrets'
  | 'migrations'
  | 'functions'
  | 'sync'
  | 'settings'

const NAV: Array<{ id: RouteId; label: string; icon: string; needsProject: boolean }> = [
  { id: 'dashboard', label: 'Ümumi', icon: '▣', needsProject: false },
  { id: 'config', label: 'Konfiqurasiya', icon: '⚙', needsProject: true },
  { id: 'auth', label: 'Auth', icon: '⚿', needsProject: true },
  { id: 'secrets', label: 'Secrets', icon: '✱', needsProject: true },
  { id: 'migrations', label: 'Miqrasiyalar', icon: '⇅', needsProject: true },
  { id: 'functions', label: 'Funksiyalar', icon: 'ƒ', needsProject: true },
  { id: 'sync', label: 'Sync / Deploy', icon: '⇈', needsProject: true },
  { id: 'settings', label: 'Ayarlar', icon: '⋯', needsProject: false }
]

export function App(): ReactNode {
  const projects = useQuery('projects:list', undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [route, setRoute] = useState<RouteId>('dashboard')
  const [logOpen, setLogOpen] = useState(false)

  const list = projects.data ?? []
  const selected = useMemo(
    () => list.find((p) => p.id === selectedId) ?? null,
    [list, selectedId]
  )

  useEffect(() => {
    if (!selectedId && list.length > 0) setSelectedId(list[0]!.id)
    if (selectedId && !list.some((p) => p.id === selectedId)) setSelectedId(list[0]?.id ?? null)
  }, [list, selectedId])

  const addProject = useCallback(async () => {
    const path = await call('projects:pickFolder')
    if (!path) return
    const project = await call('projects:add', { path })
    projects.refresh()
    setSelectedId(project.id)
  }, [projects])

  return (
    <div className="flex h-full flex-col">
      <div className="drag h-8 shrink-0 border-b border-line bg-panel" />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={list}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addProject}
          route={route}
          onRoute={setRoute}
          loading={projects.loading}
          error={projects.error}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <Content
              route={route}
              project={selected}
              onProjectsChanged={projects.refresh}
              onAdd={addProject}
              onRoute={setRoute}
            />
          </div>
          <LogDrawer open={logOpen} onToggle={() => setLogOpen((v) => !v)} />
        </main>
      </div>
    </div>
  )
}

function Content({
  route,
  project,
  onProjectsChanged,
  onAdd,
  onRoute
}: {
  route: RouteId
  project: Project | null
  onProjectsChanged: () => void
  onAdd: () => void
  onRoute: (r: RouteId) => void
}): ReactNode {
  if (route === 'settings') return <SettingsRoute />
  if (route === 'dashboard') {
    return (
      <Dashboard project={project} onChanged={onProjectsChanged} onAdd={onAdd} onRoute={onRoute} />
    )
  }
  if (!project) {
    return <Empty title="Əvvəlcə layihə seç" hint="Sol tərəfdən layihə əlavə et." />
  }
  switch (route) {
    case 'config':
      return <ConfigRoute project={project} />
    case 'auth':
      return <AuthRoute project={project} />
    case 'secrets':
      return <SecretsRoute project={project} />
    case 'migrations':
      return <MigrationsRoute project={project} />
    case 'functions':
      return <FunctionsRoute project={project} />
    case 'sync':
      return <SyncRoute project={project} onChanged={onProjectsChanged} />
    default:
      return null
  }
}

function Sidebar({
  projects,
  selectedId,
  onSelect,
  onAdd,
  route,
  onRoute,
  loading,
  error
}: {
  projects: Project[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  route: RouteId
  onRoute: (r: RouteId) => void
  loading: boolean
  error: string | null
}): ReactNode {
  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-[10.5px] font-semibold tracking-[0.09em] text-muted uppercase">
          Layihələr
        </span>
        <button
          onClick={onAdd}
          title="Layihə əlavə et"
          className="rounded px-1.5 text-[15px] leading-none text-muted hover:bg-panel-2 hover:text-accent"
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {loading && (
          <div className="px-2 py-3 text-[12px] text-muted">
            <Spinner /> yüklənir…
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {!loading && projects.length === 0 && (
          <p className="px-2 py-3 text-[11.5px] leading-relaxed text-muted">
            Hələ layihə yoxdur. <span className="text-accent">+</span> ilə `supabase/` qovluğu olan
            bir repo seç.
          </p>
        )}
        {projects.map((p) => (
          <ProjectItem
            key={p.id}
            project={p}
            active={p.id === selectedId}
            onClick={() => onSelect(p.id)}
          />
        ))}
      </div>

      <nav className="border-t border-line-soft p-2">
        {NAV.map((item) => {
          const disabled = item.needsProject && !selectedId
          return (
            <button
              key={item.id}
              disabled={disabled}
              onClick={() => onRoute(item.id)}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
                route === item.id
                  ? 'bg-panel-2 text-text'
                  : 'text-muted hover:bg-panel-2 hover:text-text',
                disabled && 'cursor-not-allowed opacity-35 hover:bg-transparent'
              )}
            >
              <span className="w-3.5 text-center text-[12px] opacity-80">{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

function ProjectItem({
  project,
  active,
  onClick
}: {
  project: Project
  active: boolean
  onClick: () => void
}): ReactNode {
  const status = useQuery('stack:status', { id: project.id }, [project.id], { pollMs: 8000 })
  const running = status.data?.running ?? false
  const unhealthy =
    status.data?.services.some((s) => s.state === 'running' && s.health === 'unhealthy') ?? false

  return (
    <button
      onClick={onClick}
      className={cx(
        'mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
        active ? 'bg-panel-2' : 'hover:bg-[#141d27]'
      )}
    >
      <Dot tone={unhealthy ? 'warn' : running ? 'ok' : 'muted'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-text">{project.name}</span>
        <span className="block truncate text-[10.5px] text-muted">{shortPath(project.path, 1)}</span>
      </span>
      {project.environments.length > 0 && (
        <Badge tone="muted">{project.environments.length}</Badge>
      )}
    </button>
  )
}

export { Button }
