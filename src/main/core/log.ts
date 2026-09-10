/**
 * The log bus. Everything that happens in main (CLI output, docker logs, deploy
 * steps) lands here and goes on to the renderer as a `log:line` event.
 */
import { EventEmitter } from 'node:events'
import type { LogLine, LogLevel } from '@shared/types/index.js'

const RING_SIZE = 2000

class LogBus extends EventEmitter {
  private ring: LogLine[] = []

  push(stream: string, level: LogLevel, text: string): void {
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '')
      if (line.length === 0) continue
      const entry: LogLine = { stream, level, text: redact(line), at: new Date().toISOString() }
      this.ring.push(entry)
      if (this.ring.length > RING_SIZE) this.ring.shift()
      this.emit('line', entry)
    }
  }

  recent(stream?: string): LogLine[] {
    return stream ? this.ring.filter((l) => l.stream === stream) : this.ring.slice()
  }
}

/**
 * Secrets don't reach the log. This is not a full guarantee — it is the first
 * layer of defence; the second is that secret values are never passed as CLI
 * arguments (see `cli.ts` and `remote/*`).
 */

/** The whole match is hidden. */
const SECRET_VALUES: RegExp[] = [
  /sb_secret_[A-Za-z0-9_-]+/g,
  /sbp_[A-Za-z0-9]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/g
]

/** In `KEY=value` form only the **value** is hidden, the key name stays. */
const SECRET_ASSIGNMENTS =
  /((?:secret|token|password|passwd|api[_-]?key|access[_-]?key|auth)[A-Za-z_]*\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi

export function redact(text: string): string {
  let out = text
  for (const re of SECRET_VALUES) out = out.replace(re, '«redacted»')
  out = out.replace(SECRET_ASSIGNMENTS, (_m, prefix: string) => `${prefix}«redacted»`)
  return out
}

export const logBus = new LogBus()
