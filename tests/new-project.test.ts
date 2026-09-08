import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseToml } from 'smol-toml'
import { sanitizeProjectId } from '../src/shared/naming.js'
import { remapPatches } from '../src/main/core/ports.js'
import { applyPatches } from '../src/main/core/toml/patch.js'

const load = (n: string): string =>
  readFileSync(resolve(__dirname, `fixtures/${n}.config.toml`), 'utf8')

describe('sanitizeProjectId', () => {
  it.each([
    ['My App', 'my-app'],
    ['  Next CV  ', 'next-cv'],
    ['e-təhsil 2025', 'e-t-hsil-2025'],
    ['__api__', 'api'],
    ['a//b', 'a-b'],
    ['-- --', '']
  ])('%s → %s', (input, expected) => {
    expect(sanitizeProjectId(input)).toBe(expected)
  })
})

describe('remapPatches', () => {
  it('standart bazada heç nə dəyişmir', () => {
    expect(remapPatches(parseToml(load('alocar')), 543)).toEqual([])
  })

  it('543xx portları yeni bloka köçür, mövcud olmayan açara toxunmur', () => {
    const src = load('alocar')
    const parsed = parseToml(src) as Record<string, unknown>
    const patches = remapPatches(parsed, 557)
    expect(patches.length).toBeGreaterThan(0)

    const after = parseToml(applyPatches(src, patches).text) as Record<string, unknown>
    const port = (obj: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((cur, seg) => {
        return cur === null || typeof cur !== 'object'
          ? undefined
          : (cur as Record<string, unknown>)[seg]
      }, obj)

    for (const { path } of patches) {
      const before = port(parsed, path) as number
      const value = port(after, path) as number
      expect(Math.floor(value / 100)).toBe(557)
      if (path !== 'edge_runtime.inspector_port') expect(value % 100).toBe(before % 100)
    }
    // yamaq yalnız faylda olan açarları hədəfləyir
    for (const { path } of patches) expect(port(parsed, path)).toBeTypeOf('number')
    expect(patches.map((p) => p.path)).toContain('api.port')
    expect(port(after, 'api.port')).toBe(55721)
  })

  it('inspector portu da layihənin öz blokuna düşür', () => {
    const parsed = parseToml('[edge_runtime]\ninspector_port = 8083\n')
    expect(remapPatches(parsed, 561)).toEqual([
      { path: 'edge_runtime.inspector_port', value: 56183 }
    ])
  })
})
