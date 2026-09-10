/**
 * Health and verification reports for a remote environment.
 */

import type { RemoteKind } from './project.js'

export interface HealthReport {
  ok: boolean
  kind: RemoteKind
  details: Array<{ label: string; ok: boolean; info: string }>
}

export interface BackupInfo {
  path: string
  size: string
  createdAt: string
}

export interface VerifyReport {
  ok: boolean
  checks: Array<{ label: string; ok: boolean; info: string }>
}
