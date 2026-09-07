import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  labelFor,
  parseBytes,
  SERVICE_GROUPS,
  SERVICES
} from '../src/shared/services.js'

describe('SERVICE_GROUPS', () => {
  it('eyni config açarını bölüşən servislər bir qrupdadır', () => {
    const api = SERVICE_GROUPS.find((g) => g.configPath === 'api.enabled')
    expect(api?.keys.sort()).toEqual(['kong', 'rest'])

    const studio = SERVICE_GROUPS.find((g) => g.configPath === 'studio.enabled')
    expect(studio?.keys.sort()).toEqual(['pg_meta', 'studio'])

    const analytics = SERVICE_GROUPS.find((g) => g.configPath === 'analytics.enabled')
    expect(analytics?.keys.sort()).toEqual(['analytics', 'vector'])
  })

  it('Postgres məcburidir və keçidi yoxdur', () => {
    const db = SERVICE_GROUPS.find((g) => g.keys.includes('db'))
    expect(db?.required).toBe(true)
    expect(db?.configPath).toBeNull()
  })

  it('hər servis tam bir qrupdadır', () => {
    const keys = SERVICE_GROUPS.flatMap((g) => g.keys).sort()
    expect(keys).toEqual(SERVICES.map((s) => s.key).sort())
  })

  it('məcburi olmayan hər qrupun config açarı var', () => {
    for (const g of SERVICE_GROUPS) {
      if (!g.required) expect(g.configPath).toBeTruthy()
    }
  })
})

describe('parseBytes', () => {
  it('docker MemUsage formatını oxuyur', () => {
    expect(parseBytes('192.9MiB')).toBeCloseTo(192.9 * 1024 ** 2, 0)
    expect(parseBytes('15.66GiB')).toBeCloseTo(15.66 * 1024 ** 3, 0)
    expect(parseBytes(' 16.16MiB ')).toBeCloseTo(16.16 * 1024 ** 2, 0)
    expect(parseBytes('1.2GB')).toBeCloseTo(1.2 * 1000 ** 3, 0)
  })

  it('tanınmayan mətnə null qaytarır', () => {
    expect(parseBytes('--')).toBeNull()
    expect(parseBytes('')).toBeNull()
  })
})

describe('formatBytes', () => {
  it('oxunaqlı ölçü verir', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MiB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GiB')
    expect(formatBytes(192.9 * 1024 ** 2)).toBe('193 MiB')
  })
})

describe('labelFor', () => {
  it('tanınan açar üçün ad, tanınmayan üçün açarın özü', () => {
    expect(labelFor('edge_runtime')).toBe('Edge runtime')
    expect(labelFor('naməlum')).toBe('naməlum')
  })
})
