import { useState, type ReactNode } from 'react'
import type { ManagedEnv, Project, RemoteEnv, SelfHostedEnv } from '@shared/types'
import { call } from '../lib/ipc'
import { useT } from '../i18n'
import { Button, ErrorNote, Input, Modal, Row, Select } from './ui'

const uuid = (): string => crypto.randomUUID()

function emptyManaged(): ManagedEnv {
  return { id: uuid(), name: 'production', kind: 'managed', projectRef: '', hasToken: false }
}

function emptySelfHosted(): SelfHostedEnv {
  return {
    id: uuid(),
    name: 'production',
    kind: 'self-hosted',
    sshHost: '',
    sshPort: 22,
    sshKeyPath: '',
    dbContainer: '',
    remoteDir: '',
    functionsContainer: '',
    apiUrl: '',
    siteUrl: '',
    backupDir: '/var/backups/supabase',
    backupRetentionDays: 14
  }
}

export function EnvForm({
  project,
  initial,
  onClose,
  onSaved
}: {
  project: Project
  initial: RemoteEnv | null
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const t = useT()
  const [env, setEnv] = useState<RemoteEnv>(initial ?? emptyManaged())
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setKind = (kind: string): void => {
    setEnv((prev) =>
      kind === 'managed'
        ? { ...emptyManaged(), id: prev.id, name: prev.name }
        : { ...emptySelfHosted(), id: prev.id, name: prev.name }
    )
  }

  const patch = <T extends RemoteEnv>(p: Partial<T>): void =>
    setEnv((prev) => ({ ...prev, ...p }) as RemoteEnv)

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await call('envs:upsert', { id: project.id, env })
      if (env.kind === 'managed' && token.trim()) {
        await call('envs:setToken', { id: project.id, envId: env.id, token: token.trim() })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const valid =
    env.name.trim().length > 0 &&
    (env.kind === 'managed'
      ? /^[a-z0-9]{15,}$/.test(env.projectRef.trim())
      : env.sshHost.trim().length > 0 && env.dbContainer.trim().length > 0)

  return (
    <Modal
      wide
      title={initial ? t('envForm.editTitle', { name: initial.name }) : t('envForm.newTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!valid}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="divide-y divide-line-soft rounded-md border border-line">
        <Row label={t('envForm.name.label')} hint={t('envForm.name.hint')}>
          <Input value={env.name} onChange={(e) => patch({ name: e.target.value })} />
        </Row>
        <Row label={t('envForm.kind.label')}>
          <Select
            value={env.kind}
            onChange={setKind}
            options={[
              { value: 'managed', label: t('envForm.kind.managed') },
              { value: 'self-hosted', label: t('envForm.kind.selfHosted') }
            ]}
          />
        </Row>

        {env.kind === 'managed' ? (
          <>
            <Row label={t('envForm.projectRef.label')} hint="supabase.com/dashboard/project/<ref>">
              <Input
                value={env.projectRef}
                onChange={(e) => patch<ManagedEnv>({ projectRef: e.target.value.trim() })}
                className="font-mono"
                placeholder="odbyilfpdvzaccrfzsfw"
              />
            </Row>
            <Row
              label={t('envForm.accessToken.label')}
              hint={env.hasToken ? t('envForm.accessToken.hintSaved') : t('envForm.accessToken.hintNew')}
            >
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono"
                placeholder={env.hasToken ? '••••••••' : 'sbp_…'}
              />
            </Row>
          </>
        ) : (
          <>
            <Row label={t('envForm.sshHost.label')} hint={t('envForm.sshHost.hint')}>
              <Input
                value={env.sshHost}
                onChange={(e) => patch<SelfHostedEnv>({ sshHost: e.target.value.trim() })}
                className="font-mono"
                placeholder="root@my-contabo-server"
              />
            </Row>
            <Row label={t('envForm.sshPort.label')}>
              <Input
                type="number"
                value={String(env.sshPort)}
                onChange={(e) => patch<SelfHostedEnv>({ sshPort: Number(e.target.value) || 22 })}
                className="max-w-[120px]"
              />
            </Row>
            <Row label={t('envForm.sshKey.label')} hint={t('envForm.sshKey.hint')}>
              <Input
                value={env.sshKeyPath}
                onChange={(e) => patch<SelfHostedEnv>({ sshKeyPath: e.target.value })}
                className="font-mono"
                placeholder="~/.ssh/id_ed25519"
              />
            </Row>
            <Row label={t('envForm.dbContainer.label')} hint={t('envForm.dbContainer.hint')}>
              <Input
                value={env.dbContainer}
                onChange={(e) => patch<SelfHostedEnv>({ dbContainer: e.target.value.trim() })}
                className="font-mono"
                placeholder="supabase-db-xxxxxxxx"
              />
            </Row>
            <Row label={t('envForm.remoteDir.label')} hint={t('envForm.remoteDir.hint')}>
              <Input
                value={env.remoteDir}
                onChange={(e) => patch<SelfHostedEnv>({ remoteDir: e.target.value.trim() })}
                className="font-mono"
              />
            </Row>
            <Row label={t('envForm.functionsContainer.label')} hint={t('envForm.functionsContainer.hint')}>
              <Input
                value={env.functionsContainer}
                onChange={(e) => patch<SelfHostedEnv>({ functionsContainer: e.target.value.trim() })}
                className="font-mono"
                placeholder="supabase-edge-functions-xxxxxxxx"
              />
            </Row>
            <Row label={t('envForm.apiUrl.label')}>
              <Input
                value={env.apiUrl}
                onChange={(e) => patch<SelfHostedEnv>({ apiUrl: e.target.value.trim() })}
                className="font-mono"
                placeholder="https://api.next-cv.app"
              />
            </Row>
            <Row label={t('envForm.siteUrl.label')}>
              <Input
                value={env.siteUrl}
                onChange={(e) => patch<SelfHostedEnv>({ siteUrl: e.target.value.trim() })}
                className="font-mono"
                placeholder="https://next-cv.app"
              />
            </Row>
            <Row label={t('envForm.backupDir.label')}>
              <Input
                value={env.backupDir}
                onChange={(e) => patch<SelfHostedEnv>({ backupDir: e.target.value.trim() })}
                className="font-mono"
              />
            </Row>
            <Row label={t('envForm.backupRetention.label')}>
              <Input
                type="number"
                value={String(env.backupRetentionDays)}
                onChange={(e) =>
                  patch<SelfHostedEnv>({ backupRetentionDays: Number(e.target.value) || 14 })
                }
                className="max-w-[120px]"
              />
            </Row>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  )
}
