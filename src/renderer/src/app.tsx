import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import type { Project } from '@shared/types'
import { call, useQuery } from './lib/ipc'
import { pruneUiState, useUiState } from './lib/ui-state'
import { useStackStatus } from './lib/stack-status'
import { cx, shortPath } from './lib/format'
import { useT, type TranslationKey } from './i18n'
import { Badge, Button, Dot, Empty, ErrorNote, SkeletonRows } from './components/ui'
import { LogDrawer } from './components/log-drawer'
import { ErrorBoundary } from './components/error-boundary'
import { Mark, Wordmark } from './components/brand'
import { AddProjectModal, NewProjectModal } from './components/new-project'
import { Dashboard } from './routes/dashboard'
import { ConfigRoute } from './routes/config'
import { AuthRoute } from './routes/auth'
import { TablesRoute } from './routes/tables'
import { SqlRoute } from './routes/sql'
import { MigrationsRoute } from './routes/migrations'
import { EdgeFunctionsRoute } from './routes/edge-functions'
import { SyncRoute } from './routes/sync'
import { BackupsRoute } from './routes/backups'
import { SettingsRoute, SETTINGS_SECTIONS, type SettingsSection } from './routes/settings'

/* The list is the runtime side of `RouteId`: the remembered route comes back
   from storage as an unknown string and has to be checked against something. */
const ROUTE_IDS = [
  'dashboard',
  'config',
  'auth',
  'tables',
  'sql',
  'migrations',
  'functions',
  'sync',
  'backups',
  'settings'
] as const

export type RouteId = (typeof ROUTE_IDS)[number]

/* What the window is allowed to restore. A route that no longer exists, or an
   id left over from a hand-edited store, falls back to the default. */
const ROUTE = z.enum(ROUTE_IDS)
const SETTINGS_SECTION = z.enum(SETTINGS_SECTIONS)
const PROJECT_ID = z.string().min(1).max(200).nullable()

const NAV: Array<{ id: RouteId; labelKey: TranslationKey; icon: string; needsProject: boolean }> = [
  { id: 'dashboard', labelKey: 'app.nav.dashboard', icon: '▣', needsProject: false },
  { id: 'config', labelKey: 'app.nav.config', icon: '⚙', needsProject: true },
  { id: 'auth', labelKey: 'app.nav.auth', icon: '⚿', needsProject: true },
  { id: 'tables', labelKey: 'app.nav.tables', icon: '▤', needsProject: true },
  { id: 'sql', labelKey: 'app.nav.sql', icon: '⌗', needsProject: true },
  { id: 'migrations', labelKey: 'app.nav.migrations', icon: '⇅', needsProject: true },
  { id: 'functions', labelKey: 'app.nav.edgeFunctions', icon: 'ƒ', needsProject: true },
  { id: 'sync', labelKey: 'app.nav.sync', icon: '⇈', needsProject: true },
  { id: 'backups', labelKey: 'app.nav.backups', icon: '⛁', needsProject: true },
  { id: 'settings', labelKey: 'app.nav.settings', icon: '⋯', needsProject: false }
]

