/**
 * Remote access tokens and SSH passwords. Never written to disk in clear text —
 * they are encrypted with Electron `safeStorage` (macOS Keychain / Windows DPAPI
 * / libsecret). If encryption is unavailable we don't store them at all: asking
 * the user every time beats a false sense of security.
 */
import { safeStorage } from 'electron'
import Store from 'electron-store'

interface Shape {
  items: Record<string, string>
}

/** Lazy — same reason as in `projects.ts`. */
let _store: Store<Shape> | null = null
function store(): Store<Shape> {
  _store ??= new Store<Shape>({ name: 'credentials', defaults: { items: {} } })
  return _store
}

export class SecretStoreError extends Error {}

export function available(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function set(key: string, value: string): void {
  if (!available()) {
    throw new SecretStoreError(
      'The system key store is unavailable — the token cannot be saved (on macOS, check Keychain access).'
    )
  }
  const items = { ...store().get('items') }
  items[key] = safeStorage.encryptString(value).toString('base64')
  store().set('items', items)
}

export function get(key: string): string | null {
  const raw = store().get('items')[key]
  if (!raw) return null
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'))
  } catch {
    return null
  }
}

export function has(key: string): boolean {
  return Boolean(store().get('items')[key])
}

export function remove(key: string): void {
  const items = { ...store().get('items') }
  delete items[key]
  store().set('items', items)
}

export const keys = {
  managedToken: (envId: string): string => `env:${envId}:access_token`,
  dbPassword: (envId: string): string => `env:${envId}:db_password`,
  sshPassphrase: (envId: string): string => `env:${envId}:ssh_passphrase`
}
