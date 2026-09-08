/**
 * SQL və cədvəl ekranları lokal Postgres-ə BİRBAŞA qoşulur — stack qalxmayıbsa
 * hər sorğu uğursuz olardı. `stack:status` onsuz da poll olunur, ona görə
 * yeni kanal əvəzinə o təkrar istifadə olunur.
 */
import type { ReactNode } from 'react'
import { useQuery } from '../lib/ipc'
import { Empty, Spinner } from './ui'

export function useDbUp(projectId: string): { dbUp: boolean; checking: boolean } {
  const status = useQuery('stack:status', { id: projectId }, [projectId], { pollMs: 10_000 })
  const dbUp = status.data?.services.some((s) => s.key === 'db' && s.state === 'running') ?? false
  return { dbUp, checking: status.loading && status.data === null }
}

export function StackDown({ checking }: { checking: boolean }): ReactNode {
  if (checking) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-muted">
        <Spinner /> <span className="ml-2">baza yoxlanılır…</span>
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
