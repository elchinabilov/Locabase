/**
 * Reading — and minimally patching — the `environment:` block of one service in a
 * docker-compose file.
 *
 * WHY THIS EXISTS: a value in the stack's `.env` does not reach a container.
 * Compose uses that file to expand `${…}` and passes on only what the service's
 * own `environment:` list names. A Coolify Supabase stack ships an auth service
 * that lists `GOTRUE_EXTERNAL_EMAIL_ENABLED` and nothing about OAuth, so a
 * correctly written `GOTRUE_EXTERNAL_GOOGLE_ENABLED` sits in `.env` and never
 * arrives — which looks exactly like the push having failed.
 *
 * Deliberately a line scanner and not a YAML parser: the file has to come back
 * byte-identical apart from the lines we add. It understands the two shapes
 * compose files use for `environment:` and nothing else; `serviceEnv` reports
 * `found: false` for anything it cannot read, and the caller then says so rather
 * than guessing.
 */

const COMMENT_OR_BLANK = /^\s*(#|$)/

function indentOf(line: string): number {
  return line.length - line.replace(/^[ \t]*/, '').length
}

/** The body lines of `key:` — every following line indented deeper than it. */
function blockBody(lines: string[], keyLine: number): { start: number; end: number } {
  const indent = indentOf(lines[keyLine]!)
  let end = keyLine + 1
  for (let i = keyLine + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (COMMENT_OR_BLANK.test(line)) continue
    if (indentOf(line) <= indent) break
    end = i + 1
  }
  return { start: keyLine + 1, end }
}

/** The line index of `key:` among the direct children of a block, or -1. */
function childKey(lines: string[], body: { start: number; end: number }, key: string): number {
  let childIndent = -1
  for (let i = body.start; i < body.end; i++) {
    const line = lines[i]!
    if (COMMENT_OR_BLANK.test(line)) continue
    const indent = indentOf(line)
    if (childIndent === -1) childIndent = indent
    if (indent !== childIndent) continue
    const m = /^[ \t]*["']?([A-Za-z0-9_.-]+)["']?\s*:/.exec(line)
    if (m && m[1] === key) return i
  }
  return -1
}

function servicesBody(lines: string[]): { start: number; end: number } | null {
  const at = lines.findIndex((l) => /^[ \t]*services\s*:/.test(l) && indentOf(l) === 0)
  if (at === -1) return null
  return blockBody(lines, at)
}

function serviceLine(lines: string[], service: string): number {
  const body = servicesBody(lines)
  if (body === null) return -1
  return childKey(lines, body, service)
}

/**
 * The `.env` variable a value is read from — but only when the WHOLE value is one
 * reference: `${FOO}` or `${FOO:-default}`.
 *
 * A value with text around the reference (`postgres://user:${PASS}@host`) has no
 * single source: writing to `PASS` would not set the container variable to what
 * we asked for, so it is reported as unsettable rather than guessed at.
 */
function envItemSource(value: string): string | null {
  const m = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-.*)?\}$/.exec(value.trim())
  return m ? m[1]! : null
}

/** `- 'FOO=${BAR}'`, `- FOO`, `FOO: bar` → the name and, when there is one, its `.env` source. */
function envItem(line: string): { name: string; source: string | null } | null {
  let text = line.trim()
  if (text.startsWith('-')) {
    text = text.slice(1).trim()
    const quote = text[0]
    if ((quote === '"' || quote === "'") && text.endsWith(quote)) text = text.slice(1, -1)
    const eq = text.indexOf('=')
    const name = (eq === -1 ? text : text.slice(0, eq)).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null
    // `- FOO` with no `=` is compose's own pass-through: the value comes from the
    // environment under the same name.
    return { name, source: eq === -1 ? name : envItemSource(text.slice(eq + 1)) }
  }
  const m = /^["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:(.*)$/.exec(text)
  if (m === null) return null
  let value = m[2]!.trim()
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1)
  return { name: m[1]!, source: envItemSource(value) }
}

export interface ServiceEnv {
  /** false when the service is not in the file — the caller must not then patch it */
  found: boolean
  /** the variable names the container is handed */
  names: Set<string>
  /**
   * For each of those names, the `.env` key whose value it carries — `null` when
   * the compose file writes the value itself and `.env` cannot change it.
   *
   * The two are not always the same word. The Coolify Supabase stack feeds
   * `GOTRUE_URI_ALLOW_LIST` from `ADDITIONAL_REDIRECT_URLS`, so writing the
   * GoTrue name into `.env` sets a variable the compose line then overwrites.
   */
  sources: Map<string, string | null>
  /** true when the service pulls a whole file in, so unnamed variables reach it too */
  envFile: boolean
}

export function serviceEnv(text: string, service: string): ServiceEnv {
  const lines = text.split('\n')
  const at = serviceLine(lines, service)
  if (at === -1) {
    return { found: false, names: new Set(), sources: new Map(), envFile: false }
  }

  const body = blockBody(lines, at)
  const names = new Set<string>()
  const sources = new Map<string, string | null>()
  const envAt = childKey(lines, body, 'environment')
  if (envAt !== -1) {
    const envBody = blockBody(lines, envAt)
    for (let i = envBody.start; i < envBody.end; i++) {
      const line = lines[i]!
      if (COMMENT_OR_BLANK.test(line)) continue
      const item = envItem(line)
      if (item === null) continue
      names.add(item.name)
      sources.set(item.name, item.source)
    }
  }
  return { found: true, names, sources, envFile: childKey(lines, body, 'env_file') !== -1 }
}

