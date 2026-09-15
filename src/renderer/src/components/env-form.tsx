import { useState, type ReactNode } from 'react'
import type { ManagedEnv, Project, RemoteEnv, SecretMap, SelfHostedEnv } from '@shared/types'
import { isServiceId, servicePaths, serviceIdOf } from '@shared/coolify'
import { call } from '../lib/ipc'
import { useAction } from '../lib/use-action'
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
  const { run, busy, error } = useAction()

  const setKind = (kind: string): void => {
    setEnv((prev) =>
      kind === 'managed'
        ? { ...emptyManaged(), id: prev.id, name: prev.name }
        : { ...emptySelfHosted(), id: prev.id, name: prev.name }
    )
  }

  const patch = <T extends RemoteEnv>(p: Partial<T>): void => setEnv((prev) => ({ ...prev, ...p }))

  const save = async (): Promise<void> => {
    const ok = await run(async () => {
      await call('envs:upsert', { id: project.id, env })
      if (env.kind === 'managed' && token.trim()) {
        await call('envs:setToken', { id: project.id, envId: env.id, token: token.trim() })
      }
      return true
    })
    if (!ok) return
    onSaved()
    onClose()
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
              hint={
                env.hasToken ? t('envForm.accessToken.hintSaved') : t('envForm.accessToken.hintNew')
              }
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
            <ServicePathFields env={env} onPatch={(p) => patch<SelfHostedEnv>(p)} />
            <Row label={t('envForm.apiUrl.label')}>
              <Input
                value={env.apiUrl}
                onChange={(e) => patch<SelfHostedEnv>({ apiUrl: e.target.value.trim() })}
                className="font-mono"
                placeholder="https://api.next-cv.app"
              />
            </Row>
            <Row label={t('envForm.siteUrl.label')} hint={t('envForm.siteUrl.hint')}>
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

        <SecretMapEditor
          value={env.secretMap ?? {}}
          onChange={(secretMap) => patch<RemoteEnv>({ secretMap })}
        />
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  )
}

/** The three fields a service id derives, in the order they are shown. */
const DERIVED_FIELDS = [
  {
    key: 'dbContainer',
    label: 'envForm.dbContainer.label',
    hint: 'envForm.dbContainer.hint',
    placeholder: 'supabase-db-xxxxxxxx'
  },
  {
    key: 'remoteDir',
    label: 'envForm.remoteDir.label',
    hint: 'envForm.remoteDir.hint',
    placeholder: '/data/coolify/services/abc123'
  },
  {
    key: 'functionsContainer',
    label: 'envForm.functionsContainer.label',
    hint: 'envForm.functionsContainer.hint',
    placeholder: 'supabase-edge-functions-xxxxxxxx'
  }
] as const

type DerivedKey = (typeof DERIVED_FIELDS)[number]['key']

/**
 * The service id, and the three paths it derives.
 *
 * The paths are read-only text while they follow from the id — three inputs
 * holding the same id three times is how they end up disagreeing. Each can be
 * unlocked on its own for a stack that only half matches the layout, and an
 * environment with no recognisable id starts fully unlocked, because then there
 * is nothing to derive them from.
 *
 * The id itself is not stored: it IS those three fields, and a fourth copy would
 * be one more thing that can drift. On reopen it is read back out of them.
 */
