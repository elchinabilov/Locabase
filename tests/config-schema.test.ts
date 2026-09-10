import { describe, expect, it } from 'vitest'
import {
  CONFIG_FIELDS,
  CONFIG_GROUPS,
  FIELD_BY_PATH,
  needsRestart
} from '../src/shared/config-schema.js'

describe('CONFIG_FIELDS', () => {
  it('has no duplicate paths', () => {
    const paths = CONFIG_FIELDS.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('indexes every field by path', () => {
    expect(FIELD_BY_PATH.size).toBe(CONFIG_FIELDS.length)
  })

  it('puts every field in a declared group', () => {
    const groups = new Set<string>(CONFIG_GROUPS)
    for (const f of CONFIG_FIELDS) expect(groups.has(f.group), f.path).toBe(true)
  })

  it('gives every enum field its options', () => {
    for (const f of CONFIG_FIELDS) {
      if (f.type === 'enum') expect(f.options?.length, f.path).toBeGreaterThan(0)
    }
  })

  it('uses TOML key paths', () => {
    // `project_id` is a top-level key; everything else is dotted.
    for (const f of CONFIG_FIELDS) expect(f.path, f.path).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/)
  })
})

describe('needsRestart', () => {
  it('is false for nothing changed', () => {
    expect(needsRestart([])).toBe(false)
  })

  it('is true when a restart-required field changed', () => {
    const field = CONFIG_FIELDS.find((f) => f.restartRequired)
    expect(field).toBeDefined()
    expect(needsRestart([field!.path])).toBe(true)
  })

  /**
   * Every field currently declares `restartRequired`, so in practice any change
   * asks for a restart. That is the conservative answer for `config.toml`,
   * which the stack reads at start — this test pins the current reality so that
   * marking a field hot-reloadable later is a deliberate, visible change.
   */
  it('currently treats every declared field as needing a restart', () => {
    const hot = CONFIG_FIELDS.filter((f) => f.restartRequired !== true)
    expect(hot.map((f) => f.path)).toEqual([])
    expect(needsRestart(CONFIG_FIELDS.map((f) => f.path))).toBe(true)
  })

  /**
   * The safe default: an unknown path is assumed to need a restart, because
   * being told to restart unnecessarily is cheaper than a change that silently
   * did not take effect.
   */
  it('assumes a restart for a path it does not know', () => {
    expect(needsRestart(['something.we.never.declared'])).toBe(true)
  })

  it('is true when any one of several paths requires it', () => {
    const cold = CONFIG_FIELDS.find((f) => f.restartRequired)!
    expect(needsRestart(['a.hot.path.we.made.up', cold.path])).toBe(true)
  })
})
