import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ConfigField, ConfigPatch, FieldValue, PatchPreview, Project } from '@shared/types'
import { AUTH_PROVIDERS, callbackUrl, envVarName } from '@shared/providers'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { Badge, Button, Card, ErrorNote, Modal, SkeletonList, Toggle } from '../components/ui'
import { DiffView } from '../components/diff-view'
import { draftFrom, FieldEditor, sameDraft, toPatchValue, type Draft } from '../components/field-editor'

const FIELD_LABEL: Record<string, string> = {
  client_id: 'Client ID',
  secret: 'Client secret',
  url: 'Provider URL',
  redirect_uri: 'Redirect URI (override)',
  skip_nonce_check: 'Nonce yoxlamasını atla',
  email_optional: 'E-poçt məcburi deyil'
}

/** Provider sahəsindən `ConfigField` düzəldir — FieldEditor eyni komponentdir. */
function fieldFor(providerId: string, name: string): ConfigField {
  const isBool = name === 'skip_nonce_check' || name === 'email_optional'
  return {
    path: `auth.external.${providerId}.${name}`,
    type: isBool ? 'boolean' : 'string',
    group: 'Auth',
    label: FIELD_LABEL[name] ?? name,
    envAllowed: !isBool,
    secret: name === 'secret',
    restartRequired: true,
    default: isBool ? false : ''
  }
}