export function App(): ReactNode {
  const projects = useQuery('projects:list', undefined)
  /* Where the user was: the project, the screen and the drawer all come back as
     they were left. The project id is checked against the registry below, so a
     folder removed between two launches falls back instead of querying a ghost. */
  const [selectedId, setSelectedId] = useUiState('projectId', PROJECT_ID, null)
  const [route, setRoute] = useUiState('route', ROUTE, 'dashboard')
  /** Which Settings page is open — kept here so other screens can link into one. */
  const [settingsSection, setSettingsSection] = useUiState(
    'settingsSection',
    SETTINGS_SECTION,
    'appearance'
  )
  const [logOpen, setLogOpen] = useUiState('logOpen', z.boolean(), false)
  /** «+» → the new/existing choice */
  const [addOpen, setAddOpen] = useState(false)
  /** the folder chosen for «New project»; the modal opens on top of it */
  const [newProjectDir, setNewProjectDir] = useState<string | null>(null)

  const list = projects.data ?? []
  const selected = useMemo(() => list.find((p) => p.id === selectedId) ?? null, [list, selectedId])

  useEffect(() => {
    if (!selectedId && list.length > 0) setSelectedId(list[0]!.id)
    if (selectedId && !list.some((p) => p.id === selectedId)) setSelectedId(list[0]?.id ?? null)
  }, [list, selectedId, setSelectedId])

  // The screens remember themselves per project; a project that is gone would
  // otherwise keep its schema, filters and editor buffer forever.
  useEffect(() => {
    if (projects.data) pruneUiState(projects.data.map((p) => p.id))
  }, [projects.data])

  const openProject = useCallback(async () => {
    const path = await call('projects:pickFolder')
    if (!path) return
    const project = await call('projects:add', { path })
    projects.refresh()
    setSelectedId(project.id)
  }, [projects, setSelectedId])

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
            {/* Keyed by route: a screen that throws is contained, the sidebar
                survives, and navigating away clears the failure. */}
            <ErrorBoundary key={route}>
              <Content
                route={route}
                project={selected}
                loading={projects.loading && projects.data === null}
                onProjectsChanged={projects.refresh}
                onOpen={() => void openProject()}
                onNew={() => void newProject()}
                onRoute={setRoute}
                settingsSection={settingsSection}
                onSettingsSection={setSettingsSection}
              />
            </ErrorBoundary>
          </div>
          <LogDrawer open={logOpen} onToggle={() => setLogOpen(!logOpen)} />
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
  loading,
  onProjectsChanged,
  onOpen,
  onNew,
  onRoute,
  settingsSection,
  onSettingsSection
}: {
  route: RouteId
  project: Project | null
  /** The registry itself is still loading — no screen can say anything yet. */
  loading: boolean
  onProjectsChanged: () => void
  onOpen: () => void
  onNew: () => void
  onRoute: (r: RouteId) => void
  settingsSection: SettingsSection
  onSettingsSection: (s: SettingsSection) => void
}): ReactNode {
  // Above every early return: a hook after a conditional return is a Rules of
  // Hooks violation. It survives today only because `useT` bottoms out in
  // `useContext`, which takes no slot in the fiber's hook list — the moment
  // `useI18n` gains a `useState`, navigating here would throw.
  const t = useT()

  // The remembered route can be one that needs a project, and the registry has
  // not arrived yet: an empty state here would show for a frame and then be
  // replaced by the screen. The sidebar is already showing its skeleton.
  if (loading && !project && route !== 'settings') return null

  if (route === 'settings') {
    return <SettingsRoute section={settingsSection} onSection={onSettingsSection} />
  }
  if (route === 'dashboard') {
    return <Dashboard project={project} onOpen={onOpen} onNew={onNew} onRoute={onRoute} />
  }
  if (!project) {
    return <Empty title={t('app.selectProject.title')} hint={t('app.selectProject.hint')} />
  }
  switch (route) {
    case 'config':
      return <ConfigRoute project={project} />
    case 'auth':
      return <AuthRoute project={project} />
    // key: every screen below holds per-project state (a selected schema, an
    // environment, an editor buffer) — remounting is how it is reset. Without
    // it, a switch carries the previous project's environment id into the next
    // project's queries.
    case 'tables':
      return <TablesRoute key={project.id} project={project} />
    case 'sql':
      return <SqlRoute key={project.id} project={project} />
    case 'migrations':
      return <MigrationsRoute key={project.id} project={project} />
    case 'functions':
      return <EdgeFunctionsRoute key={project.id} project={project} />
    case 'sync':
      return <SyncRoute key={project.id} project={project} onChanged={onProjectsChanged} />
    case 'backups':
      return (
        <BackupsRoute
          key={project.id}
          project={project}
          // Straight to the page that holds the connections, not to Settings at large.
          onOpenSettings={() => {
            onSettingsSection('storage')
            onRoute('settings')
          }}
        />
      )
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
        <span
          title={`${t('app.sidebar.version')} ${__APP_VERSION__}`}
          className="ml-auto rounded-full border border-line-soft bg-panel-2 px-1.5 py-px font-mono text-micro text-dim tabular-nums select-none"
        >
          v{__APP_VERSION__}
        </span>
      </div>

      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-badge font-semibold tracking-[0.09em] text-muted uppercase">
          {t('app.sidebar.projects')}
        </span>
        <button
          onClick={onAdd}
          title={t('app.sidebar.addProject')}
          aria-label={t('app.sidebar.addProject')}
          className="rounded px-1.5 text-h2 leading-none text-muted hover:bg-panel-2 hover:text-accent"
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {loading && <SkeletonRows rows={4} className="px-0.5 py-1" />}
        {error && <ErrorNote>{error}</ErrorNote>}
        {!loading && projects.length === 0 && (
          <p className="px-2 py-3 text-small leading-relaxed text-muted">
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

      <nav className="border-t border-line-soft p-2 pb-3.5">
        {NAV.map((item) => {
          const disabled = item.needsProject && !selectedId
          return (
            <button
              key={item.id}
              data-route={item.id}
              disabled={disabled}
              onClick={() => onRoute(item.id)}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-ui transition-colors',
                route === item.id
                  ? 'bg-panel-2 text-text'
                  : 'text-muted hover:bg-panel-2 hover:text-text',
                disabled && 'cursor-not-allowed opacity-35 hover:bg-transparent'
              )}
            >
              <span aria-hidden className="w-3.5 text-center text-note opacity-80">
                {item.icon}
              </span>
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
  const status = useStackStatus(project.id)
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
        <span className="block truncate text-ui text-text">{project.name}</span>
        <span className="block truncate text-badge text-muted">{shortPath(project.path, 1)}</span>
      </span>
      {project.environments.length > 0 && <Badge tone="muted">{project.environments.length}</Badge>}
    </button>
  )
}

export { Button }
