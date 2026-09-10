/**
 * Edge Functions — a section with its own two pages, the same shape as
 * Authentication:
 *
 *  - **Functions** — the folders under `supabase/functions`, and their drift
 *    against a remote environment;
 *  - **Secrets** — the variables those functions read at runtime.
 *
 * They sat next to each other in the root sidebar and were used together every
 * time: deploying a function and setting the key it needs is one task, not two
 * screens a list apart.
 */
import { type ReactNode } from 'react'
import { z } from 'zod'
import type { Project } from '@shared/types'
import { useUiState } from '../lib/ui-state'
import { cx } from '../lib/format'
import { useT, type TranslationKey } from '../i18n'
import { Splitter, useStoredSize } from '../components/splitter'
import { FunctionsRoute } from './functions'
import { SecretsRoute } from './secrets'

const SECTION_IDS = ['functions', 'secrets'] as const
type Section = (typeof SECTION_IDS)[number]

const SECTIONS: Array<{ id: Section; key: TranslationKey; icon: string }> = [
  { id: 'functions', key: 'app.nav.functions', icon: 'ƒ' },
  { id: 'secrets', key: 'app.nav.secrets', icon: '✱' }
]

const SIDEBAR = { default: 200, min: 160, max: 360 }

export function EdgeFunctionsRoute({ project }: { project: Project }): ReactNode {
  const t = useT()
  // As on the Authentication screen: the open page is remembered for the window.
  const [section, setSection] = useUiState(
    'edgeFunctions.section',
    z.enum(SECTION_IDS),
    'functions'
  )
  const [width, setWidth] = useStoredSize('locabase.edgeFunctions.sidebarWidth', SIDEBAR.default)

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex shrink-0 flex-col bg-panel" style={{ width: `${width}px` }}>
        <div className="border-b border-line-soft px-3 py-2">
          <span className="text-badge font-semibold tracking-[0.09em] text-muted uppercase">
            {t('app.nav.edgeFunctions')}
          </span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-1.5">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
              className={cx(
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-ui transition-colors',
                section === item.id ? 'bg-panel-2 text-text' : 'text-muted hover:bg-hover'
              )}
            >
              <span aria-hidden className="w-4 shrink-0 text-center opacity-70">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{t(item.key)}</span>
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
        label={t('edgeFunctions.resizeSidebar')}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {/* Remounted per page on purpose: each keeps its own drafts and filters. */}
        {section === 'functions' ? (
          <FunctionsRoute key="functions" project={project} />
        ) : (
          <SecretsRoute key="secrets" project={project} />
        )}
      </section>
    </div>
  )
}