/** Every service the file declares, in file order — for a message that has to say what was seen. */
export function serviceNames(text: string): string[] {
  const lines = text.split('\n')
  const body = servicesBody(lines)
  if (body === null) return []

  const out: string[] = []
  let childIndent = -1
  for (let i = body.start; i < body.end; i++) {
    const line = lines[i]!
    if (COMMENT_OR_BLANK.test(line)) continue
    const indent = indentOf(line)
    if (childIndent === -1) childIndent = indent
    if (indent !== childIndent) continue
    const m = /^[ \t]*["']?([A-Za-z0-9_.-]+)["']?\s*:/.exec(line)
    if (m) out.push(m[1]!)
  }
  return out
}

/** The service that runs GoTrue, by image rather than by name. */
export function findAuthService(text: string): string | null {
  const lines = text.split('\n')
  const body = servicesBody(lines)
  if (body === null) return null

  let childIndent = -1
  let current: string | null = null
  let fallback: string | null = null
  for (let i = body.start; i < body.end; i++) {
    const line = lines[i]!
    if (COMMENT_OR_BLANK.test(line)) continue
    const indent = indentOf(line)
    if (childIndent === -1) childIndent = indent
    if (indent === childIndent) {
      const m = /^[ \t]*["']?([A-Za-z0-9_.-]+)["']?\s*:/.exec(line)
      current = m ? m[1]! : null
      if (current !== null && /(^|-)auth$/.test(current)) fallback = current
      continue
    }
    if (current === null) continue
    const image = /^[ \t]*image\s*:\s*["']?([^"'\s]+)/.exec(line)
    if (image && /gotrue|supabase\/auth/i.test(image[1]!)) return current
  }
  return fallback
}

/**
 * Rewrite `names` so they read from `.env` under their own name, whatever the
 * file says today — `- 'FOO=9999'` becomes `- 'FOO=${FOO}'`.
 *
 * A compose file that writes a value itself puts that value beyond the reach of
 * `.env`, and a stack generator does this freely. Refusing to touch such a line
 * leaves the user with a variable nothing can change; rewriting it moves the
 * value into the file where every other value lives, where it can then be read
 * back and compared like the rest.
 *
 * Lines already reading from some `.env` key are left exactly as they are: that
 * key is the stack's own wiring, and re-pointing it at a different name would
 * break whatever else reads it.
 */
export function rewriteServiceEnv(text: string, service: string, names: string[]): string {
  const lines = text.split('\n')
  const at = serviceLine(lines, service)
  if (at === -1) throw new Error(`The compose file has no service named ${service}`)

  const wanted = new Set(names)
  const body = blockBody(lines, at)
  const envAt = childKey(lines, body, 'environment')
  if (envAt === -1) return text

  const envBody = blockBody(lines, envAt)
  let changed = false
  for (let i = envBody.start; i < envBody.end; i++) {
    const line = lines[i]!
    if (COMMENT_OR_BLANK.test(line)) continue
    const item = envItem(line)
    if (item === null || item.source !== null || !wanted.has(item.name)) continue
    const pad = ' '.repeat(indentOf(line))
    lines[i] = line.trim().startsWith('-')
      ? `${pad}- '${item.name}=\${${item.name}}'`
      : `${pad}${item.name}: \${${item.name}}`
    changed = true
  }
  return changed ? lines.join('\n') : text
}

/**
 * Add `- 'NAME=${NAME}'` lines to a service's `environment:` list.
 *
 * The indentation and quoting of the lines already there are copied, so the
 * result still looks like the file a person wrote. Names the service already has
 * are skipped; the text comes back unchanged when there is nothing to add.
 */
export function addServiceEnv(text: string, service: string, names: string[]): string {
  const lines = text.split('\n')
  const at = serviceLine(lines, service)
  if (at === -1) throw new Error(`The compose file has no service named ${service}`)

  const existing = serviceEnv(text, service).names
  const wanted = names.filter((n) => !existing.has(n))
  if (wanted.length === 0) return text

  const body = blockBody(lines, at)
  const envAt = childKey(lines, body, 'environment')
  const serviceIndent = indentOf(lines[at]!)

  if (envAt === -1) {
    const pad = ' '.repeat(serviceIndent + 2)
    const block = [`${pad}environment:`, ...wanted.map((n) => `${pad}  - '${n}=\${${n}}'`)]
    lines.splice(at + 1, 0, ...block)
    return lines.join('\n')
  }

  const envBody = blockBody(lines, envAt)
  let itemIndent = indentOf(lines[envAt]!) + 2
  let dash = true
  for (let i = envBody.start; i < envBody.end; i++) {
    const line = lines[i]!
    if (COMMENT_OR_BLANK.test(line)) continue
    itemIndent = indentOf(line)
    dash = line.trim().startsWith('-')
    break
  }

  const pad = ' '.repeat(itemIndent)
  const added = wanted.map((n) => (dash ? `${pad}- '${n}=\${${n}}'` : `${pad}${n}: \${${n}}`))
  lines.splice(envBody.end, 0, ...added)
  return lines.join('\n')
}
