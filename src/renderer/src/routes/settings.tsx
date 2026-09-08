import type { ReactNode } from 'react'
import { useQuery } from '../lib/ipc'
import { Badge, Card, Skeleton } from '../components/ui'

export function SettingsRoute(): ReactNode {
  const doctor = useQuery('system:doctor', undefined)
  const range = useQuery('ports:suggestRange', undefined)
  const conflicts = useQuery('ports:conflicts', undefined)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <h1 className="text-[17px] font-medium">Ayarlar</h1>

      <Card title="Mühit yoxlaması" subtitle="Tool bu əmrlərə arxalanır">
        {doctor.loading && (
          <ul className="divide-y divide-line-soft" role="status" aria-label="yoxlanılır">
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
              <Badge tone={c.ok ? 'ok' : 'danger'}>{c.ok ? 'var' : 'yox'}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                {c.info}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Portlar">
        <div className="px-3.5 py-3 text-[12.5px] leading-relaxed">
          <p>
            Növbəti boş aralıq:{' '}
            <span className="font-mono text-accent">{range.data ?? '…'}xx</span> — yeni layihə üçün
            api {range.data}21, db {range.data}22, studio {range.data}23.
          </p>
          {(conflicts.data ?? []).length > 0 && (
            <p className="mt-2 text-warn">
              Toqquşan portlar: {(conflicts.data ?? []).map((c) => c.port).join(', ')}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
