import { useCallback, useState, type ReactNode } from 'react'
import type { Project } from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { Badge, Button, Card, ErrorNote, Input, Modal, Select, SkeletonList, Toggle } from '../components/ui'

export function FunctionsRoute({ project }: { project: Project }): ReactNode {
  const [envId, setEnvId] = useState<string>(project.environments[0]?.id ?? '')
  const list = useQuery('functions:list', { id: project.id, envId: envId || null }, [project.id, envId])
  const [serving, setServing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deploying, setDeploying] = useState<string | null>(null)
  const [confirmDeploy, setConfirmDeploy] = useState<string[] | null>(null)

  const items = list.data ?? []
  const local = items.filter((f) => f.path !== '')
  const stale = local.filter((f) => envId && f.remote === null)

  const toggleServe = useCallback(async () => {
    const next = !serving
    await call('functions:serve', { id: project.id, on: next })
    setServing(next)
  }, [project.id, serving])

  const setVerify = useCallback(
    async (name: string, verifyJwt: boolean) => {
      setError(null)
      try {
        await call('functions:setVerifyJwt', { id: project.id, name, verifyJwt })
        list.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [project.id, list]
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-[15px] font-medium">Funksiyalar</h1>
        <div className="w-56">
          <Select
            value={envId}
            onChange={setEnvId}
            options={[
              { value: '', label: 'Yalnız lokal' },
              ...project.environments.map((e) => ({ value: e.id, label: `↔ ${e.name}` }))
            ]}
          />
        </div>
        <div className="flex-1" />
        <Button onClick={() => void toggleServe()} variant={serving ? 'primary' : 'subtle'}>
          {serving ? 'serve işləyir — dayandır' : 'lokal serve'}
        </Button>
        <Button onClick={() => setCreating(true)}>+ funksiya</Button>
        {envId && local.length > 0 && (
          <Button variant="primary" onClick={() => setConfirmDeploy(local.map((f) => f.name))}>
            Hamısını deploy
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          {list.error && <ErrorNote>{list.error}</ErrorNote>}

          {envId && stale.length > 0 && (
            <div className="rounded-md border border-[#1d3a55] bg-[#101d2a] px-3.5 py-2 text-[12px] text-info">
              {stale.length} funksiya remote-da yoxdur: {stale.map((f) => f.name).join(', ')}
            </div>
          )}

          <Card title={`${items.length} funksiya`} subtitle="supabase/functions">
            {list.loading && <SkeletonList rows={4} trailing />}
            {!list.loading && items.length === 0 && (
              <p className="px-3.5 py-6 text-center text-[12px] text-muted">
                Funksiya yoxdur. «+ funksiya» ilə şablondan yarat.
              </p>
            )}
            <ul className="divide-y divide-line-soft">
              {items.map((fn) => (
                <li key={fn.name} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-[12.5px] text-text">{fn.name}</code>
                      {fn.path === '' && <Badge tone="warn">yalnız remote</Badge>}
                      {envId && fn.path !== '' && fn.remote === null && (
                        <Badge tone="info">deploy olunmayıb</Badge>
                      )}
                      {fn.remote?.version && <Badge tone="muted">v{fn.remote.version}</Badge>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 font-mono text-[10.5px] text-[#54677a]">
                      {fn.path !== '' && (
                        <>
                          <span>{fn.entrypoint}</span>
                          <span>{fn.files} fayl</span>
                          <span>#{fn.hash}</span>
                        </>
                      )}
                      {fn.remote?.status && <span>remote: {fn.remote.status}</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cx('text-[11px]', fn.verifyJwt ? 'text-muted' : 'text-warn')}
                      title="Bazadan pg_net ilə çağrılan funksiyalarda JWT yoxlaması söndürülməlidir"
                    >
                      verify_jwt
                    </span>
                    <Toggle
                      checked={fn.verifyJwt}
                      disabled={fn.path === ''}
                      onChange={(v) => void setVerify(fn.name, v)}
                    />
                    {envId && fn.path !== '' && (
                      <Button
                        loading={deploying === fn.name}
                        onClick={() => setConfirmDeploy([fn.name])}
                      >
                        deploy
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <p className="px-1 text-[11.5px] leading-relaxed text-muted">
            `verify_jwt` söndürüləndə `config.toml`-a `[functions.&lt;ad&gt;]` bloku yazılır — həm
            lokal serve, həm də deploy eyni ayarı görür.
          </p>
        </div>
      </div>

      {creating && (
        <Modal
          title="Yeni funksiya"
          onClose={() => setCreating(false)}
          footer={null}
        >
          <NewFunction
            onCreate={async (name) => {
              await call('functions:create', { id: project.id, name })
              setCreating(false)
              list.refresh()
            }}
            onClose={() => setCreating(false)}
          />
        </Modal>
      )}

      {confirmDeploy && envId && (
        <Modal
          title={`Deploy — ${confirmDeploy.length} funksiya`}
          onClose={() => setConfirmDeploy(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDeploy(null)}>Ləğv et</Button>
              <Button
                variant="primary"
                loading={deploying !== null}
                onClick={() => {
                  setDeploying(confirmDeploy.join(','))
                  void call('sync:deploy', {
                    id: project.id,
                    confirm: project.name,
                    plan: {
                      envId,
                      steps: ['functions'],
                      migrations: [],
                      functions: confirmDeploy,
                      secrets: [],
                      dryRun: false
                    }
                  })
                    .then((res) => {
                      if (!res.ok) setError(res.error ?? 'Deploy uğursuz oldu')
                      setConfirmDeploy(null)
                    })
                    .catch((e: Error) => setError(e.message))
                    .finally(() => {
                      setDeploying(null)
                      list.refresh()
                    })
                }}
              >
                Deploy et
              </Button>
            </>
          }
        >
          <p className="text-[12.5px] leading-relaxed">
            {confirmDeploy.join(', ')} —{' '}
            {project.environments.find((e) => e.id === envId)?.name} mühitinə göndəriləcək.
            Self-hosted mühitdə qovluq rsync olunur və edge runtime konteyneri restart edilir.
          </p>
        </Modal>
      )}
    </div>
  )
}

function NewFunction({
  onCreate,
  onClose
}: {
  onCreate: (name: string) => Promise<void>
  onClose: () => void
}): ReactNode {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^[a-z][a-z0-9-]*$/.test(name)

  return (
    <div>
      <label className="mb-1 block text-[12px] text-muted">Ad</label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="notify-message"
        className="font-mono"
        autoFocus
      />
      <p className="mt-2 text-[11.5px] text-muted">
        `supabase/functions/{name || 'ad'}/index.ts` şablondan yaradılır.
      </p>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Ləğv et</Button>
        <Button
          variant="primary"
          disabled={!valid}
          loading={busy}
          onClick={() => {
            setBusy(true)
            setError(null)
            void onCreate(name)
              .catch((e: Error) => setError(e.message))
              .finally(() => setBusy(false))
          }}
        >
          Yarat
        </Button>
      </div>
    </div>
  )
}
