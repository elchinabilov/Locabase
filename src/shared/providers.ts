/**
 * `[auth.external.*]` provider-lərinin metadata-sı.
 *
 * Self-hosted Studio bu ekranı ümumiyyətlə vermir — provider açmaq üçün yeganə
 * yol `config.toml`-u əl ilə redaktə etməkdir. Cədvəl buna görə var.
 */
import type { AuthProviderMeta } from './types.js'

const BASE: Array<'client_id' | 'secret' | 'redirect_uri'> = ['client_id', 'secret', 'redirect_uri']

export const AUTH_PROVIDERS: AuthProviderMeta[] = [
  {
    id: 'apple',
    label: 'Apple',
    fields: [...BASE, 'skip_nonce_check', 'email_optional'],
    hint: 'Services ID `client_id`-dir, `secret` isə imzalanmış JWT-dir (6 ayda bir yenilənir). Native iOS girişi üçün `skip_nonce_check` lazım ola bilər.',
    docs: 'https://supabase.com/docs/guides/auth/social-login/auth-apple'
  },
  {
    id: 'azure',
    label: 'Azure (Microsoft Entra)',
    fields: [...BASE, 'url'],
    hint: '`url` tenant endpoint-idir: https://login.microsoftonline.com/<tenant>/v2.0',
    docs: 'https://supabase.com/docs/guides/auth/social-login/auth-azure'
  },
  { id: 'bitbucket', label: 'Bitbucket', fields: BASE },
  { id: 'discord', label: 'Discord', fields: BASE },
  { id: 'facebook', label: 'Facebook', fields: BASE },
  { id: 'figma', label: 'Figma', fields: BASE },
  { id: 'github', label: 'GitHub', fields: BASE, hint: 'GitHub Developer Settings → OAuth Apps → Authorization callback URL.' },
  { id: 'gitlab', label: 'GitLab', fields: [...BASE, 'url'], hint: 'Self-hosted GitLab üçün `url` instansiyanın ünvanıdır.' },
  {
    id: 'google',
    label: 'Google',
    fields: [...BASE, 'skip_nonce_check'],
    hint: 'Google Cloud Console → Credentials → OAuth 2.0 Client (Web) → Authorized redirect URI.',
    docs: 'https://supabase.com/docs/guides/auth/social-login/auth-google'
  },
  { id: 'kakao', label: 'Kakao', fields: BASE },
  { id: 'keycloak', label: 'Keycloak', fields: [...BASE, 'url'], hint: '`url` realm ünvanıdır: https://<host>/realms/<realm>' },
  {
    id: 'linkedin_oidc',
    label: 'LinkedIn (OIDC)',
    fields: BASE,
    hint: 'Provider adı `linkedin_oidc`-dir, köhnə `linkedin` deyil — tətbiq də bu adı göndərməlidir.',
    docs: 'https://supabase.com/docs/guides/auth/social-login/auth-linkedin'
  },
  { id: 'notion', label: 'Notion', fields: BASE },
  { id: 'slack_oidc', label: 'Slack (OIDC)', fields: BASE },
  { id: 'spotify', label: 'Spotify', fields: BASE },
  { id: 'twitch', label: 'Twitch', fields: BASE },
  { id: 'twitter', label: 'Twitter / X', fields: [...BASE, 'email_optional'] },
  { id: 'workos', label: 'WorkOS', fields: [...BASE, 'url'] },
  { id: 'zoom', label: 'Zoom', fields: BASE }
]

/** Provider konsoluna yapışdırılan callback URL. */
export function callbackUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/auth/v1/callback`
}

/** `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` — CLI-nin gözlədiyi ad. */
export function envVarName(providerId: string, field: string): string {
  return `SUPABASE_AUTH_EXTERNAL_${providerId.toUpperCase()}_${field.toUpperCase()}`
}
