import { useState, type ReactNode } from 'react'
import type { FunctionDrift, FunctionFileDiff } from '@shared/types'
import { useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { useT, type TranslationKey } from '../i18n'
import { Badge, ErrorNote, Modal, SkeletonRows } from './ui'
import { DiffView } from './diff-view'

const STATUS_KEY: Record<
  FunctionFileDiff['status'],
  { labelKey: TranslationKey; tone: 'ok' | 'warn' | 'info' | 'muted' }
> = {
  same: { labelKey: 'functionDiff.status.same', tone: 'muted' },
  changed: { labelKey: 'functionDiff.status.changed', tone: 'warn' },
  'local-only': { labelKey: 'functionDiff.status.localOnly', tone: 'info' },
  'remote-only': { labelKey: 'functionDiff.status.remoteOnly', tone: 'warn' }
}

/** A human-readable name for the drift state — used as a badge in listings. */
export const DRIFT: Record<FunctionDrift, { labelKey: TranslationKey; tone: 'ok' | 'warn' | 'info' | 'muted' }> =
  {
    same: { labelKey: 'functionDiff.drift.same', tone: 'ok' },
    changed: { labelKey: 'functionDiff.drift.changed', tone: 'warn' },
    'local-only': { labelKey: 'functionDiff.drift.localOnly', tone: 'info' },
    'remote-only': { labelKey: 'functionDiff.drift.remoteOnly', tone: 'warn' },
    unknown: { labelKey: 'functionDiff.drift.unknown', tone: 'muted' }
  }

/**
 * The file-by-file diff of one function. In the diff the **left side is the
 * remote**: `−` is a line on the remote, `+` a line locally — a deploy pulls the
 * remote towards local.
 */
export function FunctionDiffModal({
  projectId,
  envId,
  name,
  onClose
}: {
  projectId: string
  envId: string
  name: string
  onClose: () => void
}): ReactNode {
  const t = useT()
  const diff = useQuery('functions:diff', { id: projectId, envId, name }, [projectId, envId, name])
  const changed = diff.data?.changed ?? 0

  return (
    <Modal wide title={t('functionDiff.title', { name })} onClose={onClose}>
      {diff.loading && (
        <div className="flex flex-col gap-2">
          <p className="text-note text-muted">{t('functionDiff.fetching')}</p>
          <SkeletonRows rows={4} />
        </div>
      )}
      {diff.error && <ErrorNote>{diff.error}</ErrorNote>}
      {diff.data && (
        <>
          <p className="mb-2.5 text-note text-muted">
            {t('functionDiff.summary', {
              fileCount: diff.data.files.length,
              changed:
                changed === 0
                  ? t('functionDiff.noDiff')
                  : t('functionDiff.filesDiffer', { count: changed })
            })}
          </p>
          <div className="flex flex-col gap-2">
            {diff.data.files.map((f) => (
              <FileBlock key={f.path} file={f} />
            ))}
            {diff.data.files.length === 0 && (
              <p className="py-6 text-center text-note text-muted">{t('functionDiff.fileNotFound')}</p>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

function FileBlock({ file }: { file: FunctionFileDiff }): ReactNode {
  const t = useT()
  const [open, setOpen] = useState(file.status !== 'same')
  const meta = STATUS_KEY[file.status]

  return (
    <div className="rounded-md border border-line">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-panel-2"
      >
        <span className={cx('w-3 shrink-0 text-micro text-muted', open && 'rotate-90')}>▸</span>
        <code className="min-w-0 flex-1 truncate font-mono text-note">{file.path}</code>
        <Badge tone={meta.tone}>{t(meta.labelKey)}</Badge>
      </button>
      {open && (
        <div className="border-t border-line-soft p-2">
          {file.binary ? (
            <p className="py-2 text-center text-note text-muted">{t('functionDiff.binaryFile')}</p>
          ) : (
            <DiffView before={file.remote ?? ''} after={file.local ?? ''} context={3} />
          )}
        </div>
      )}
    </div>
  )
}
