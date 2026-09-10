import { describe, expect, it } from 'vitest'
import { diffLines } from '../src/renderer/src/lib/diff.js'

const text = (lines: string[]): string => lines.join('\n')

describe('diffLines', () => {
  it('returns nothing when the texts are identical', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc')).toEqual([])
  })

  it('marks a changed line as a delete plus an add', () => {
    const out = diffLines('a\nb\nc', 'a\nB\nc')
    expect(out.filter((l) => l.kind === 'del').map((l) => l.text)).toEqual(['b'])
    expect(out.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['B'])
  })

  it('marks an inserted line as an add only', () => {
    const out = diffLines('a\nc', 'a\nb\nc')
    expect(out.filter((l) => l.kind === 'del')).toEqual([])
    expect(out.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['b'])
  })

  it('marks a removed line as a delete only', () => {
    const out = diffLines('a\nb\nc', 'a\nc')
    expect(out.filter((l) => l.kind === 'add')).toEqual([])
    expect(out.filter((l) => l.kind === 'del').map((l) => l.text)).toEqual(['b'])
  })

  it('numbers the lines it kept on each side', () => {
    const out = diffLines('a\nb', 'a\nB')
    const del = out.find((l) => l.kind === 'del')
    const add = out.find((l) => l.kind === 'add')
    expect(del).toMatchObject({ a: 2, b: null })
    expect(add).toMatchObject({ a: null, b: 2 })
  })

  it('keeps `context` lines of unchanged text around a change', () => {
    const before = text(['1', '2', '3', '4', 'x', '6', '7', '8', '9'])
    const after = text(['1', '2', '3', '4', 'y', '6', '7', '8', '9'])
    const out = diffLines(before, after, 1)
    const same = out.filter((l) => l.kind === 'same').map((l) => l.text)
    expect(same).toEqual(['4', '6'])
  })

  it('collapses the untouched middle into a single gap', () => {
    const before = text(['x', ...Array.from({ length: 30 }, (_, i) => String(i)), 'y'])
    const after = text(['X', ...Array.from({ length: 30 }, (_, i) => String(i)), 'Y'])
    const gaps = diffLines(before, after, 1).filter((l) => l.kind === 'gap')
    expect(gaps).toHaveLength(1)
  })

  it('handles an empty side', () => {
    const out = diffLines('', 'a\nb')
    expect(out.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['a', 'b'])
  })

  it('resynchronises after a block of added lines', () => {
    const out = diffLines('a\nz', 'a\nb\nc\nd\nz')
    expect(out.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['b', 'c', 'd'])
    expect(out.filter((l) => l.kind === 'del')).toEqual([])
  })
})
