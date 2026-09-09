import { useEffect, useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { sanitizeProjectId } from '@shared/naming'
import { call, useQuery } from '../lib/ipc'
import { useT } from '../i18n'
import { Button, ErrorNote, Input, Modal, Row } from './ui'

/** `553` → 55321 (api), 55322 (db), 55323 (studio) */
function portsFor(base: number): string {
  return [21, 22, 23].map((n) => base * 100 + n).join(' · ')
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

/**
 * The «+» choice: set one up from scratch, or add an existing folder. A menu
 * dropping open in the sidebar landed on top of the list and was hard to read —
 * so the choice lives in a centered dialog.
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
  const t = useT()
  return (
    <Modal
      title={t('newProject.addTitle')}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t('common.cancel')}</Button>}
    >
      <div className="flex flex-col gap-2">
        <Choice
          label={t('newProject.choiceNew.label')}
          hint={t('newProject.choiceNew.hint')}
          onClick={() => {
            onClose()
            onNew()
          }}
        />
        <Choice
          label={t('newProject.choiceOpen.label')}
          hint={t('newProject.choiceOpen.hint')}
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
      className="rounded-md border border-line bg-sunken px-3.5 py-3 text-left transition-colors hover:border-accent-dim hover:bg-panel-2"
    >
      <span className="block text-ui text-text">{label}</span>
      <span className="mt-1 block text-small leading-snug text-muted">{hint}</span>
    </button>
  )
}

/**
 * «New project»: runs `supabase init` in the chosen folder. When the folder
 * already holds a project, it offers to simply add it instead of setting one up.
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
  const t = useT()
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
      title={t('newProject.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          {occupied ? (
            <Button variant="primary" onClick={() => void addExisting()} loading={busy}>
              {t('newProject.addExisting')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!ready}>
              {t('newProject.build')}
            </Button>
          )}
        </>
      }
    >
      <div className="divide-y divide-line-soft rounded-md border border-line">
        <Row label={t('newProject.folder.label')} hint={t('newProject.folder.hint')}>
          <div className="pt-1 font-mono text-small break-all text-muted">{dir}</div>
        </Row>
        <Row
          label={t('newProject.name.label')}
          hint={
            projectId ? (
              <>
                project_id: <code className="text-accent">{projectId}</code>{' '}
                {t('newProject.name.hintSuffix')}
              </>
            ) : (
              t('newProject.name.hintEmpty')
            )
          }
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy || occupied} />
        </Row>
        <Row
          label={t('newProject.portBase.label')}
          hint={
            base === null
              ? t('newProject.portBase.searching')
              : t('newProject.portBase.hint', { ports: portsFor(base) })
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
            {t('newProject.occupiedBefore')} <code>supabase/config.toml</code>{' '}
            {t('newProject.occupiedAfter')}
          </ErrorNote>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {!occupied && (
          <p className="text-small leading-relaxed text-muted">
            <code className="text-accent">supabase init</code> {t('newProject.willRunBefore')}{' '}
            <code>project_id</code> {t('newProject.willRunAfter')}
          </p>
        )}
      </div>
    </Modal>
  )
}
