/**
 * Authentication — a section with its own two screens, the way the Supabase
 * dashboard splits them:
 *
 *  - **Users** — who has actually signed up, read from `auth.users`;
 *  - **Sign In / Providers** — which providers are switched on in `config.toml`.
 *
 * They share nothing but the sidebar: one reads the database, the other edits a
 * file. Keeping them apart is what lets each be simple.
 */
import { useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { cx } from '../lib/format'
import { useT, type TranslationKey } from '../i18n'
import { Splitter, useStoredSize } from '../components/splitter'
import { AuthUsers } from './auth-users'
import { AuthProviders } from './auth-providers'

type Section = 'users' | 'providers'

const SECTIONS: Array<{ id: Section; key: TranslationKey; icon: string }> = [
  { id: 'users', key: 'auth.section.users', icon: '👤' },
  { id: 'providers', key: 'auth.section.providers', icon: '🔑' }
]

const SIDEBAR = { default: 200, min: 160, max: 360 }

export function AuthRoute({ project }: { project: Project }): ReactNode {
  const t = useT()
  const [section, setSection] = useState<Section>('users')
  const [width, setWidth] = useStoredSize('locabase.auth.sidebarWidth', SIDEBAR.default)

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex shrink-0 flex-col bg-panel" style={{ width: `${width}px` }}>
        <div className="border-b border-line-soft px-3 py-2">
          <span className="text-badge font-semibold tracking-[0.09em] text-muted uppercase">
            {t('auth.title')}
          </span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-1.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
              className={cx(
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-ui transition-colors',
                section === s.id ? 'bg-panel-2 text-text' : 'text-muted hover:bg-hover'
              )}
            >
              <span aria-hidden className="w-4 shrink-0 text-center opacity-70">
                {s.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{t(s.key)}</span>
            </button>
          ))}
        </nav>
      </aside>

      <Splitter
        axis="x"
        value={width}
        min={SIDEBAR.min}
        max={SIDEBAR.max}
        defaultValue={SIDEBAR.default}
        onChange={setWidth}
        label={t('auth.resizeSidebar')}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {/* Remounting on a section change is deliberate: each screen keeps its
            own filters and drafts, and neither should inherit the other's. */}
        {section === 'users' ? (
          <AuthUsers key="users" project={project} />
        ) : (
          <AuthProviders key="providers" project={project} />
        )}
      </section>
    </div>
  )
}
