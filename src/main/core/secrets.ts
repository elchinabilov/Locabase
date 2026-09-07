/**
 * Remote access token və SSH parolları. Diskə açıq mətnlə yazılmır —
 * Electron `safeStorage` (macOS Keychain / Windows DPAPI / libsecret) ilə
 * şifrələnir. Şifrələmə mövcud deyilsə saxlamırıq: yalançı təhlükəsizlik
 * hissindənsə istifadəçidən hər dəfə soruşmaq yaxşıdır.
 */
import { safeStorage } from 'electron'
import Store from 'electron-store'

interface Shape {
  items: Record<string, string>
}

const store = new Store<Shape>({ name: 'credentials', defaults: { items: {} } })

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
      'Sistem açar anbarı əlçatmazdır — token saxlanıla bilməz (macOS-də Keychain girişini yoxla).'
    )
  }
  const items = { ...store.get('items') }
  items[key] = safeStorage.encryptString(value).toString('base64')
  store.set('items', items)
}

export function get(key: string): string | null {
  const raw = store.get('items')[key]
  if (!raw) return null
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'))
  } catch {
    return null
  }
}

export function has(key: string): boolean {
  return Boolean(store.get('items')[key])
}

export function remove(key: string): void {
  const items = { ...store.get('items') }
  delete items[key]
  store.set('items', items)
}

export const keys = {
  managedToken: (envId: string): string => `env:${envId}:access_token`,
  dbPassword: (envId: string): string => `env:${envId}:db_password`,
  sshPassphrase: (envId: string): string => `env:${envId}:ssh_passphrase`
}
