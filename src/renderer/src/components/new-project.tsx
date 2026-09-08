import { useEffect, useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { sanitizeProjectId } from '@shared/naming'
import { call, useQuery } from '../lib/ipc'
import { Button, ErrorNote, Input, Modal, Row } from './ui'

/** `553` → 55321 (api), 55322 (db), 55323 (studio) */
function portsFor(base: number): string {
  return [21, 22, 23].map((n) => base * 100 + n).join(' · ')
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

/**
 * «+» seçimi: sıfırdan qurmaq, yoxsa mövcud qovluğu əlavə etmək. Sidebar-da
 * açılan menyu siyahının üstünə düşüb oxunmurdu — seçim mərkəzi dialoqdadır.
 */
export function AddProjectModal({
  onClose,
  onNew,
  onOpen
}: {
  onClose: () => void
  onNew: () => void
  onOpen: () => void
}): ReactNode {
  return (
    <Modal
      title="Layihə əlavə et"
      onClose={onClose}
      footer={<Button onClick={onClose}>Ləğv et</Button>}
    >
      <div className="flex flex-col gap-2">
        <Choice
          label="Yeni layihə"
          hint="Seçilən qovluqda `supabase init` işlədilir, portlar boş bloka salınır."
          onClick={() => {
            onClose()
            onNew()
          }}
        />
        <Choice
          label="Mövcud layihəni aç"
          hint="İçində `supabase/config.toml` olan qovluq. Heç nə dəyişdirilmir."
          onClick={() => {
            onClose()
            onOpen()
          }}
        />
      </div>
    </Modal>
  )
}

function Choice({
  label,
  hint,
  onClick
}: {
  label: string
  hint: string
  onClick: () => void
}): ReactNode {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-line bg-[#0d141b] px-3.5 py-3 text-left transition-colors hover:border-accent-dim hover:bg-panel-2"
    >
      <span className="block text-[12.5px] text-text">{label}</span>
      <span className="mt-1 block text-[11.5px] leading-snug text-muted">{hint}</span>
    </button>
  )
}

/**
 * «Yeni layihə»: seçilmiş qovluqda `supabase init` işlədilir. Qovluqda artıq
 * layihə varsa qurmaq əvəzinə sadəcə əlavə etmək təklif olunur.
 */
export function NewProjectModal({
  dir,
  onClose,
  onDone
}: {
  dir: string
  onClose: () => void
  onDone: (project: Project) => void
}): ReactNode {
  const suggested = useQuery('ports:suggestRange', undefined)
  const existing = useQuery('projects:inspect', { path: dir }, [dir])
  const [name, setName] = useState(() => baseName(dir))
  const [base, setBase] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (base === null && suggested.data !== null) setBase(suggested.data)
  }, [suggested.data, base])

  const projectId = sanitizeProjectId(name)
  const occupied = existing.data?.valid === true
  const ready = projectId !== '' && base !== null && !occupied && !existing.loading

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onDone(await call('projects:create', { path: dir, name: name.trim(), portBase: base ?? undefined }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const addExisting = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onDone(await call('projects:add', { path: dir }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Yeni layihə"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Ləğv et
          </Button>
          {occupied ? (
            <Button variant="primary" onClick={() => void addExisting()} loading={busy}>
              Mövcud layihə kimi əlavə et
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!ready}>
              Qur
            </Button>
          )}
        </>
      }
    >
      <div className="divide-y divide-line-soft rounded-md border border-line">
        <Row label="Qovluq" hint="`supabase/` bunun içində yaranacaq">
          <div className="pt-1 font-mono text-[11.5px] break-all text-muted">{dir}</div>
        </Row>
        <Row
          label="Ad"
          hint={
            projectId ? (
              <>
                project_id: <code className="text-accent">{projectId}</code> — konteyner adları
                bundan törəyir
              </>
            ) : (
              'Ən azı bir hərf və ya rəqəm lazımdır'
            )
          }
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy || occupied} />
        </Row>
        <Row
          label="Port bloku"
          hint={
            base === null
              ? 'Boş blok axtarılır…'
              : `api · db · studio → ${portsFor(base)} (digər layihələrlə toqquşmasın deyə)`
          }
        >
          <Input
            type="number"
            value={base ?? ''}
            min={80}
            max={654}
            onChange={(e) => setBase(Number(e.target.value) || null)}
            disabled={busy || occupied}
          />
        </Row>
      </div>

      <div className="mt-3 space-y-2">
        {occupied && (
          <ErrorNote>
            Bu qovluqda artıq <code>supabase/config.toml</code> var. Üstündən yazmırıq — layihəni
            olduğu kimi əlavə edə bilərsən.
          </ErrorNote>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {!occupied && (
          <p className="text-[11.5px] leading-relaxed text-muted">
            <code className="text-accent">supabase init</code> işlədiləcək, sonra{' '}
            <code>project_id</code> və portlar yazılacaq. Loglar aşağıdakı panelə düşür.
          </p>
        )}
      </div>
    </Modal>
  )
}
