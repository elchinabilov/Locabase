import type { ReactNode } from 'react'
import { useQuery } from '../lib/ipc'
import { Badge, Card, Select, Skeleton } from '../components/ui'
import { LOCALES, useI18n } from '../i18n'

export function SettingsRoute(): ReactNode {
  const { t, locale, setLocale } = useI18n()
  const doctor = useQuery('system:doctor', undefined)
  const range = useQuery('ports:suggestRange', undefined)
  const conflicts = useQuery('ports:conflicts', undefined)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <h1 className="text-[17px] font-medium">{t('settings.title')}</h1>

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
