import type { ReactNode } from 'react'
import { useQuery } from '../lib/ipc'
import { Badge, Button, Card, Row, Select, Skeleton } from '../components/ui'
import { LOCALES, useI18n, useT, type TranslationKey } from '../i18n'
import { cx } from '../lib/format'
import { Splitter, useStoredSize } from '../components/splitter'
import { THEMES, useTheme, type ThemePreference } from '../theme'
import { StorageCard } from '../components/storage-form'
import {
  available,
  EDITOR_SIZES,
  MONO_FONTS,
  SANS_FONTS,
  TEXT_SCALES,
  useFonts,
  type FontOption,
  type TextScaleId
} from '../fonts'

/**
 * A segmented control rather than a dropdown: there are only three options, and
 * each one shows the palette it selects — so the choice is visible before it is
 * made. `system` shows both halves, because that is what it means.
 */
function ThemePicker(): ReactNode {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const label: Record<ThemePreference, string> = {
    system: t('settings.appearance.system'),
    light: t('settings.appearance.light'),
    dark: t('settings.appearance.dark')
  }
  return (
    <div role="radiogroup" aria-label={t('settings.appearance.subtitle')} className="flex gap-2">
      {THEMES.map((id) => {
        const active = theme === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(id)}
            className={cx(
              'flex flex-1 flex-col items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors',
              active
                ? 'border-accent-dim bg-accent-tint'
                : 'border-line bg-sunken hover:border-accent-dim hover:bg-hover'
            )}
          >
            <Swatch theme={id} />
            <span className={cx('text-note', active ? 'text-text' : 'text-muted')}>
              {label[id]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * A miniature window in the palette the option stands for. The colours are
 * literal on purpose: a swatch has to show the *other* theme while the current
 * one is on screen, so it cannot go through the themed tokens.
 */
function Swatch({ theme }: { theme: ThemePreference }): ReactNode {
  const box = 'flex h-9 w-full overflow-hidden rounded border border-line'
  if (theme === 'system') {
    return (
      <span className={box} aria-hidden>
        <span className="w-1/2 border-r border-line bg-[#0b0f14]">
          <span className="mt-1.5 ml-1.5 block h-1 w-6 rounded-full bg-[#3ecf8e]" />
          <span className="mt-1 ml-1.5 block h-1 w-4 rounded-full bg-[#22303d]" />
        </span>
        <span className="w-1/2 bg-[#f2f5f8]">
          <span className="mt-1.5 ml-1.5 block h-1 w-6 rounded-full bg-[#0e8a5f]" />
          <span className="mt-1 ml-1.5 block h-1 w-4 rounded-full bg-[#cbd5df]" />
        </span>
      </span>
    )
  }
  const dark = theme === 'dark'
  return (
    <span
      className={cx(box, 'flex-col justify-start p-1.5')}
      style={{ background: dark ? '#0b0f14' : '#f2f5f8' }}
      aria-hidden
    >
      <span
        className="block h-1 w-8 rounded-full"
        style={{ background: dark ? '#3ecf8e' : '#0e8a5f' }}
      />
      <span
        className="mt-1 block h-1 w-12 rounded-full"
        style={{ background: dark ? '#22303d' : '#cbd5df' }}
      />
      <span
        className="mt-1 block h-1 w-6 rounded-full"
        style={{ background: dark ? '#1a242f' : '#dde4ea' }}
      />
    </span>
  )
}

/* ----------------------------------------------------------------- fonts */

/**
 * Font family, text size, and the same pair again for the SQL editor.
 *
 * Every change lands immediately, so the page itself is the interface preview;
 * the code line at the bottom is the second one, in the editor's exact font and
 * size — the SQL screen is otherwise a click away. Fonts the machine doesn't
 * have are labelled, because choosing one would otherwise appear to do nothing.
 */
function TypographyCard(): ReactNode {
  const { t } = useI18n()
  const fonts = useFonts()

  // Spelled out rather than built from the id: `t()` takes literal keys, which
  // is what keeps a renamed translation key a compile error.
  const scaleLabel: Record<TextScaleId, string> = {
    small: t('settings.typography.scale.small'),
    default: t('settings.typography.scale.default'),
    large: t('settings.typography.scale.large'),
    larger: t('settings.typography.scale.larger')
  }

  const familyOptions = (list: FontOption[]): Array<{ value: string; label: string }> =>
    list.map((f) => ({
      value: f.id,
      label: available(f) ? f.label : `${f.label} — ${t('settings.typography.unavailable')}`
    }))

  return (
    <Card
      title={t('settings.typography.title')}
      subtitle={t('settings.typography.subtitle')}
      actions={
        <Button variant="ghost" onClick={fonts.reset}>
          {t('settings.typography.reset')}
        </Button>
      }
    >
      <div className="divide-y divide-line-soft">
        <Row label={t('settings.typography.interfaceFont')}>
          <div className="w-64">
            <Select
              value={fonts.sans}
              options={familyOptions(SANS_FONTS)}
              onChange={(v) => fonts.set({ sans: v })}
            />
          </div>
        </Row>

        <Row label={t('settings.typography.textSize')}>
          <div className="w-64">
            <Select
              value={fonts.textScale}
              options={TEXT_SCALES.map((s) => ({
                value: s.id,
                label: `${scaleLabel[s.id]} · ${Math.round(s.scale * 100)}%`
              }))}
              onChange={(v) => fonts.set({ textScale: v as typeof fonts.textScale })}
            />
          </div>
        </Row>

        <Row label={t('settings.typography.editorFont')}>
          <div className="w-64">
            <Select
              value={fonts.mono}
              options={familyOptions(MONO_FONTS)}
              onChange={(v) => fonts.set({ mono: v })}
            />
          </div>
        </Row>

        <Row label={t('settings.typography.editorSize')}>
          <div className="w-64">
            <Select
              value={String(fonts.editorSize)}
              options={EDITOR_SIZES.map((n) => ({ value: String(n), label: `${n} px` }))}
              onChange={(v) => fonts.set({ editorSize: Number(v) })}
            />
          </div>
        </Row>

        <div className="flex flex-col gap-2 px-3.5 py-3">
          <p className="text-ui">{t('settings.typography.previewText')}</p>
          <pre
            className="overflow-x-auto rounded-md border border-line bg-sunken px-3 py-2 font-mono text-accent"
            style={{ fontSize: 'var(--lb-editor-size)' }}
          >
            {t('settings.typography.previewCode')}
          </pre>
        </div>
      </div>
    </Card>
  )
}

/**
 * Settings is a section with its own pages, the way Authentication is: the four
 * groups have nothing to do with one another — a colour scheme, a language, a
 * bucket's credentials, the state of the machine — and stacking them in one
 * scroll made the last of them invisible.
 *
 * Which page is showing lives in `App`, so another screen can send the user
 * straight to the one it means (Backups → Storage).
 */
export type SettingsSection = 'appearance' | 'language' | 'storage' | 'system'

const SECTIONS: Array<{ id: SettingsSection; key: TranslationKey; icon: string }> = [
  { id: 'appearance', key: 'settings.section.appearance', icon: '◐' },
  { id: 'language', key: 'settings.section.language', icon: '⌨' },
  { id: 'storage', key: 'settings.section.storage', icon: '☁' },
  { id: 'system', key: 'settings.section.system', icon: '⚕' }
]

const SIDEBAR = { default: 200, min: 160, max: 360 }

export function SettingsRoute({
  section,
  onSection
}: {
  section: SettingsSection
  onSection: (s: SettingsSection) => void
}): ReactNode {
  const t = useT()
  const [width, setWidth] = useStoredSize('locabase.settings.sidebarWidth', SIDEBAR.default)

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex shrink-0 flex-col bg-panel" style={{ width: `${width}px` }}>
        <div className="border-b border-line-soft px-3 py-2">
          <span className="text-badge font-semibold tracking-[0.09em] text-muted uppercase">
            {t('settings.title')}
          </span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-1.5">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => onSection(item.id)}
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
        label={t('settings.resizeSidebar')}
      />

      <section className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
          {section === 'appearance' && <AppearanceSection />}
          {section === 'language' && <LanguageSection />}
          {section === 'storage' && <StorageCard />}
          {section === 'system' && <SystemSection />}
        </div>
      </section>
    </div>
  )
}

function AppearanceSection(): ReactNode {
  const t = useT()
  return (
    <>
      <Card title={t('settings.appearance.title')} subtitle={t('settings.appearance.subtitle')}>
        <div className="px-3.5 py-3">
          <ThemePicker />
        </div>
      </Card>
      <TypographyCard />
    </>
  )
}

function LanguageSection(): ReactNode {
  const { t, locale, setLocale } = useI18n()
  return (
    <Card title={t('settings.language.title')}>
      <div className="px-3.5 py-3">
        <div className="w-56">
          <Select
            value={locale}
            onChange={(v) => setLocale(v as (typeof LOCALES)[number]['id'])}
            options={LOCALES.map((l) => ({ value: l.id, label: l.label }))}
          />
        </div>
      </div>
    </Card>
  )
}

/** What the machine has to offer: the CLI/Docker check and the port picture. */
function SystemSection(): ReactNode {
  const t = useT()
  const doctor = useQuery('system:doctor', undefined)
  const range = useQuery('ports:suggestRange', undefined)
  const conflicts = useQuery('ports:conflicts', undefined)

  return (
    <>
      <Card title={t('settings.doctor.title')} subtitle={t('settings.doctor.subtitle')}>
        {doctor.loading && (
          <ul className="divide-y divide-line-soft" role="status" aria-label={t('common.checking')}>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-3.5 py-2">
                <Skeleton w={110} h={11} delay={i * 90} className="shrink-0" />
                <Skeleton w={44} h={15} delay={i * 90 + 40} className="shrink-0 rounded" />
                <Skeleton h={9} w="45%" delay={i * 90 + 80} />
              </li>
            ))}
          </ul>
        )}
        <ul className="divide-y divide-line-soft">
          {(doctor.data ?? []).map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-3.5 py-2">
              <span className="w-[110px] shrink-0 text-ui">{c.label}</span>
              <Badge tone={c.ok ? 'ok' : 'danger'}>
                {c.ok ? t('settings.doctor.present') : t('settings.doctor.absent')}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-meta text-muted">
                {c.info}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('settings.ports.title')}>
        <div className="px-3.5 py-3 text-ui leading-relaxed">
          <p>
            {t('settings.ports.nextFreeBefore')}{' '}
            <span className="font-mono text-accent">{range.data ?? '…'}xx</span>{' '}
            {t('settings.ports.nextFreeAfter', {
              api: `${range.data}21`,
              db: `${range.data}22`,
              studio: `${range.data}23`
            })}
          </p>
          {(conflicts.data ?? []).length > 0 && (
            <p className="mt-2 text-warn">
              {t('settings.ports.conflicts', {
                ports: (conflicts.data ?? []).map((c) => c.port).join(', ')
              })}
            </p>
          )}
        </div>
      </Card>
    </>
  )
}
