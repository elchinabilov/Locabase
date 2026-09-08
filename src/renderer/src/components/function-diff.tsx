import { useState, type ReactNode } from 'react'
import type { FunctionDrift, FunctionFileDiff } from '@shared/types'
import { useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { Badge, ErrorNote, Modal, SkeletonRows } from './ui'
import { DiffView } from './diff-view'

const STATUS: Record<FunctionFileDiff['status'], { label: string; tone: 'ok' | 'warn' | 'info' | 'muted' }> = {
  same: { label: 'eyni', tone: 'muted' },
  changed: { label: 'fərqli', tone: 'warn' },
  'local-only': { label: 'yalnız lokal', tone: 'info' },
  'remote-only': { label: 'yalnız remote', tone: 'warn' }
}

/** Fərq vəziyyətinin insan dilində adı — siyahılarda badge kimi işlədilir. */
export const DRIFT: Record<FunctionDrift, { label: string; tone: 'ok' | 'warn' | 'info' | 'muted' }> =
  {
    same: { label: 'üst-üstə düşür', tone: 'ok' },
    changed: { label: 'məzmun fərqlidir', tone: 'warn' },
    'local-only': { label: 'remote-da yoxdur', tone: 'info' },
    'remote-only': { label: 'yalnız remote', tone: 'warn' },
    unknown: { label: 'bilinmir', tone: 'muted' }
  }

/**
 * Bir funksiyanın fayl-fayl fərqi. Diff-də **sol tərəf uzaqdır**: `−` uzaqda
 * olan, `+` lokalda olan sətirdir — deploy uzağı lokala çəkir.
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
  const diff = useQuery('functions:diff', { id: projectId, envId, name }, [projectId, envId, name])
  const changed = diff.data?.changed ?? 0

  return (
    <Modal wide title={`Fərq — ${name}`} onClose={onClose}>
      {diff.loading && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-muted">Uzaq mənbə gətirilir…</p>
          <SkeletonRows rows={4} />
        </div>
      )}
      {diff.error && <ErrorNote>{diff.error}</ErrorNote>}
      {diff.data && (
        <>
          <p className="mb-2.5 text-[12px] text-muted">
            {diff.data.files.length} fayl ·{' '}
            {changed === 0 ? 'fərq yoxdur' : `${changed} fayl fərqlidir`} · sol (−) uzaq, sağ (+)
            lokal
          </p>
          <div className="flex flex-col gap-2">
            {diff.data.files.map((f) => (
              <FileBlock key={f.path} file={f} />
            ))}
            {diff.data.files.length === 0 && (
              <p className="py-6 text-center text-[12px] text-muted">Fayl tapılmadı.</p>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

function FileBlock({ file }: { file: FunctionFileDiff }): ReactNode {
  const [open, setOpen] = useState(file.status !== 'same')
  const meta = STATUS[file.status]

  return (
    <div className="rounded-md border border-line">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-panel-2"
      >
        <span className={cx('w-3 shrink-0 text-[10px] text-muted', open && 'rotate-90')}>▸</span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{file.path}</code>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </button>
      {open && (
        <div className="border-t border-line-soft p-2">
          {file.binary ? (
            <p className="py-2 text-center text-[12px] text-muted">
              Binar və ya çox böyük fayl — məzmun göstərilmir.
            </p>
          ) : (
            <DiffView before={file.remote ?? ''} after={file.local ?? ''} context={3} />
          )}
        </div>
      )}
    </div>
  )
}
