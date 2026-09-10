import { describe, expect, it, vi, afterEach } from 'vitest'
import { bytes, clock, cx, shortPath, stamp, timeAgo } from '../src/renderer/src/lib/format.js'

describe('cx', () => {
  it('joins the truthy parts', () => {
    expect(cx('a', 'b')).toBe('a b')
  })

  it('drops false, null and undefined', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('is empty when nothing survives', () => {
    expect(cx(false, null)).toBe('')
  })
})

describe('shortPath', () => {
  it('leaves a short path alone', () => {
    expect(shortPath('/Users/me')).toBe('/Users/me')
  })

  it('keeps the last two segments by default', () => {
    expect(shortPath('/Users/me/code/project')).toBe('…/code/project')
  })

  it('honours an explicit keep count', () => {
    expect(shortPath('/Users/me/code/project', 1)).toBe('…/project')
  })

  it('ignores trailing slashes when counting', () => {
    expect(shortPath('/a/b/')).toBe('/a/b/')
  })
})

describe('bytes', () => {
  it('rejects nothing-to-show values', () => {
    expect(bytes(0)).toBe('0 B')
    expect(bytes(-5)).toBe('0 B')
    expect(bytes(Number.NaN)).toBe('0 B')
    expect(bytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  it('shows whole bytes without a decimal', () => {
    expect(bytes(512)).toBe('512 B')
  })

  it('shows one decimal below ten units', () => {
    expect(bytes(1536)).toBe('1.5 KB')
  })

  it('drops the decimal at ten units and above', () => {
    expect(bytes(1024 * 12)).toBe('12 KB')
  })

  it('climbs through the units', () => {
    expect(bytes(1024 ** 2 * 3)).toBe('3.0 MB')
    expect(bytes(1024 ** 3 * 2)).toBe('2.0 GB')
    expect(bytes(1024 ** 4 * 5)).toBe('5.0 TB')
  })

  it('stays on the largest unit rather than inventing one', () => {
    expect(bytes(1024 ** 6)).toMatch(/TB$/)
  })
})

describe('timeAgo', () => {
  afterEach(() => vi.useRealTimers())

  function at(iso: string, secondsAgo: number): string {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(new Date(iso).getTime() + secondsAgo * 1000))
    return timeAgo(iso)
  }

  it('counts seconds under a minute', () => {
    expect(at('2026-01-01T00:00:00Z', 30)).toMatch(/30 seconds ago/)
  })

  it('switches to minutes', () => {
    expect(at('2026-01-01T00:00:00Z', 120)).toMatch(/2 minutes ago/)
  })

  it('switches to hours', () => {
    expect(at('2026-01-01T00:00:00Z', 7200)).toMatch(/2 hours ago/)
  })

  it('switches to days', () => {
    expect(at('2026-01-01T00:00:00Z', 86400 * 3)).toMatch(/3 days ago/)
  })

  it('never reports a future timestamp as negative', () => {
    expect(at('2026-01-01T00:00:00Z', -500)).toMatch(/now/)
  })
})

describe('clock and stamp', () => {
  it('renders the clock in 24-hour form', () => {
    expect(clock('2026-01-02T15:04:05Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('renders a stamp without seconds', () => {
    const out = stamp('2026-01-02T15:04:05Z')
    expect(out).toMatch(/2026/)
    expect(out).not.toMatch(/:05/)
  })

  it('uses the Azerbaijani locale when asked', () => {
    expect(stamp('2026-01-02T15:04:05Z', 'az')).not.toBe(stamp('2026-01-02T15:04:05Z', 'en'))
  })

  it('renders a missing timestamp as a dash', () => {
    expect(stamp(null)).toBe('—')
  })

  it('shows an unparseable timestamp raw rather than blanking it', () => {
    expect(stamp('not-a-date')).toBe('not-a-date')
  })

  it('stays on a 24-hour clock', () => {
    expect(stamp('2026-01-02T15:04:00Z')).not.toMatch(/[ap]m/i)
  })
})
