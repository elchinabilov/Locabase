/**
 * "Sign In / Providers" — the OAuth providers `config.toml` knows about.
 *
 * Every field is edited as a draft and written in one patch, with a diff shown
 * first: this file is hand-edited by people too, and a silent overwrite is the
 * one thing the config editor must never do.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ConfigField, ConfigPatch, FieldValue, PatchPreview, Project } from '@shared/types'
import { AUTH_PROVIDERS, callbackUrl, envVarName } from '@shared/providers'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { useT, type TranslationKey } from '../i18n'
import { Badge, Button, Card, ErrorNote, Modal, SkeletonList, Toggle } from '../components/ui'
import { DiffView } from '../components/diff-view'
import { draftFrom, FieldEditor, sameDraft, toPatchValue, type Draft } from '../components/field-editor'

const FIELD_LABEL_KEY: Record<string, TranslationKey> = {
  client_id: 'auth.fieldLabel.clientId',
  secret: 'auth.fieldLabel.secret',
  url: 'auth.fieldLabel.url',
  redirect_uri: 'auth.fieldLabel.redirectUri',
  skip_nonce_check: 'auth.fieldLabel.skipNonceCheck',
  email_optional: 'auth.fieldLabel.emailOptional'
}

/** `AUTH_PROVIDERS` carries no `hint` (so `shared/` stays free of i18n) — it is read here. */
const PROVIDER_HINT_KEY: Record<string, TranslationKey> = {
  apple: 'auth.providerHint.apple',
  azure: 'auth.providerHint.azure',
  github: 'auth.providerHint.github',
  gitlab: 'auth.providerHint.gitlab',
  google: 'auth.providerHint.google',
  keycloak: 'auth.providerHint.keycloak',
  linkedin_oidc: 'auth.providerHint.linkedinOidc'
}

/** Builds a `ConfigField` from a provider field — FieldEditor is the same component. */
function fieldFor(providerId: string, name: string, t: (k: TranslationKey) => string): ConfigField {
  const isBool = name === 'skip_nonce_check' || name === 'email_optional'
  return {
    path: `auth.external.${providerId}.${name}`,
    type: isBool ? 'boolean' : 'string',
    group: 'Auth',
    label: FIELD_LABEL_KEY[name] ? t(FIELD_LABEL_KEY[name]) : name,
    envAllowed: !isBool,
    secret: name === 'secret',
    restartRequired: true,
    default: isBool ? false : ''
  }
}

export function AuthProviders({ project }: { project: Project }): ReactNode {
  const t = useT()
  const doc = useQuery('config:read', { id: project.id })
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
      const field = fieldFor(segs[2]!, segs.slice(3).join('.'), t)
      if (!sameDraft(d, draftFrom(values[path], field))) {
        out.push({ path, value: toPatchValue(d) })
      }
    }
    return out
  }, [drafts, enabledOverride, values, t])

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
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-h3 font-medium">{t('auth.providers')}</h1>
        <div className="flex-1" />
        {patches.length > 0 && (
          <>
            <Badge tone="ok">{t('auth.changeCount', { count: patches.length })}</Badge>
            <Button
              onClick={() => {
                setDrafts({})
                setEnabledOverride({})
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                void call('config:preview', { id: project.id, patches })
                  .then(setPreview)
                  .catch((e: Error) => setError(e.message))
              }
            >
              {t('auth.saveEllipsis')}
            </Button>
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3.5 py-2.5">
            <span className="text-note text-muted">Callback URL</span>
            <code className="min-w-0 flex-1 truncate font-mono text-note text-accent">{cb}</code>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(cb)
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              }}
            >
              {copied ? t('auth.copied') : t('dashboard.quickLinks.copy')}
            </Button>
          </div>
          <p className="-mt-1 px-1 text-small leading-relaxed text-muted">{t('auth.callbackHint')}</p>

          {doc.loading && (
            <Card title={t('auth.providers')}>
              <SkeletonList rows={5} avatar trailing />
            </Card>
          )}
          {doc.error && <ErrorNote>{doc.error}</ErrorNote>}
          {error && <ErrorNote>{error}</ErrorNote>}

          {values && (
            <Card
              title={t('auth.providers')}
              subtitle={t('auth.activeCount', {
                active: AUTH_PROVIDERS.filter((p) => isEnabled(p.id)).length,
                total: AUTH_PROVIDERS.length
              })}
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
                          <span className={cx('text-ui', on ? 'text-text' : 'text-muted')}>
                            {meta.label}
                          </span>
                          <code className="font-mono text-badge text-faint">{meta.id}</code>
                          {on && !configured && <Badge tone="warn">{t('auth.noKey')}</Badge>}
                        </button>
                        <button
                          onClick={() => setOpen(expanded ? null : meta.id)}
                          className="text-meta text-muted hover:text-text"
                        >
                          {expanded ? t('auth.collapse') : t('auth.settings')}
                        </button>
                      </div>

                      {expanded && (
                        <div className="border-t border-line-soft bg-sunken pb-2">
                          {PROVIDER_HINT_KEY[meta.id] && (
                            <p className="px-3.5 pt-2.5 text-small leading-relaxed text-muted">
                              {t(PROVIDER_HINT_KEY[meta.id]!)}
                            </p>
                          )}
                          {meta.fields.map((name) => {
                            const field = fieldFor(meta.id, name, t)
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
                                    title={t('auth.bindEnvTitle')}
                                    onClick={() =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [field.path]: {
                                          kind: 'env',
                                          value: envVarName(meta.id, name)
                                        }
                                      }))
                                    }
                                    className="mt-3 mr-3 shrink-0 rounded border border-line px-1.5 py-0.5 text-micro text-muted hover:text-accent"
                                  >
                                    {t('auth.defaultName')}
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
          title={t('auth.diffTitle')}
          onClose={() => setPreview(null)}
          footer={
            <>
              <Button onClick={() => setPreview(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => void save()} loading={saving}>
                {t('auth.writeFile')}
              </Button>
            </>
          }
        >
          <p className="mb-3 text-note text-muted">
            {t('auth.diffChangedLines', { count: preview.changedLines })}
            {preview.restartRequired && <span className="text-warn"> {t('auth.restartRequired')}</span>}
          </p>
          <DiffView before={preview.before} after={preview.after} />
        </Modal>
      )}
    </div>
  )
}
