import { describe, expect, it } from 'vitest'
import { isServiceId, serviceIdOf, servicePaths } from '../src/shared/coolify.js'

const ID = 'm2c95warvc2gnjnscj1znvh8'

describe('servicePaths', () => {
  it('builds all three fields from one id', () => {
    expect(servicePaths(ID)).toEqual({
      dbContainer: `supabase-db-${ID}`,
      functionsContainer: `supabase-edge-functions-${ID}`,
      remoteDir: `/data/coolify/services/${ID}`
    })
  })

  it('trims the id before building', () => {
    expect(servicePaths(`  ${ID}  `).remoteDir).toBe(`/data/coolify/services/${ID}`)
  })
})

describe('isServiceId', () => {
  it('accepts a url-safe id', () => {
    expect(isServiceId(ID)).toBe(true)
    expect(isServiceId('a_b-c9')).toBe(true)
  })

  it('rejects anything that would not survive being pasted into a path', () => {
    for (const bad of ['', 'a b', 'a/b', '../etc', "a'b", 'a$b']) {
      expect(isServiceId(bad), bad).toBe(false)
    }
  })
})

describe('serviceIdOf', () => {
  it('reads the id back out of a fully derived environment', () => {
    expect(serviceIdOf(servicePaths(ID))).toBe(ID)
  })

  it('ignores a field that is still empty', () => {
    expect(serviceIdOf({ dbContainer: `supabase-db-${ID}` })).toBe(ID)
    expect(serviceIdOf({ remoteDir: `/data/coolify/services/${ID}/` })).toBe(ID)
  })

  it('is empty when nothing is configured', () => {
    expect(serviceIdOf({})).toBe('')
    expect(serviceIdOf({ dbContainer: '', functionsContainer: '', remoteDir: '' })).toBe('')
  })

  // Two fields agreeing is not enough: showing an id that does not describe the
  // third would invite filling it in and quietly rewriting a working path.
  it('is empty when a field does not follow the layout', () => {
    expect(
      serviceIdOf({ ...servicePaths(ID), remoteDir: '/srv/supabase' }),
      'hand-written folder'
    ).toBe('')
    expect(serviceIdOf({ ...servicePaths(ID), dbContainer: 'my-postgres' })).toBe('')
  })

  it('is empty when the fields disagree about the id', () => {
    expect(
      serviceIdOf({ ...servicePaths(ID), functionsContainer: 'supabase-edge-functions-other' })
    ).toBe('')
  })
})
