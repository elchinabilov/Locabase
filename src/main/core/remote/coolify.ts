/**
 * A self-hosted environment that is a Coolify service, with Coolify's API at hand.
 *
 * Everything that needs the server itself (migrations, backups, functions, the
 * containers) still goes over ssh, as for any self-hosted stack. Only the parts
 * Coolify owns are routed through its API: the environment variables, and the
 * auth service's lines in the compose template. Those are what Coolify rebuilds
 * the stack from on every deploy, so a change made only to the files on disk is
 * undone by the next redeploy and never appears in Coolify's UI.
 *
 * The files on disk are still written as well. Coolify only regenerates them on
 * a deploy, so without that the running containers would keep the old values
 * until someone pressed Redeploy.
 */
import { addServiceEnv, findAuthService, rewriteServiceEnv, serviceEnv } from '@shared/compose.js'
import { serviceIdOf } from '@shared/coolify.js'
import type { HealthReport, Project, RemoteSecret, SelfHostedEnv } from '@shared/types/index.js'
import { singleLineValue } from '../envfile.js'
import { get as getSecret, keys } from '../secrets.js'
import { CoolifyApi } from './coolify-api.js'
import { SelfHostedAdapter } from './selfhosted.js'
import type { AuthApplyResult, LogFn } from './index.js'

export class CoolifyAdapter extends SelfHostedAdapter {
  constructor(project: Project, env: SelfHostedEnv) {
    super(project, env)
  }

  private api(): CoolifyApi {
    const coolify = this.env.coolify
    if (!coolify) throw new Error(`«${this.env.name}» is not connected to a Coolify instance.`)
    const token = getSecret(keys.coolifyToken(this.env.id))
    if (!token) {
      throw new Error(
        `No Coolify API token for «${this.env.name}» — add one in the environment settings.`
      )
    }
    const uuid = serviceIdOf(this.env)
    if (uuid === '') {
      throw new Error(
        `«${this.env.name}» does not follow the Coolify service layout, so its service uuid ` +
          'is unknown — set the service id in the environment settings.'
      )
    }
    const clientId = coolify.accessClientId?.trim() ?? ''
    const clientSecret = clientId !== '' ? getSecret(keys.coolifyAccessSecret(this.env.id)) : null
    if (clientId !== '' && !clientSecret) {
      throw new Error(
        `«${this.env.name}» has a Cloudflare Access Client ID but no secret — add it in the environment settings.`
      )
    }
    const access = clientId !== '' && clientSecret ? { clientId, clientSecret } : null
    return new CoolifyApi(coolify.baseUrl, token, uuid, access)
  }

  override async ping(): Promise<HealthReport> {
    const report = await super.ping()
    try {
      const service = await this.api().getService()
      report.details.push({ label: 'Coolify API', ok: true, info: service.name ?? service.uuid })
    } catch (err) {
      report.details.push({ label: 'Coolify API', ok: false, info: (err as Error).message })
    }
    return { ...report, ok: report.details.every((d) => d.ok) }
  }

  /**
   * What Coolify has stored, not what the `.env` on disk says: a key that is only
   * in the file was written behind Coolify's back and is gone after the next
   * redeploy, so it has to show as still needing a push.
   */
  override async listSecrets(): Promise<RemoteSecret[]> {
    const envs = await this.api().listEnvs()
    return envs
      .map((e) => ({ name: e.key, value: e.value, digest: null }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  override async setSecrets(kv: Record<string, string>, log: LogFn): Promise<void> {
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(kv)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`invalid variable name: ${k}`)
      const value = singleLineValue(v)
      if (value === null) {
        throw new Error(`${k}: multi-line values are only supported when they are JSON`)
      }
      flat[k] = value
    }
    const names = Object.keys(flat)
    if (names.length === 0) return

    const api = this.api()
    log(`Coolify: saving ${names.length} variable(s): ${names.join(', ')}`)
    await api.upsertEnvs(flat)
    await this.assertStored(api, names, 'present', log)

    // The running stack reads the file, not Coolify's database.
    await super.setSecrets(kv, log)
  }

  override async unsetSecrets(names: string[], log: LogFn): Promise<void> {
    if (names.length === 0) return
    const api = this.api()
    const byKey = new Map((await api.listEnvs()).map((e) => [e.key, e.uuid]))
    const present = names.filter((n) => byKey.has(n))
    if (present.length > 0) {
      log(`Coolify: removing ${present.length} variable(s): ${present.join(', ')}`)
      for (const name of present) await api.deleteEnv(byKey.get(name)!)
      await this.assertStored(api, present, 'absent', log)
    }
    await super.unsetSecrets(names, log)
  }

  /** Read Coolify's list back — a 2xx alone does not prove the keys landed. */
  private async assertStored(
    api: CoolifyApi,
    names: string[],
    expect: 'present' | 'absent',
    log: LogFn
  ): Promise<void> {
    const found = new Set((await api.listEnvs()).map((e) => e.key))
    const wrong = names.filter((n) => (expect === 'present' ? !found.has(n) : found.has(n)))
    if (wrong.length === 0) {
      log(`Coolify: verified ${names.length} variable(s) ${expect}`)
      return
    }
    throw new Error(
      expect === 'present'
        ? `Coolify still does not list ${wrong.join(', ')} after the write.`
        : `Coolify still lists ${wrong.join(', ')} after the removal.`
    )
  }

  /**
   * Patch the compose file on disk and recreate the container (the parent), then
   * make the same edit to the template Coolify stores, so the next redeploy
   * keeps it instead of reverting it.
   */
  override async applyAuthVars(names: string[], log: LogFn): Promise<AuthApplyResult> {
    const result = await super.applyAuthVars(names, log)

    const api = this.api()
    const raw = (await api.getService()).docker_compose_raw
    if (typeof raw !== 'string' || raw.trim() === '') {
      log('Coolify: the service did not return its compose template; it was not updated.')
      return result
    }
    const service = findAuthService(raw)
    if (service === null) {
      log("Coolify: no GoTrue service in Coolify's compose template; it was not updated.")
      return result
    }
    // Worked out from the template itself: it is not the file on disk, and a line
    // literal in one may already read from `.env` in the other.
    const env = serviceEnv(raw, service)
    const rewired = names.filter((n) => env.names.has(n) && (env.sources.get(n) ?? null) === null)
    const patched = rewriteServiceEnv(addServiceEnv(raw, service, names), service, rewired)
    if (patched !== raw) {
      log(`Coolify: updating the compose template of ${service}`)
      await api.updateComposeRaw(patched)
    }
    return { ...result, durable: true }
  }
}
