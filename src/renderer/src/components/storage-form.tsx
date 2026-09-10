/**
 * Storage connections — the Settings card and the form behind it.
 *
 * Connections are app-wide rather than per project: one bucket usually holds
 * every project's backups. Only Cloudflare R2 is offered today; the shape is the
 * S3 one, so the next provider is a row in the dropdown, not a new screen.
 */
import { useState, type ReactNode } from 'react'
import type { StorageConnection, StorageTestReport } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { useAction } from '../lib/use-action'
import { useT } from '../i18n'
import { Badge, Button, Card, ErrorNote, Input, Modal, Row, Select, SkeletonList } from './ui'

export function StorageCard(): ReactNode {
  const t = useT()
  const list = useQuery('storage:list', undefined)
  const [editing, setEditing] = useState<StorageConnection | null | 'new'>(null)
  const [tests, setTests] = useState<Record<string, StorageTestReport | 'running'>>({})
  const [confirm, setConfirm] = useState<StorageConnection | null>(null)
  const { run, error } = useAction()

  const items = list.data ?? []

  const test = async (conn: StorageConnection): Promise<void> => {
    setTests((prev) => ({ ...prev, [conn.id]: 'running' }))
    try {
      const report = await call('storage:test', { storageId: conn.id })
      setTests((prev) => ({ ...prev, [conn.id]: report }))
    } catch (err) {
      setTests((prev) => ({
        ...prev,
        [conn.id]: {
          ok: false,
          checks: [{ label: 'Error', ok: false, info: (err as Error).message }]
        }
      }))
    }
  }

  const remove = async (conn: StorageConnection): Promise<void> => {
    const ok = await run(() => call('storage:remove', { storageId: conn.id }))
    if (ok === undefined) return
    setConfirm(null)
    list.refresh()
  }

  return (
    <Card
      title={t('storage.title')}
      subtitle={t('storage.subtitle')}
      actions={<Button onClick={() => setEditing('new')}>{t('storage.add')}</Button>}
    >
      {error && (
        <div className="px-3.5 pt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {list.error && (
        <div className="px-3.5 pt-3">
          <ErrorNote>{list.error}</ErrorNote>
        </div>
      )}
      {list.loading && <SkeletonList rows={2} trailing />}
      {!list.loading && items.length === 0 && (
        <p className="px-3.5 py-6 text-center text-note text-muted">{t('storage.empty')}</p>
      )}

      <ul className="divide-y divide-line-soft">
        {items.map((conn) => {
          const state = tests[conn.id]
          return (
            <li key={conn.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-ui text-text">{conn.name}</span>
                  <Badge tone="info">{t('storage.provider.r2')}</Badge>
                  <Badge tone={conn.hasSecret ? 'muted' : 'danger'}>
                    {conn.hasSecret ? t('storage.hasSecret') : t('storage.missingSecret')}
                  </Badge>
                </div>
                <div className="mt-0.5 truncate font-mono text-badge text-faint">
                  {conn.bucket}
                  {conn.prefix ? `/${conn.prefix}` : ''} · {conn.accountId}
                </div>
                {state && state !== 'running' && (
                  <div
                    className={`mt-1 text-meta ${state.ok ? 'text-accent' : 'text-danger-soft'}`}
                  >
                    {state.checks.map((c) => `${c.label}: ${c.info}`).join(' · ')}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button loading={state === 'running'} onClick={() => void test(conn)}>
                  {state === 'running' ? t('storage.testing') : t('storage.test')}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(conn)}>
                  {t('common.edit')}
                </Button>
                <Button variant="danger" onClick={() => setConfirm(conn)}>
                  {t('storage.remove')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {editing && (
        <StorageModal
          conn={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            list.refresh()
          }}
        />
      )}

      {confirm && (
        <Modal
          title={t('storage.removeTitle', { name: confirm.name })}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={() => void remove(confirm)}>
                {t('storage.remove')}
              </Button>
            </>
          }
        >
          <p className="text-ui leading-relaxed text-muted">{t('storage.removeHint')}</p>
        </Modal>
      )}
    </Card>
  )
}

/** Create or edit one connection. On edit an empty secret field keeps the stored key. */
function StorageModal({
  conn,
  onClose,
  onSaved
}: {
  conn: StorageConnection | null
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const t = useT()
  const [name, setName] = useState(conn?.name ?? '')
  const [accountId, setAccountId] = useState(conn?.accountId ?? '')
  const [bucket, setBucket] = useState(conn?.bucket ?? '')
  const [accessKeyId, setAccessKeyId] = useState(conn?.accessKeyId ?? '')
  const [secret, setSecret] = useState('')
  const [prefix, setPrefix] = useState(conn?.prefix ?? '')
  const { run, busy: saving, error } = useAction()

  const save = async (): Promise<void> => {
    const ok = await run(() =>
      call('storage:upsert', {
        conn: {
          id: conn?.id,
          name,
          provider: 'r2',
          accountId,
          bucket,
          region: 'auto',
          prefix,
          accessKeyId
        },
        secretAccessKey: secret || undefined
      })
    )
    if (ok !== undefined) onSaved()
  }

  return (
    <Modal
      title={t('storage.form.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('storage.form.save')}
          </Button>
        </>
      }
    >
      <div className="divide-y divide-line-soft">
        {error && (
          <div className="pb-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        <Row label={t('storage.form.name')}>
          <Input
            value={name}
            placeholder={t('storage.form.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </Row>
        <Row label={t('storage.form.provider')}>
          <Select
            value="r2"
            onChange={() => undefined}
            options={[{ value: 'r2', label: t('storage.provider.r2') }]}
          />
        </Row>
        <Row label={t('storage.form.accountId')} hint={t('storage.form.accountIdHint')}>
          <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} />
        </Row>
        <Row label={t('storage.form.bucket')}>
          <Input value={bucket} onChange={(e) => setBucket(e.target.value)} />
        </Row>
        <Row label={t('storage.form.accessKeyId')}>
          <Input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
        </Row>
        <Row
          label={t('storage.form.secretAccessKey')}
          hint={conn ? t('storage.form.secretKept') : undefined}
        >
          <Input
            type="password"
            value={secret}
            placeholder={conn?.hasSecret ? '••••••••' : ''}
            onChange={(e) => setSecret(e.target.value)}
          />
        </Row>
        <Row label={t('storage.form.prefix')} hint={t('storage.form.prefixHint')}>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </Row>
      </div>
    </Modal>
  )
}
