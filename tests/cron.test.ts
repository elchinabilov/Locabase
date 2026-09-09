import { describe, expect, it } from 'vitest'
import { nextRun, parseCron, parseTime, validate } from '../src/main/core/scheduler/cron.js'

/** Local time, on purpose: a schedule means wall-clock time on this machine. */
const at = (y: number, m: number, d: number, h = 0, min = 0): Date => new Date(y, m - 1, d, h, min)

describe('parseTime', () => {
  it('accepts HH:MM and rejects everything else', () => {
    expect(parseTime('03:00')).toBe(180)
    expect(parseTime('9:05')).toBe(545)
    expect(parseTime('23:59')).toBe(1439)
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('03:60')).toBeNull()
    expect(parseTime('gecə')).toBeNull()
  })
})

describe('nextRun — daily', () => {
  it('takes today when the time is still ahead', () => {
    expect(nextRun({ kind: 'daily', at: '23:30' }, at(2026, 1, 15, 10, 30))).toEqual(
      at(2026, 1, 15, 23, 30)
    )
  })

  it('rolls over to tomorrow when it has passed', () => {
    expect(nextRun({ kind: 'daily', at: '03:00' }, at(2026, 1, 15, 10, 30))).toEqual(
      at(2026, 1, 16, 3, 0)
    )
  })

  it('rolls over when the time is exactly now — a run never fires twice', () => {
    expect(nextRun({ kind: 'daily', at: '03:00' }, at(2026, 1, 15, 3, 0))).toEqual(
      at(2026, 1, 16, 3, 0)
    )
  })
})

describe('nextRun — weekly', () => {
  it('finds the next matching weekday', () => {
    // 2026-01-15 is a Thursday; Monday is 1.
    expect(nextRun({ kind: 'weekly', at: '03:00', weekday: 1 }, at(2026, 1, 15, 10, 0))).toEqual(
      at(2026, 1, 19, 3, 0)
    )
  })

  it('stays on today when the time is still ahead', () => {
    expect(nextRun({ kind: 'weekly', at: '22:00', weekday: 4 }, at(2026, 1, 15, 10, 0))).toEqual(
      at(2026, 1, 15, 22, 0)
    )
  })

  it('jumps a full week when today’s slot has passed', () => {
    expect(nextRun({ kind: 'weekly', at: '08:00', weekday: 4 }, at(2026, 1, 15, 10, 0))).toEqual(
      at(2026, 1, 22, 8, 0)
    )
  })
})

describe('nextRun — interval', () => {
  it('adds the gap and drops the seconds', () => {
    const from = new Date(2026, 0, 15, 10, 30, 44)
    expect(nextRun({ kind: 'interval', everyMinutes: 90 }, from)).toEqual(at(2026, 1, 15, 12, 0))
  })

  it('refuses an interval below a minute', () => {
    expect(validate({ kind: 'interval', everyMinutes: 0 })).not.toBeNull()
    expect(nextRun({ kind: 'interval', everyMinutes: 0 }, at(2026, 1, 15))).toBeNull()
  })
})

describe('parseCron', () => {
  it('reads stars, steps, ranges and lists', () => {
    const fields = parseCron('0,30 1-3 * * 1-5')
    expect(fields).not.toBeNull()
    expect([...fields!.minute]).toEqual([0, 30])
    expect([...fields!.hour]).toEqual([1, 2, 3])
    expect(fields!.domRestricted).toBe(false)
    expect(fields!.dowRestricted).toBe(true)
  })

  it('treats 7 as Sunday', () => {
    expect([...parseCron('0 0 * * 7')!.dow]).toEqual([0])
  })

  it('rejects the wrong field count and out-of-range values', () => {
    expect(parseCron('0 3 * *')).toBeNull()
    expect(parseCron('0 24 * * *')).toBeNull()
    expect(parseCron('nope')).toBeNull()
  })
})

describe('nextRun — cron', () => {
  it('matches a nightly expression', () => {
    expect(nextRun({ kind: 'cron', expr: '0 3 * * *' }, at(2026, 1, 15, 10, 30))).toEqual(
      at(2026, 1, 16, 3, 0)
    )
  })

  it('handles a step in the minute field', () => {
    expect(nextRun({ kind: 'cron', expr: '*/15 * * * *' }, at(2026, 1, 15, 10, 7))).toEqual(
      at(2026, 1, 15, 10, 15)
    )
  })

  it('picks a weekday', () => {
    // Next Monday at 04:00.
    expect(nextRun({ kind: 'cron', expr: '0 4 * * 1' }, at(2026, 1, 15, 10, 0))).toEqual(
      at(2026, 1, 19, 4, 0)
    )
  })

  it('ORs the two day fields, the way cron does', () => {
    // The 1st of the month OR a Monday — 2026-01-19 is the nearer Monday.
    expect(nextRun({ kind: 'cron', expr: '0 0 1 * 1' }, at(2026, 1, 15, 10, 0))).toEqual(
      at(2026, 1, 19, 0, 0)
    )
  })

  it('returns null for a date that never comes', () => {
    expect(nextRun({ kind: 'cron', expr: '0 0 30 2 *' }, at(2026, 1, 15))).toBeNull()
  })
})

describe('validate', () => {
  it('explains what is wrong instead of failing silently', () => {
    expect(validate({ kind: 'daily', at: '3pm' })).not.toBeNull()
    expect(validate({ kind: 'weekly', at: '03:00' })).not.toBeNull()
    expect(validate({ kind: 'cron', expr: '0 3 * *' })).not.toBeNull()
    expect(validate({ kind: 'daily', at: '03:00' })).toBeNull()
    expect(validate({ kind: 'cron', expr: '0 3 * * *' })).toBeNull()
  })
})
