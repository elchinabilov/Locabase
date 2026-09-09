import { describe, expect, it } from 'vitest'
import { selectPrunable } from '../src/main/core/backup/retention.js'
import type { BackupRecord } from '../src/shared/types.js'

function record(id: string, daysAgo: number, status: BackupRecord['status'] = 'ok'): BackupRecord {
  const startedAt = new Date(Date.UTC(2026, 0, 31) - daysAgo * 86_400_000).toISOString()
  return {
    id,
    projectId: 'p1',
    envId: null,
    envName: 'local',
    kind: 'local',
    format: 'custom',
    scope: 'full',
    trigger: 'job',
    jobId: 'j1',
    jobName: 'nightly',
    status,
    startedAt,
    finishedAt: startedAt,
    durationMs: 1000,
    path: `/tmp/${id}.dump`,
    bytes: 1024,
    storageId: null,
    storageName: null,
    storageKey: null,
    error: null
  }
}

const NOW = new Date(Date.UTC(2026, 0, 31))
const ids = (rows: BackupRecord[]): string[] => rows.map((r) => r.id)

describe('selectPrunable', () => {
  it('keeps everything when no rule is set', () => {
    const rows = [record('a', 0), record('b', 100), record('c', 400)]
    expect(selectPrunable(rows, { days: 0, count: 0 }, NOW)).toEqual([])
  })

  it('keeps only the newest N', () => {
    const rows = [record('new', 0), record('mid', 2), record('old', 4)]
    expect(ids(selectPrunable(rows, { days: 0, count: 2 }, NOW))).toEqual(['old'])
  })

  it('drops anything past the age limit', () => {
    const rows = [record('fresh', 1), record('stale', 30)]
    expect(ids(selectPrunable(rows, { days: 7, count: 0 }, NOW))).toEqual(['stale'])
  })

  it('never drops the newest successful backup, however old it is', () => {
    const rows = [record('ancient', 900)]
    expect(selectPrunable(rows, { days: 1, count: 1 }, NOW)).toEqual([])
  })

  it('leaves failed and running records alone', () => {
    const rows = [
      record('ok-new', 0),
      record('failed-old', 90, 'failed'),
      record('running', 0, 'running')
    ]
    expect(selectPrunable(rows, { days: 7, count: 1 }, NOW)).toEqual([])
  })

  it('applies both rules together and returns oldest first', () => {
    const rows = [record('a', 0), record('b', 3), record('c', 40), record('d', 60)]
    expect(ids(selectPrunable(rows, { days: 30, count: 3 }, NOW))).toEqual(['d', 'c'])
  })
})
