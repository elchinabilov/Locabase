import { describe, expect, it } from 'vitest'
import az from '../src/renderer/src/i18n/locales/az.js'
import en from '../src/renderer/src/i18n/locales/en.js'

type Node = string | { [key: string]: Node }

/** The dotted paths of every leaf key — `{a:{b:'x'}}` → `['a.b']`. */
function leafPaths(node: Node, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  return Object.entries(node).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k))
}

describe('i18n locales', () => {
  it('en.ts covers every key in az.ts (no translation gap)', () => {
    const azKeys = new Set(leafPaths(az))
    const enKeys = new Set(leafPaths(en as Node))
    const missing = [...azKeys].filter((k) => !enKeys.has(k))
    expect(missing).toEqual([])
  })

  it('en.ts has no key that az.ts lacks (no dead key)', () => {
    const azKeys = new Set(leafPaths(az))
    const enKeys = new Set(leafPaths(en as Node))
    const extra = [...enKeys].filter((k) => !azKeys.has(k))
    expect(extra).toEqual([])
  })

  it('no translation is an empty string', () => {
    const check = (node: Node, prefix = ''): void => {
      for (const [k, v] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${k}` : k
        if (typeof v === 'string') expect(v.trim(), path).not.toBe('')
        else check(v, path)
      }
    }
    check(az)
    check(en as Node)
  })
})
