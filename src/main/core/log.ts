/**
 * Log avtobusu. Main-də baş verən hər şey (CLI çıxışı, docker logu, deploy
 * addımları) bura düşür, oradan da renderer-ə `log:line` hadisəsi kimi gedir.
 */
import { EventEmitter } from 'node:events'
import type { LogLine, LogLevel } from '@shared/types.js'

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
 * Sirləri loga buraxmırıq. Tam təhlükəsizlik zəmanəti deyil — müdafiənin
 * birinci qatıdır; ikinci qat odur ki, secret dəyərləri heç vaxt CLI arqumenti
 * kimi ötürülmür (bax `cli.ts` və `remote/*`).
 */

/** Bütöv uyğunluq gizlədilir. */
const SECRET_VALUES: RegExp[] = [
  /sb_secret_[A-Za-z0-9_-]+/g,
  /sbp_[A-Za-z0-9]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/g
]

/** `KEY=dəyər` formasında yalnız **dəyər** gizlədilir, açar adı qalır. */
const SECRET_ASSIGNMENTS =
  /((?:secret|token|password|passwd|api[_-]?key|access[_-]?key|auth)[A-Za-z_]*\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi

export function redact(text: string): string {
  let out = text
  for (const re of SECRET_VALUES) out = out.replace(re, '«gizlədilib»')
  out = out.replace(SECRET_ASSIGNMENTS, (_m, prefix: string) => `${prefix}«gizlədilib»`)
  return out
}

export const logBus = new LogBus()
