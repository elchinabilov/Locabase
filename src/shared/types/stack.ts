/**
 * The local Docker stack: service status, ports and their conflicts.
 */

export interface ServiceStatus {
  /** `db`, `auth`, `rest`, ... */
  key: string
  container: string
  /** docker state: running / exited / created / ... */
  state: string
  /** healthcheck varsa: healthy / unhealthy / starting */
  health: string | null
  /** bytes; null when not measured */
  memory: number | null
  /** the host's total memory — for computing a percentage */
  memoryLimit: number | null
}

/** A single container on the remote server. */
export interface RemoteService {
  container: string
  /** `supabase-db-xxxx` → `db`; the container name when unrecognized */
  key: string
  state: string
  health: string | null
  memory: number | null
  memoryLimit: number | null
}

export interface StackStatus {
  projectId: string
  /** at least one container is running */
  running: boolean
  services: ServiceStatus[]
  /** the output of `supabase status -o json` — empty when the stack is down */
  vars: Record<string, string>
  error: string | null
  checkedAt: string
}

export interface PortUsage {
  port: number
  /** `api`, `db`, `studio`, `local_smtp`, ... */
  key: string
  projectId: string
}

export interface PortConflict {
  port: number
  holders: PortUsage[]
}