export function AuthRoute({ project }: { project: Project }): ReactNode {
  const doc = useQuery('config:read', { id: project.id }, [project.id])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [enabledOverride, setEnabledOverride] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState<PatchPreview | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const values = doc.data?.values

  const apiUrl = useMemo(() => {
    const port = values?.['api.port']
    const tls = values?.['api.tls.enabled']
    const scheme = tls?.value === true ? 'https' : 'http'
    return `${scheme}://127.0.0.1:${port?.present ? String(port.value) : '54321'}`
  }, [values])

  const isEnabled = useCallback(
    (id: string): boolean => {
      if (id in enabledOverride) return enabledOverride[id]!
      return values?.[`auth.external.${id}.enabled`]?.value === true
    },
    [enabledOverride, values]
  )

  const patches: ConfigPatch[] = useMemo(() => {
    if (!values) return []
    const out: ConfigPatch[] = []
    for (const [id, on] of Object.entries(enabledOverride)) {
      if ((values[`auth.external.${id}.enabled`]?.value === true) !== on) {
        out.push({ path: `auth.external.${id}.enabled`, value: on })
      }
    }
    for (const [path, d] of Object.entries(drafts)) {
      const segs = path.split('.')
      const field = fieldFor(segs[2]!, segs.slice(3).join('.'))
      if (!sameDraft(d, draftFrom(values[path], field))) {
        out.push({ path, value: toPatchValue(d) })
      }
    }
    return out
  }, [drafts, enabledOverride, values])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await call('config:write', { id: project.id, patches })
      setDrafts({})
      setEnabledOverride({})
      setPreview(null)
      doc.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [project.id, patches, doc])

  const cb = callbackUrl(apiUrl)

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-[15px] font-medium">Auth providerlər</h1>
        <div className="flex-1" />
        {patches.length > 0 && (
          <>
            <Badge tone="ok">{patches.length} dəyişiklik</Badge>
            <Button
              onClick={() => {
                setDrafts({})
                setEnabledOverride({})
              }}
            >
              Ləğv et
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                void call('config:preview', { id: project.id, patches })
                  .then(setPreview)
                  .catch((e: Error) => setError(e.message))
              }
            >
              Yadda saxla…
            </Button>
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3.5 py-2.5">
            <span className="text-[12px] text-muted">Callback URL</span>
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-accent">{cb}</code>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(cb)
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              }}
            >
              {copied ? 'kopyalandı ✓' : 'kopyala'}
            </Button>
          </div>
          <p className="-mt-1 px-1 text-[11.5px] leading-relaxed text-muted">
            Bu ünvan provider konsoluna yapışdırılır (Google Cloud Console → Credentials, GitHub →
            OAuth Apps, LinkedIn → Auth). Lokal port dəyişəndə bu URL də dəyişir — provider tərəfdə
            də yeniləməyi unutma.
          </p>

          {doc.loading && (
            <Card title="Providerlər">
              <SkeletonList rows={5} avatar trailing />
            </Card>
          )}
          {doc.error && <ErrorNote>{doc.error}</ErrorNote>}
          {error && <ErrorNote>{error}</ErrorNote>}

          {values && (
            <Card
              title="Providerlər"
              subtitle={`${AUTH_PROVIDERS.filter((p) => isEnabled(p.id)).length} aktiv / ${AUTH_PROVIDERS.length}`}
            >
              <ul className="divide-y divide-line-soft">
                {AUTH_PROVIDERS.map((meta) => {
                  const on = isEnabled(meta.id)
                  const expanded = open === meta.id
                  const configured =
                    values[`auth.external.${meta.id}.client_id`]?.present === true
                  return (
                    <li key={meta.id}>
                      <div className="flex items-center gap-3 px-3.5 py-2">
                        <Toggle
                          checked={on}
                          onChange={(v) => {
                            setEnabledOverride((prev) => ({ ...prev, [meta.id]: v }))
                            if (v) setOpen(meta.id)
                          }}
                        />
                        <button
                          onClick={() => setOpen(expanded ? null : meta.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className={cx('text-[12.5px]', on ? 'text-text' : 'text-muted')}>
                            {meta.label}
                          </span>
                          <code className="font-mono text-[10.5px] text-[#54677a]">{meta.id}</code>
                          {on && !configured && <Badge tone="warn">açar yoxdur</Badge>}
                        </button>
                        <button
                          onClick={() => setOpen(expanded ? null : meta.id)}
                          className="text-[11px] text-muted hover:text-text"
                        >
                          {expanded ? 'bağla' : 'ayarlar'}
                        </button>
                      </div>

                      {expanded && (
                        <div className="border-t border-line-soft bg-[#0d141b] pb-2">
                          {meta.hint && (
                            <p className="px-3.5 pt-2.5 text-[11.5px] leading-relaxed text-muted">
                              {meta.hint}
                            </p>
                          )}
                          {meta.fields.map((name) => {
                            const field = fieldFor(meta.id, name)
                            const original: FieldValue | undefined = values[field.path]
                            return (
                              <div key={field.path} className="flex items-start">
                                <div className="min-w-0 flex-1">
                                  <FieldEditor
                                    field={field}
                                    original={original}
                                    draft={drafts[field.path] ?? draftFrom(original, field)}
                                    onChange={(d) =>
                                      setDrafts((prev) => ({ ...prev, [field.path]: d }))
                                    }
                                  />
                                </div>
                                {field.envAllowed && (
                                  <button
                                    title=".env dəyişəninə bağla (CLI-nin gözlədiyi adla)"
                                    onClick={() =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [field.path]: {
                                          kind: 'env',
                                          value: envVarName(meta.id, name)
                                        }
                                      }))
                                    }
                                    className="mt-3 mr-3 shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-accent"
                                  >
                                    standart ad
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {preview && (
        <Modal
          wide
          title="Auth dəyişiklikləri"
          onClose={() => setPreview(null)}
          footer={
            <>
              <Button onClick={() => setPreview(null)}>Ləğv et</Button>
              <Button variant="primary" onClick={() => void save()} loading={saving}>
                Faylı yaz
              </Button>
            </>
          }
        >
          <p className="mb-3 text-[12px] text-muted">
            {preview.changedLines} sətir dəyişir. Provider açarları `env()`-ə bağlıdırsa dəyərləri
            Secrets ekranından yaz.
            {preview.restartRequired && <span className="text-warn"> Restart tələb olunur.</span>}
          </p>
          <DiffView before={preview.before} after={preview.after} />
        </Modal>
      )}
    </div>
  )
}
