/**
 * Metadata for the `[auth.external.*]` providers.
 *
 * Self-hosted Studio does not offer this screen at all — the only way to enable a
 * provider there is to edit `config.toml` by hand. That is why this table exists.
 *
 * There are NO `hint` texts here — those belong to the presentation layer and live
 * in `renderer/src/i18n` (`auth.providerHint.<id>`) as AZ/EN strings. This file is
 * imported by both main and renderer, so it must not depend on UI text or i18n —
 * `id`, `label`, `fields` and `docs` are pure data.
 * strukturdur.
 */
import type { AuthProviderMeta } from './types/index.js'

const BASE: Array<'client_id' | 'secret' | 'redirect_uri'> = ['client_id', 'secret', 'redirect_uri']

export const AUTH_PROVIDERS: AuthProviderMeta[] = [
  {
    id: 'apple',
    label: 'Apple',
    fields: [...BASE, 'skip_nonce_check', 'email_optional'],
    docs: 'https://supabase.com/docs/guides/auth/social-login/auth-apple'
  },
  {
    id: 'azure',
    label: 'Azure (Microsoft Entra)',
    fields: [...BASE, 'url'],
    docs: 'https://supabase.com/docs/guides/auth/social-login/auth-azure'
  },
  { id: 'bitbucket', label: 'Bitbucket', fields: BASE },
  { id: 'discord', label: 'Discord', fields: BASE },
  { id: 'facebook', label: 'Facebook', fields: BASE },
  { id: 'figma', label: 'Figma', fields: BASE },
  { id: 'github', label: 'GitHub', fields: BASE },
  { id: 'gitlab', label: 'GitLab', fields: [...BASE, 'url'] },
  {
    id: 'google',
    label: 'Google',
    fields: [...BASE, 'skip_nonce_check'],
    docs: 'https://supabase.com/docs/guides/auth/social-login/auth-google'
  },
  { id: 'kakao', label: 'Kakao', fields: BASE },
  { id: 'keycloak', label: 'Keycloak', fields: [...BASE, 'url'] },
  {
    id: 'linkedin_oidc',
    label: 'LinkedIn (OIDC)',
    fields: BASE,
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

/** The callback URL you paste into the provider's console. */
export function callbackUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/auth/v1/callback`
}

/** `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` — the name the CLI expects. */
export function envVarName(providerId: string, field: string): string {
  return `SUPABASE_AUTH_EXTERNAL_${providerId.toUpperCase()}_${field.toUpperCase()}`
}
