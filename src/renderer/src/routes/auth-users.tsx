/**
 * "Users" — the GoTrue user table, read straight from `auth.users`.
 *
 * Read-only on purpose. Creating and deleting users properly means the admin
 * API (password hashing, identity rows, audit entries); writing those tables by
 * hand produces users that half work. Everything here is inspection: who
 * signed up, through which provider, when they last came back.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AuthUser,
  AuthUserSort,
  AuthUserStatus,
  Project
} from '@shared/types'
import { call, useQuery } from '../lib/ipc'
import { cx } from '../lib/format'
import { useI18n, useT, type TranslationKey } from '../i18n'
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Input,
  Modal,
  Pager,
  Select,
  SkeletonTable,
  formatCount
} from '../components/ui'
import { EnvPicker, RemoteNote, envOf, useDbGate } from '../components/env-picker'

const PAGE_SIZES = [25, 50, 100, 500]

const STATUSES: Array<{ id: AuthUserStatus; key: TranslationKey }> = [
  { id: 'all', key: 'authUsers.status.all' },
  { id: 'confirmed', key: 'authUsers.status.confirmed' },
  { id: 'unconfirmed', key: 'authUsers.status.unconfirmed' },
  { id: 'anonymous', key: 'authUsers.status.anonymous' },
  { id: 'banned', key: 'authUsers.status.banned' }
]

const SORTS: Array<{ id: AuthUserSort; key: TranslationKey }> = [
  { id: 'created_desc', key: 'authUsers.sort.createdDesc' },
  { id: 'created_asc', key: 'authUsers.sort.createdAsc' },
  { id: 'signin_desc', key: 'authUsers.sort.signinDesc' },
  { id: 'signin_asc', key: 'authUsers.sort.signinAsc' },
  { id: 'email_asc', key: 'authUsers.sort.emailAsc' }
]

export function AuthUsers({ project }: { project: Project }): ReactNode {
  const t = useT()
  const { locale } = useI18n()
  const [envId, setEnvId] = useState<string | null>(null)
  const { ready, blocked } = useDbGate(project.id, envId)
  const env = envOf(project, envId)

  const [search, setSearch] = useState('')
  const [provider, setProvider] = useState<string | null>(null)
  const [status, setStatus] = useState<AuthUserStatus>('all')
  const [sort, setSort] = useState<AuthUserSort>('created_desc')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  // Typing shouldn't fire a query per keystroke; the list catches up shortly
  // after the typing stops.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(id)
  }, [search])

  // Any change to the filters invalidates the page number — page 4 of the old
  // result set is meaningless against the new one.
  useEffect(() => setPage(0), [debounced, provider, status, sort, pageSize, envId])

  const users = useQuery(
    'auth:users',
    { id: project.id, envId, search: debounced, provider, status, sort, page, pageSize },
    [project.id, envId, debounced, provider, status, sort, page, pageSize],
    { enabled: ready }
  )

  const rows = users.data?.rows ?? []
  const filtered = status !== 'all' || provider !== null || debounced.trim().length > 0

  const providerOptions = useMemo(
    () => [
      { value: '', label: t('authUsers.allProviders') },
      ...(users.data?.providers ?? []).map((p) => ({ value: p, label: providerLabel(p) }))
    ],
    [users.data?.providers, t]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <h1 className="text-h3 font-medium">{t('authUsers.title')}</h1>
        {users.data && (
          <span className="text-small text-muted">
            {formatCount(users.data.total, locale)}
          </span>
        )}
        <EnvPicker project={project} envId={envId} onChange={setEnvId} />
        <div className="flex-1" />
        <Button onClick={users.refresh} loading={users.loading}>
          ↻
        </Button>
      </header>

      {env && <RemoteNote env={env} />}
      {blocked}

      {ready && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2">
            <div className="w-64">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('authUsers.searchPlaceholder')}
              />
            </div>
            <div className="w-44">
              <Select
                value={provider ?? ''}
                onChange={(v) => setProvider(v === '' ? null : v)}
                options={providerOptions}
              />
            </div>
            <div className="w-40">
              <Select
                value={status}
                onChange={(v) => setStatus(v as AuthUserStatus)}
                options={STATUSES.map((s) => ({ value: s.id, label: t(s.key) }))}
              />
            </div>
            <div className="w-48">
              <Select
                value={sort}
                onChange={(v) => setSort(v as AuthUserSort)}
                options={SORTS.map((s) => ({ value: s.id, label: t(s.key) }))}
              />
            </div>
            <div className="flex-1" />
            <div className="w-[86px]">
              <Select
                value={String(pageSize)}
                onChange={(v) => setPageSize(Number(v))}
                options={PAGE_SIZES.map((n) => ({
                  value: String(n),
                  label: t('sql.rowCount', { count: n })
                }))}
              />
            </div>
            <Pager
              page={page}
              pageSize={pageSize}
              count={rows.length}
              total={users.data?.total ?? null}
              onPage={setPage}
            />
          </div>

          {users.error && (
            <div className="px-4 pt-3">
              <ErrorNote>{users.error}</ErrorNote>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            {users.loading && users.data === null && (
              <SkeletonTable rows={12} cols={5} className="p-1" />
            )}
            {users.data && rows.length === 0 && (
              <Empty
                title={filtered ? t('authUsers.noMatches') : t('authUsers.noUsers')}
                hint={filtered ? t('authUsers.noMatchesHint') : t('authUsers.noUsersHint')}
              />
            )}
            {rows.length > 0 && (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-panel">
                  <tr className="border-b border-line text-badge tracking-wide text-muted uppercase">
                    <Th>{t('authUsers.column.user')}</Th>
                    <Th>{t('authUsers.column.providers')}</Th>
                    <Th>{t('authUsers.column.status')}</Th>
                    <Th>{t('authUsers.column.created')}</Th>
                    <Th>{t('authUsers.column.lastSignIn')}</Th>
                    <Th>{t('authUsers.column.uid')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <UserRow key={u.id} user={u} onOpen={() => setOpenId(u.id)} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {openId && (
        <UserDetail
          projectId={project.id}
          envId={envId}
          userId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- rows */

