/**
 * When does a job run next?
 *
 * Pure arithmetic on a `ScheduleSpec` — no timers, no store, `from` is an
 * argument. Everything here works in **local wall-clock time**: "back up at
 * 03:00" means 03:00 on the machine, across a DST change too, which is what a
 * person setting a nightly backup means.
 */
import type { ScheduleSpec } from '@shared/types.js'

const MINUTE = 60_000

/** `07:30` → 450 minutes past midnight; null when it isn't a time. */
export function parseTime(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/* ------------------------------------------------------------------- cron */

interface CronFields {
  minute: Set<number>
  hour: Set<number>
  dom: Set<number>
  month: Set<number>
  dow: Set<number>
  /** Standard cron: with both day fields restricted, EITHER may match. */
  domRestricted: boolean
  dowRestricted: boolean
}

/** One field: a star, `5`, `1-5`, a star with a step, `1-9/3`, or a list of those. */
function parseField(text: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const piece = part.trim()
    if (!piece) return null
    const [range, stepText] = piece.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) return null

    let lo: number
    let hi: number
    if (range === '*') {
      lo = min
      hi = max
    } else if (range?.includes('-')) {
      const [a, b] = range.split('-')
      lo = Number(a)
      hi = Number(b)
    } else {
      lo = Number(range)
      hi = stepText === undefined ? lo : max
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      return null
    }
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out.size > 0 ? out : null
}

/** `null` when the expression is not five valid fields. */
export function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minute = parseField(parts[0]!, 0, 59)
  const hour = parseField(parts[1]!, 0, 23)
  const dom = parseField(parts[2]!, 1, 31)
  const month = parseField(parts[3]!, 1, 12)
  const dowRaw = parseField(parts[4]!, 0, 7)
  if (!minute || !hour || !dom || !month || !dowRaw) return null
  // Both 0 and 7 mean Sunday.
  const dow = new Set([...dowRaw].map((d) => (d === 7 ? 0 : d)))
  return {
    minute,
    hour,
    dom,
    month,
    dow,
    domRestricted: parts[2] !== '*',
    dowRestricted: parts[4] !== '*'
  }
}

function dayMatches(fields: CronFields, date: Date): boolean {
  const monthOk = fields.month.has(date.getMonth() + 1)
  if (!monthOk) return false
  const domOk = fields.dom.has(date.getDate())
  const dowOk = fields.dow.has(date.getDay())
  if (fields.domRestricted && fields.dowRestricted) return domOk || dowOk
  if (fields.domRestricted) return domOk
  if (fields.dowRestricted) return dowOk
  return true
}

/**
 * The first minute strictly after `from` that the expression matches, or null if
 * there is none within a year (`0 0 30 2 *` — February 30th).
 */
export function nextCron(expr: string, from: Date): Date | null {
  const fields = parseCron(expr)
  if (!fields) return null

  const cursor = new Date(from.getTime())
  cursor.setSeconds(0, 0)
  cursor.setTime(cursor.getTime() + MINUTE)

  for (let day = 0; day <= 366; day++) {
    if (!dayMatches(fields, cursor)) {
      // Nothing this day can match — jump to the next midnight instead of
      // stepping through 1440 dead minutes.
      cursor.setHours(24, 0, 0, 0)
      continue
    }
    let sameDay = true
    while (sameDay) {
      if (fields.hour.has(cursor.getHours()) && fields.minute.has(cursor.getMinutes())) {
        return cursor
      }
      const before = cursor.getDate()
      cursor.setTime(cursor.getTime() + MINUTE)
      sameDay = cursor.getDate() === before
    }
  }
  return null
}

/* ------------------------------------------------------------ the schedule */

/** A human-readable reason the spec cannot run; `null` when it is fine. */
export function validate(spec: ScheduleSpec): string | null {
  switch (spec.kind) {
    case 'interval':
      return spec.everyMinutes && spec.everyMinutes >= 1
        ? null
        : 'The interval must be at least 1 minute'
    case 'daily':
      return parseTime(spec.at ?? '') === null ? 'The time must look like 03:00' : null
    case 'weekly':
      if (parseTime(spec.at ?? '') === null) return 'The time must look like 03:00'
      return spec.weekday !== undefined && spec.weekday >= 0 && spec.weekday <= 6
        ? null
        : 'Pick a weekday'
    case 'cron':
      return parseCron(spec.expr ?? '') ? null : 'Five cron fields, e.g. `0 3 * * *`'
    default:
      return 'Unknown schedule type'
  }
}

/** The next run for any schedule kind. `null` = never (invalid spec). */
export function nextRun(spec: ScheduleSpec, from: Date = new Date()): Date | null {
  if (validate(spec) !== null) return null

  switch (spec.kind) {
    case 'interval': {
      const next = new Date(from.getTime() + (spec.everyMinutes ?? 60) * MINUTE)
      next.setSeconds(0, 0)
      return next
    }
    case 'daily': {
      const minutes = parseTime(spec.at ?? '')!
      const next = new Date(from.getTime())
      next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
      if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1)
      return next
    }
    case 'weekly': {
      const minutes = parseTime(spec.at ?? '')!
      const next = new Date(from.getTime())
      next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
      const wanted = spec.weekday ?? 0
      let ahead = (wanted - next.getDay() + 7) % 7
      if (ahead === 0 && next.getTime() <= from.getTime()) ahead = 7
      next.setDate(next.getDate() + ahead)
      return next
    }
    case 'cron':
      return nextCron(spec.expr ?? '', from)
    default:
      return null
  }
}
