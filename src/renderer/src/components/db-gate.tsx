/**
 * SQL və cədvəl ekranları lokal Postgres-ə BİRBAŞA qoşulur — stack qalxmayıbsa
 * hər sorğu uğursuz olardı. `stack:status` onsuz da poll olunur, ona görə
 * yeni kanal əvəzinə o təkrar istifadə olunur.
 */
import type { ReactNode } from 'react'
import { useQuery } from '../lib/ipc'
import { Empty, Skeleton, SkeletonRows, SkeletonTable } from './ui'

export function useDbUp(projectId: string): { dbUp: boolean; checking: boolean } {
  const status = useQuery('stack:status', { id: projectId }, [projectId], { pollMs: 10_000 })
  const dbUp = status.data?.services.some((s) => s.key === 'db' && s.state === 'running') ?? false
  return { dbUp, checking: status.loading && status.data === null }
}

export function StackDown({ checking }: { checking: boolean }): ReactNode {
  if (checking) {
    // Gözləmə anında ekran boş qalmasın deyə səhifənin gerçək karkası çəkilir:
    // solda cədvəl siyahısı, sağda başlıq + grid.
    return (
      <div className="flex h-full min-h-0" role="status" aria-label="baza yoxlanılır">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-line bg-panel p-3">
          <Skeleton h={30} className="rounded-md" />
          <Skeleton h={30} delay={60} className="mt-2 rounded-md" />
          <div className="mt-3">
            <SkeletonRows rows={7} />
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Skeleton w={180} h={13} />
            <Skeleton w={56} h={15} delay={60} className="rounded" />
            <div className="flex-1" />
            <Skeleton w={120} h={26} delay={100} className="rounded-md" />
          </div>
          <SkeletonTable rows={9} cols={5} className="p-1" />
        </section>
      </div>
    )
  }
  return (
    <Empty
      title="Lokal baza işləmir"
      hint="Bu ekran lokal Postgres-ə birbaşa qoşulur. Əvvəlcə «Ümumi» səhifəsindən stack-i başlat."
    />
  )
}
