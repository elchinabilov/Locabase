/**
 * Edge functions: what is on disk, what is deployed, and the diff between them.
 */

export interface FunctionInfo {
  name: string
  path: string
  entrypoint: string
  /** sha256 of every file in the folder */
  hash: string
  verifyJwt: boolean
  files: number
  remote: RemoteFunctionInfo | null
  /**
   * The **content** difference between local and remote. `unknown` means the
   * remote gives no file listing (managed: only a version number), so the diff is
   * computed on demand through "View diff".
   */
  drift: FunctionDrift
}

export type FunctionDrift = 'same' | 'changed' | 'local-only' | 'remote-only' | 'unknown'

/** A file fetched from the remote. `content` null — binary or too large. */
export interface RemoteFile {
  path: string
  content: string | null
  binary: boolean
}

/** A remote file and its md5 — for computing the diff cheaply, in one call. */
export interface RemoteFileChecksum {
  path: string
  md5: string
}

export interface RemoteFunctionInfo {
  name: string
  version: number | null
  status: string | null
  updatedAt: string | null
  verifyJwt: boolean | null
  /** null — the remote transport gives no file listing */
  files: RemoteFileChecksum[] | null
}

export interface FunctionFileDiff {
  path: string
  status: 'same' | 'changed' | 'local-only' | 'remote-only'
  /** text content; null for binary or very large files */
  local: string | null
  remote: string | null
  binary: boolean
}

export interface FunctionDiff {
  name: string
  files: FunctionFileDiff[]
  /** number of changed/added/removed files */
  changed: number
}
