import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ConfigField, ConfigPatch, PatchPreview, Project } from '@shared/types'
import { CONFIG_FIELDS, CONFIG_GROUPS } from '@shared/config-schema'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { useI18n } from '../i18n'
import { Badge, Button, Card, ErrorNote, Modal, Skeleton } from '../components/ui'
import { DiffView } from '../components/diff-view'
import {
  draftFrom,
  FieldEditor,
  sameDraft,
  toPatchValue,
  type Draft
} from '../components/field-editor'

/**
 * `field.label`/`field.help` are the Azerbaijani source (`config-schema.ts`) —
 * before rendering, a translation is looked up under `config.fields.<path>.*`,
 * and the AZ text stays when there is none. The path itself contains dots, so it
 * cannot satisfy `t()`'s static `TranslationKey` check — `tDynamic` is used.
 */
function localize(field: ConfigField, tDynamic: (k: string) => string | undefined): ConfigField {
  const label = tDynamic(`config.fields.${field.path}.label`)
  const help = tDynamic(`config.fields.${field.path}.help`)
  if (label === undefined && help === undefined) return field
  return { ...field, label: label ?? field.label, help: help ?? field.help }
}

export function ConfigRoute({ project }: { project: Project }): ReactNode {
  const { t, tDynamic } = useI18n()
  const doc = useQuery('config:read', { id: project.id })
  const [group, setGroup] = useState<string>('General')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [preview, setPreview] = useState<PatchPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedRestart, setSavedRestart] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [filter, setFilter] = useState('')

  const values = doc.data?.values

  const patches: ConfigPatch[] = useMemo(() => {
    if (!values) return []
    return Object.entries(drafts)
      .filter(([path, d]) => {
        const field = CONFIG_FIELDS.find((f) => f.path === path)
        if (!field) return false
        return !sameDraft(d, draftFrom(values[path], field))
      })
      .map(([path, d]) => ({ path, value: toPatchValue(d) }))
  }, [drafts, values])

  const setDraft = useCallback((path: string, d: Draft) => {
    setDrafts((prev) => ({ ...prev, [path]: d }))
  }, [])

  const openPreview = useCallback(async () => {
    setError(null)
    try {
      setPreview(await call('config:preview', { id: project.id, patches }))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [project.id, patches])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await call('config:write', { id: project.id, patches })
      setPreview(null)
      setDrafts({})
      doc.refresh()
      setSavedRestart(res.restartRequired)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [project.id, patches, doc])

  const restart = useCallback(async () => {
    setRestarting(true)
    try {
      await call('stack:restart', { id: project.id })
      setSavedRestart(false)
    } finally {
      setRestarting(false)
    }
  }, [project.id])

  const localized = useMemo(() => CONFIG_FIELDS.map((f) => localize(f, tDynamic)), [tDynamic])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (q) {
      return localized.filter(
        (f) => f.path.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
      )
    }
    return localized.filter((f) => f.group === group)
  }, [localized, group, filter])

  const dirtyByGroup = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of patches) {
      const g = CONFIG_FIELDS.find((f) => f.path === p.path)?.group
      if (g) map[g] = (map[g] ?? 0) + 1
    }
    return map
  }, [patches])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-h2 font-medium">{t('config.title')}</h1>
        <span className="font-mono text-meta text-muted">supabase/config.toml</span>
        <div className="flex-1" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('config.searchPlaceholder')}
          className="w-52 rounded border border-line bg-sunken px-2 py-1 text-small outline-none focus:border-accent-dim"
        />
        {patches.length > 0 && (
          <>
            <Badge tone="ok">{t('auth.changeCount', { count: patches.length })}</Badge>
            <Button onClick={() => setDrafts({})}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void openPreview()}>
              {t('auth.saveEllipsis')}
            </Button>
          </>
        )}
      </header>

      {savedRestart && (
        <div className="flex items-center gap-3 border-b border-warn-border bg-warn-bg px-4 py-2 text-note text-warn">
          {t('config.savedRestartMessage')}
          <Button onClick={() => void restart()} loading={restarting}>
            {t('dashboard.needsRestart.now')}
          </Button>
          <button onClick={() => setSavedRestart(false)} className="text-muted hover:text-text">
            {t('dashboard.needsRestart.later')}
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 pt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="w-[190px] shrink-0 overflow-auto border-r border-line p-2">
          {CONFIG_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => {
                setGroup(g)
                setFilter('')
              }}
              className={cx(
                'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-note',
                !filter && group === g
                  ? 'bg-panel-2 text-text'
                  : 'text-muted hover:bg-panel-2 hover:text-text'
              )}
            >
              {g}
              {dirtyByGroup[g] && (
                <span className="rounded bg-accent-dim px-1 text-micro text-accent">
                  {dirtyByGroup[g]}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-auto p-3">
          {doc.loading && (
            <Card title={t('common.loading')}>
              <div className="divide-y divide-line-soft">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(180px,260px)_1fr] items-start gap-4 px-3.5 py-2.5"
                  >
                    <div className="flex flex-col gap-1.5 pt-1">
                      <Skeleton h={10} w={`${72 - (i % 3) * 14}%`} delay={i * 80} />
                      <Skeleton h={8} w="90%" delay={i * 80 + 40} />
                    </div>
                    <Skeleton h={30} delay={i * 80 + 60} className="rounded-md" />
                  </div>
                ))}
              </div>
            </Card>
          )}
          {doc.error && <ErrorNote>{doc.error}</ErrorNote>}
          {values && (
            <Card
              title={filter ? t('config.searchResults', { count: shown.length }) : group}
              subtitle={filter ? undefined : t('config.defaultHint')}
            >
              <div className="divide-y divide-line-soft">
                {shown.map((field) => (
                  <FieldEditor
                    key={field.path}
                    field={field}
                    original={values[field.path]}
                    draft={drafts[field.path] ?? draftFrom(values[field.path], field)}
                    onChange={(d) => setDraft(field.path, d)}
                  />
                ))}
                {shown.length === 0 && (
                  <p className="px-3.5 py-6 text-center text-note text-muted">
                    {t('config.fieldNotFound')}
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {preview && (
        <Modal
          wide
          title={t('config.previewTitle')}
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
            {t('config.previewChangedLines', { count: preview.changedLines })}{' '}
            <code>config.toml.bak</code> {t('config.previewBackupSuffix')}
            {preview.restartRequired && (
              <span className="text-warn"> {t('config.previewRestartRequired')}</span>
            )}
          </p>
          <DiffView before={preview.before} after={preview.after} />
        </Modal>
      )}
    </div>
  )
}
