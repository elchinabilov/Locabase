/**
 * The result of a command run, and the log lines it produced.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'stdout' | 'stderr'

export interface LogLine {
  /** which workflow — `stack:my-app`, `deploy:prod`, `fn:serve:notify-message` */
  stream: string
  level: LogLevel
  text: string
  at: string
}

export interface TaskResult {
  ok: boolean
  code: number | null
  /** combined stdout+stderr, the last 200 lines */
  output: string
  error: string | null
}