function ServicePathFields({
  env,
  onPatch
}: {
  env: SelfHostedEnv
  onPatch: (patch: Partial<SelfHostedEnv>) => void
}): ReactNode {
  const t = useT()
  const [serviceId, setServiceId] = useState(() => serviceIdOf(env))
  const [unlocked, setUnlocked] = useState<ReadonlySet<DerivedKey>>(new Set())

  const derived = isServiceId(serviceId) ? servicePaths(serviceId) : null

  const changeId = (raw: string): void => {
    const next = raw.trim()
    setServiceId(next)
    if (!isServiceId(next)) return
    // A field the user took over is left alone — otherwise editing the id would
    // silently undo the override they just made.
    const paths = servicePaths(next)
    const patch: Partial<SelfHostedEnv> = {}
    for (const f of DERIVED_FIELDS) if (!unlocked.has(f.key)) patch[f.key] = paths[f.key]
    onPatch(patch)
  }

  return (
    <>
      <Row label={t('envForm.serviceId.label')} hint={t('envForm.serviceId.hint')}>
        <Input
          value={serviceId}
          onChange={(e) => changeId(e.target.value)}
          className="font-mono"
          placeholder="m2c95warvc2gnjnscj1znvh8"
        />
      </Row>

      {DERIVED_FIELDS.map((f) => {
        const value = env[f.key]
        const locked = derived !== null && !unlocked.has(f.key)
        return (
          <Row key={f.key} label={t(f.label)} hint={locked ? undefined : t(f.hint)}>
            {locked ? (
              <div className="flex items-start gap-2 pt-1">
                <code className="min-w-0 flex-1 break-all font-mono text-note text-muted">
                  {value}
                </code>
                <button
                  onClick={() => setUnlocked((prev) => new Set(prev).add(f.key))}
                  className="shrink-0 text-meta text-muted hover:text-accent"
                >
                  {t('common.edit').toLowerCase()}
                </button>
              </div>
            ) : (
              <Input
                value={value}
                onChange={(e) => onPatch({ [f.key]: e.target.value.trim() })}
                className="font-mono"
                placeholder={f.placeholder}
              />
            )}
          </Row>
        )
      })}
    </>
  )
}

/**
 * The local→remote rename table.
 *
 * Kept as an array while it is being edited rather than as the `Record` it is
 * stored in: re-keying an object on every keystroke loses focus and reorders the
 * rows under the cursor. The object is rebuilt on each change, empty and
 * identity rows dropped — a mapping to the same name is what NOT having a
 * mapping already means.
 */
function SecretMapEditor({
  value,
  onChange
}: {
  value: SecretMap
  onChange: (value: SecretMap) => void
}): ReactNode {
  const t = useT()
  const [rows, setRows] = useState<Array<{ local: string; remote: string }>>(() =>
    Object.entries(value).map(([local, remote]) => ({ local, remote }))
  )

  const apply = (next: Array<{ local: string; remote: string }>): void => {
    setRows(next)
    const out: SecretMap = {}
    for (const r of next) {
      const local = r.local.trim()
      const remote = r.remote.trim()
      if (local === '' || remote === '' || local === remote) continue
      out[local] = remote
    }
    onChange(out)
  }

  const edit = (i: number, patch: Partial<{ local: string; remote: string }>): void =>
    apply(rows.map((r, j) => (i === j ? { ...r, ...patch } : r)))

  // The same two-column `Row` every other field uses — a full-width block here
  // would sit flush against the modal's left edge while the fields above it are
  // indented, which reads as a different form rather than one more field.
  return (
    <Row label={t('envForm.secretMap.label')} hint={t('envForm.secretMap.hint')}>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            <Input
              value={r.local}
              onChange={(e) => edit(i, { local: e.target.value.trim() })}
              className="font-mono"
              placeholder={t('envForm.secretMap.localPlaceholder')}
            />
            <span className="text-meta text-faint">→</span>
            <Input
              value={r.remote}
              onChange={(e) => edit(i, { remote: e.target.value.trim() })}
              className="font-mono"
              placeholder={t('envForm.secretMap.remotePlaceholder')}
            />
            <button
              onClick={() => apply(rows.filter((_, j) => j !== i))}
              className="px-1 text-meta text-muted hover:text-danger"
            >
              {t('common.delete').toLowerCase()}
            </button>
          </div>
        ))}
        <div>
          <Button onClick={() => setRows([...rows, { local: '', remote: '' }])}>
            {t('envForm.secretMap.add')}
          </Button>
        </div>
      </div>
    </Row>
  )
}