function Th({ children }: { children: ReactNode }): ReactNode {
  return <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{children}</th>
}

function UserRow({ user, onOpen }: { user: AuthUser; onOpen: () => void }): ReactNode {
  const t = useT()
  const { locale } = useI18n()
  const identifier = user.email ?? user.phone
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-hover"
    >
      <td className="max-w-[280px] truncate px-3 py-2 text-ui">
        {identifier ?? <span className="text-faint italic">{t('authUsers.noIdentifier')}</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {user.providers.length === 0 && <span className="text-faint">—</span>}
          {user.providers.map((p) => (
            <Badge key={p} tone={p === 'email' || p === 'phone' ? 'muted' : 'info'}>
              {providerLabel(p)}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        <StatusBadges user={user} />
      </td>
      <td className="px-3 py-2 text-meta whitespace-nowrap text-muted">
        {stamp(user.createdAt, locale)}
      </td>
      <td className="px-3 py-2 text-meta whitespace-nowrap text-muted">
        {user.lastSignInAt ? stamp(user.lastSignInAt, locale) : <span className="text-faint">—</span>}
      </td>
      <td className="px-3 py-2 font-mono text-meta text-faint">{user.id}</td>
    </tr>
  )
}

/** Only what is worth saying — a plain confirmed user shows nothing at all. */
function StatusBadges({ user }: { user: AuthUser }): ReactNode {
  const t = useT()
  const banned = user.bannedUntil !== null && new Date(user.bannedUntil) > new Date()
  return (
    <div className="flex flex-wrap gap-1">
      {banned && <Badge tone="danger">{t('authUsers.badge.banned')}</Badge>}
      {user.confirmedAt === null && <Badge tone="warn">{t('authUsers.badge.unconfirmed')}</Badge>}
      {user.isAnonymous && <Badge tone="muted">{t('authUsers.badge.anonymous')}</Badge>}
      {user.isSso && <Badge tone="info">SSO</Badge>}
    </div>
  )
}

/* ------------------------------------------------------------------ detail */

function UserDetail({
  projectId,
  envId,
  userId,
  onClose
}: {
  projectId: string
  envId: string | null
  userId: string
  onClose: () => void
}): ReactNode {
  const t = useT()
  const { locale } = useI18n()
  const [copied, setCopied] = useState(false)
  const detail = useQuery('auth:user', { id: projectId, envId, userId }, [projectId, envId, userId])
  const u = detail.data

  return (
    <Modal
      wide
      title={u?.email ?? u?.phone ?? t('authUsers.detailTitle')}
      onClose={onClose}
      footer={
        <>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(userId)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            {copied ? t('auth.copied') : t('authUsers.copyUid')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      {detail.loading && <SkeletonTable rows={6} cols={2} />}
      {detail.error && <ErrorNote>{detail.error}</ErrorNote>}
      {u && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-ui">
            <Field label={t('authUsers.column.uid')} mono>
              {u.id}
            </Field>
            <Field label={t('authUsers.field.email')}>{u.email ?? '—'}</Field>
            <Field label={t('authUsers.field.phone')}>{u.phone ?? '—'}</Field>
            <Field label={t('authUsers.column.status')}>
              <StatusBadges user={u} />
            </Field>
            <Field label={t('authUsers.column.created')}>{stamp(u.createdAt, locale)}</Field>
            <Field label={t('authUsers.column.lastSignIn')}>
              {u.lastSignInAt ? stamp(u.lastSignInAt, locale) : '—'}
            </Field>
            <Field label={t('authUsers.field.confirmed')}>
              {u.confirmedAt ? stamp(u.confirmedAt, locale) : '—'}
            </Field>
          </dl>

          <section>
            <h3 className="mb-1.5 text-small font-medium text-muted">
              {t('authUsers.identities')}
            </h3>
            {u.identities.length === 0 && (
              <p className="text-small text-faint">{t('authUsers.noIdentities')}</p>
            )}
            {u.identities.length > 0 && (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line text-badge tracking-wide text-muted uppercase">
                    <Th>{t('authUsers.column.providers')}</Th>
                    <Th>{t('authUsers.field.providerId')}</Th>
                    <Th>{t('authUsers.field.email')}</Th>
                    <Th>{t('authUsers.column.lastSignIn')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {u.identities.map((i) => (
                    <tr key={`${i.provider}-${i.providerId}`} className="border-b border-line-soft last:border-0">
                      <td className="px-3 py-1.5">
                        <Badge tone={i.provider === 'email' || i.provider === 'phone' ? 'muted' : 'info'}>
                          {providerLabel(i.provider)}
                        </Badge>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-1.5 font-mono text-meta text-muted">
                        {i.providerId ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-meta text-muted">{i.email ?? '—'}</td>
                      <td className="px-3 py-1.5 text-meta whitespace-nowrap text-muted">
                        {i.lastSignInAt ? stamp(i.lastSignInAt, locale) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <Json label={t('authUsers.userMetadata')} value={u.userMetadata} />
          <Json label={t('authUsers.appMetadata')} value={u.appMetadata} />
        </div>
      )}
    </Modal>
  )
}

function Field({
  label,
  mono,
  children
}: {
  label: string
  mono?: boolean
  children: ReactNode
}): ReactNode {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={cx('min-w-0 break-words', mono && 'font-mono text-meta')}>{children}</dd>
    </>
  )
}

function Json({ label, value }: { label: string; value: string | null }): ReactNode {
  const t = useT()
  return (
    <section>
      <h3 className="mb-1.5 text-small font-medium text-muted">{label}</h3>
      <pre className="max-h-56 overflow-auto rounded-md border border-line bg-sunken p-3 font-mono text-meta leading-relaxed whitespace-pre-wrap">
        {value ?? t('authUsers.empty')}
      </pre>
    </section>
  )
}

/* ----------------------------------------------------------------- helpers */

/** `linkedin_oidc` → `LinkedIn OIDC`; anything unknown is title-cased as-is. */
function providerLabel(id: string): string {
  const known: Record<string, string> = {
    email: 'Email',
    phone: 'Phone',
    anonymous: 'Anonymous',
    linkedin_oidc: 'LinkedIn OIDC',
    github: 'GitHub',
    gitlab: 'GitLab',
    google: 'Google',
    apple: 'Apple',
    azure: 'Azure',
    bitbucket: 'Bitbucket',
    discord: 'Discord',
    facebook: 'Facebook',
    figma: 'Figma',
    kakao: 'Kakao',
    keycloak: 'Keycloak',
    notion: 'Notion',
    slack: 'Slack',
    spotify: 'Spotify',
    twitch: 'Twitch',
    twitter: 'Twitter',
    workos: 'WorkOS',
    zoom: 'Zoom'
  }
  return known[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Absolute, not relative: "3 days ago" is useless when comparing two sign-ups. */
function stamp(iso: string | null, locale: 'az' | 'en'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale === 'az' ? 'az-AZ' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}
