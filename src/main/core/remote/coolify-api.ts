/**
 * The slice of Coolify's REST API (v4, `/api/v1`) a Supabase service needs.
 *
 * Coolify keeps a service's environment variables in its own Postgres, encrypted
 * with the instance's APP_KEY, and regenerates the stack `.env` and compose file
 * from there on every deploy. Writing those files over ssh therefore lasts until
 * the next redeploy and never shows up in Coolify's UI; the API is the only
 * writer whose changes Coolify itself keeps. Writing the database directly is not
 * an option: the values would have to be encrypted with a key we do not have.
 *
 * Kept free of electron and ssh imports so it can be tested with a stubbed
 * `fetch`.
 */

export interface CoolifyEnvVar {
  uuid: string
  key: string
  /** absent when the token lacks the `read:sensitive` ability */
  value: string | null
}

/** What `envs/bulk` takes per variable. */
interface BulkItem {
  key: string
  value: string
  /** no `$VAR` interpolation — a secret is taken exactly as written */
  is_literal: boolean
  is_multiline: boolean
}

export class CoolifyApi {
  private readonly base: string

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly serviceUuid: string
  ) {
    this.base = normalizeBaseUrl(baseUrl)
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      throw new Error(`Coolify API ${res.status} on ${path}: ${body || res.statusText}`)
    }
    const text = await res.text()
    return (text.trim() === '' ? undefined : JSON.parse(text)) as T
  }

  private get service(): string {
    return `/services/${encodeURIComponent(this.serviceUuid)}`
  }

  /** The service itself — also the cheapest proof that the token and uuid are right. */
  async getService(): Promise<{ uuid: string; name?: string; docker_compose_raw?: string | null }> {
    return this.request(this.service)
  }

  async listEnvs(): Promise<CoolifyEnvVar[]> {
    const rows = await this.request<unknown>(`${this.service}/envs`)
    if (!Array.isArray(rows)) throw new Error('Coolify API: the env list is not an array')
    const out: CoolifyEnvVar[] = []
    for (const row of rows as Array<Record<string, unknown>>) {
      // Services have no preview deployments, but the column exists; a preview
      // copy of a key must not shadow the real one.
      if (row['is_preview'] === true) continue
      if (typeof row['key'] !== 'string' || typeof row['uuid'] !== 'string') continue
      out.push({
        uuid: row['uuid'],
        key: row['key'],
        value: typeof row['value'] === 'string' ? row['value'] : null
      })
    }
    return out
  }

  /** Create or update in one call; Coolify matches on `key`. */
  async upsertEnvs(kv: Record<string, string>): Promise<void> {
    const data: BulkItem[] = Object.entries(kv).map(([key, value]) => ({
      key,
      value,
      is_literal: true,
      is_multiline: value.includes('\n')
    }))
    if (data.length === 0) return
    await this.request(`${this.service}/envs/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ data })
    })
  }

  async deleteEnv(envUuid: string): Promise<void> {
    await this.request(`${this.service}/envs/${encodeURIComponent(envUuid)}`, {
      method: 'DELETE'
    })
  }

  /** Coolify expects the compose text base64-encoded. */
  async updateComposeRaw(text: string): Promise<void> {
    await this.request(this.service, {
      method: 'PATCH',
      body: JSON.stringify({
        docker_compose_raw: Buffer.from(text, 'utf8').toString('base64')
      })
    })
  }
}

/**
 * `https://coolify.example.com/` and `https://coolify.example.com/api/v1` both
 * mean the instance root; the API path is added per request.
 */
export function normalizeBaseUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api(\/v1)?$/, '')
  if (!/^https?:\/\/[^/\s]+/.test(trimmed)) {
    throw new Error(`Invalid Coolify URL: ${url} — expected https://coolify.example.com`)
  }
  return trimmed
}
