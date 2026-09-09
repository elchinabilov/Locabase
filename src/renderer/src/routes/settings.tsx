import type { ReactNode } from 'react'
import { useQuery } from '../lib/ipc'
import { Badge, Card, Select, Skeleton } from '../components/ui'
import { LOCALES, useI18n } from '../i18n'
import { cx } from '../lib/format'
import { THEMES, useTheme, type ThemePreference } from '../theme'

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
            <span className={cx('text-[12px]', active ? 'text-text' : 'text-muted')}>
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

export function SettingsRoute(): ReactNode {
  const { t, locale, setLocale } = useI18n()
  const doctor = useQuery('system:doctor', undefined)
  const range = useQuery('ports:suggestRange', undefined)
  const conflicts = useQuery('ports:conflicts', undefined)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <h1 className="text-[17px] font-medium">{t('settings.title')}</h1>

      <Card title={t('settings.appearance.title')} subtitle={t('settings.appearance.subtitle')}>
        <div className="px-3.5 py-3">
          <ThemePicker />
        </div>
      </Card>

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
              <span className="w-[110px] shrink-0 text-[12.5px]">{c.label}</span>
              <Badge tone={c.ok ? 'ok' : 'danger'}>
                {c.ok ? t('settings.doctor.present') : t('settings.doctor.absent')}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                {c.info}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('settings.ports.title')}>
        <div className="px-3.5 py-3 text-[12.5px] leading-relaxed">
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
    </div>
  )
}
