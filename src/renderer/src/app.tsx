import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { call, useQuery } from './lib/ipc'
import { cx, shortPath } from './lib/format'
import { useT, type TranslationKey } from './i18n'
import { Badge, Button, Dot, Empty, ErrorNote, SkeletonRows } from './components/ui'
import { LogDrawer } from './components/log-drawer'
import { Mark, Wordmark } from './components/brand'
import { AddProjectModal, NewProjectModal } from './components/new-project'
import { Dashboard } from './routes/dashboard'
import { ConfigRoute } from './routes/config'
import { AuthRoute } from './routes/auth'
import { TablesRoute } from './routes/tables'
import { SqlRoute } from './routes/sql'
import { SecretsRoute } from './routes/secrets'
import { MigrationsRoute } from './routes/migrations'
import { FunctionsRoute } from './routes/functions'
import { SyncRoute } from './routes/sync'
import { SettingsRoute } from './routes/settings'

export type RouteId =
  | 'dashboard'
  | 'config'
  | 'auth'
  | 'tables'
  | 'sql'
  | 'secrets'
  | 'migrations'
  | 'functions'
  | 'sync'
  | 'settings'

const NAV: Array<{ id: RouteId; labelKey: TranslationKey; icon: string; needsProject: boolean }> = [
  { id: 'dashboard', labelKey: 'app.nav.dashboard', icon: '▣', needsProject: false },
  { id: 'config', labelKey: 'app.nav.config', icon: '⚙', needsProject: true },
  { id: 'auth', labelKey: 'app.nav.auth', icon: '⚿', needsProject: true },
  { id: 'tables', labelKey: 'app.nav.tables', icon: '▤', needsProject: true },
  { id: 'sql', labelKey: 'app.nav.sql', icon: '⌗', needsProject: true },
  { id: 'secrets', labelKey: 'app.nav.secrets', icon: '✱', needsProject: true },
  { id: 'migrations', labelKey: 'app.nav.migrations', icon: '⇅', needsProject: true },
  { id: 'functions', labelKey: 'app.nav.functions', icon: 'ƒ', needsProject: true },
  { id: 'sync', labelKey: 'app.nav.sync', icon: '⇈', needsProject: true },
  { id: 'settings', labelKey: 'app.nav.settings', icon: '⋯', needsProject: false }
]

export function App(): ReactNode {
  const projects = useQuery('projects:list', undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [route, setRoute] = useState<RouteId>('dashboard')
  const [logOpen, setLogOpen] = useState(false)
  /** «+» → the new/existing choice */
  const [addOpen, setAddOpen] = useState(false)
  /** the folder chosen for «New project»; the modal opens on top of it */
  const [newProjectDir, setNewProjectDir] = useState<string | null>(null)

  const list = projects.data ?? []
  const selected = useMemo(
    () => list.find((p) => p.id === selectedId) ?? null,
    [list, selectedId]
  )

  useEffect(() => {
    if (!selectedId && list.length > 0) setSelectedId(list[0]!.id)
    if (selectedId && !list.some((p) => p.id === selectedId)) setSelectedId(list[0]?.id ?? null)
  }, [list, selectedId])

  const openProject = useCallback(async () => {
    const path = await call('projects:pickFolder')
    if (!path) return
    const project = await call('projects:add', { path })
    projects.refresh()
    setSelectedId(project.id)
  }, [projects])

  const newProject = useCallback(async () => {
    const path = await call('projects:pickFolder')
    if (path) setNewProjectDir(path)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="drag h-8 shrink-0 border-b border-line bg-panel" />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={list}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={() => setAddOpen(true)}
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
              onOpen={() => void openProject()}
              onNew={() => void newProject()}
              onRoute={setRoute}
            />
          </div>
          <LogDrawer open={logOpen} onToggle={() => setLogOpen((v) => !v)} />
        </main>
      </div>
      {addOpen && (
        <AddProjectModal
          onClose={() => setAddOpen(false)}
          onNew={() => void newProject()}
          onOpen={() => void openProject()}
        />
      )}
      {newProjectDir && (
        <NewProjectModal
          dir={newProjectDir}
          onClose={() => setNewProjectDir(null)}
          onDone={(project) => {
            setNewProjectDir(null)
            projects.refresh()
            setSelectedId(project.id)
          }}
        />
      )}
    </div>
  )
}

function Content({
  route,
  project,
  onProjectsChanged,
  onOpen,
  onNew,
  onRoute
}: {
  route: RouteId
  project: Project | null
  onProjectsChanged: () => void
  onOpen: () => void
  onNew: () => void
  onRoute: (r: RouteId) => void
}): ReactNode {
  if (route === 'settings') return <SettingsRoute />
  if (route === 'dashboard') {
    return (
      <Dashboard
        project={project}
        onChanged={onProjectsChanged}
        onOpen={onOpen}
        onNew={onNew}
        onRoute={onRoute}
      />
    )
  }
  const t = useT()
  if (!project) {
    return <Empty title={t('app.selectProject.title')} hint={t('app.selectProject.hint')} />
  }
  switch (route) {
    case 'config':
      return <ConfigRoute project={project} />
    case 'auth':
      return <AuthRoute project={project} />
    // key: reset schema/table/editor state when the project changes
    case 'tables':
      return <TablesRoute key={project.id} project={project} />
    case 'sql':
      return <SqlRoute key={project.id} project={project} />
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
  const t = useT()
  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
        <Mark size={18} />
        <Wordmark />
      </div>

      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-[10.5px] font-semibold tracking-[0.09em] text-muted uppercase">
          {t('app.sidebar.projects')}
        </span>
        <button
          onClick={onAdd}
          title={t('app.sidebar.addProject')}
          className="rounded px-1.5 text-[15px] leading-none text-muted hover:bg-panel-2 hover:text-accent"
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {loading && <SkeletonRows rows={4} className="px-0.5 py-1" />}
        {error && <ErrorNote>{error}</ErrorNote>}
        {!loading && projects.length === 0 && (
          <p className="px-2 py-3 text-[11.5px] leading-relaxed text-muted">
            {t('app.sidebar.emptyBeforePlus')} <span className="text-accent">+</span>{' '}
            {t('app.sidebar.emptyAfterPlus')}
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
              data-route={item.id}
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
              {t(item.labelKey)}
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
        active ? 'bg-panel-2' : 'hover:bg-hover'
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
