import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run, runFromFile, runToFile } from '../src/main/core/cli.js'

/**
 * These drive real processes rather than mocking `spawn`: the point of
 * `spawnManaged` is the lifecycle around the child — timeouts, signals, the
 * once-only settle — and none of that is exercised by a mock.
 */

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'locabase-cli-'))
}

describe('run', () => {
  it('collects stdout and reports success', async () => {
    const res = await run('echo', ['hello'], { quiet: true })
    expect(res.ok).toBe(true)
    expect(res.code).toBe(0)
    expect(res.output.trim()).toBe('hello')
    expect(res.error).toBeNull()
  })

  it('reports a non-zero exit without throwing', async () => {
    const res = await run('sh', ['-c', 'exit 3'], { quiet: true })
    expect(res.ok).toBe(false)
    expect(res.code).toBe(3)
  })

  it('collects stderr alongside stdout', async () => {
    const res = await run('sh', ['-c', 'echo out; echo err 1>&2'], { quiet: true })
    expect(res.output).toContain('out')
    expect(res.output).toContain('err')
  })

  it('passes stdin through `input`', async () => {
    const res = await run('cat', [], { quiet: true, input: 'piped' })
    expect(res.output).toBe('piped')
  })

  it('reports a missing binary as an error rather than a rejection', async () => {
    const res = await run('locabase-does-not-exist', [], { quiet: true })
    expect(res.ok).toBe(false)
    expect(res.code).toBeNull()
    expect(res.error).toMatch(/not found/)
  })

  it('kills a command that outruns its timeout', async () => {
    const res = await run('sleep', ['30'], { quiet: true, timeoutMs: 150 })
    expect(res.ok).toBe(false)
  })

  it('kills a command when its signal aborts', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    const res = await run('sleep', ['30'], { quiet: true, signal: controller.signal })
    expect(res.ok).toBe(false)
  })

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const res = await run('sleep', ['30'], { quiet: true, signal: controller.signal })
    expect(res.ok).toBe(false)
  })

  it('keeps only the trailing lines of a long output', async () => {
    const res = await run('sh', ['-c', 'seq 1 500'], { quiet: true, maxOutputLines: 5 })
    const lines = res.output.trim().split('\n')
    expect(lines).toHaveLength(5)
    expect(lines.at(-1)).toBe('500')
  })

  it('honours a raised output limit', async () => {
    const res = await run('sh', ['-c', 'seq 1 500'], { quiet: true, maxOutputLines: 1000 })
    expect(res.output.trim().split('\n')).toHaveLength(500)
  })

  it('runs in the given working directory', async () => {
    const dir = tmp()
    try {
      const res = await run('pwd', [], { quiet: true, cwd: dir })
      // macOS reports /private/var for /var, so compare the tail.
      expect(res.output.trim().endsWith(dir.replace(/^\/private/, ''))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes extra environment variables', async () => {
    const res = await run('sh', ['-c', 'echo $LOCABASE_TEST'], {
      quiet: true,
      env: { LOCABASE_TEST: 'set' }
    })
    expect(res.output.trim()).toBe('set')
  })
})

describe('runToFile', () => {
  it('streams stdout into the file and reports its size', async () => {
    const dir = tmp()
    const out = join(dir, 'dump.bin')
    try {
      const { bytes } = await runToFile('sh', ['-c', 'printf abcdef'], out, { quiet: true })
      expect(bytes).toBe(6)
      expect(readFileSync(out, 'utf8')).toBe('abcdef')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('deletes a half-written file when the command fails', async () => {
    const dir = tmp()
    const out = join(dir, 'dump.bin')
    try {
      // A half-written dump is worse than none: it looks like a valid backup.
      await expect(
        runToFile('sh', ['-c', 'printf partial; exit 1'], out, { quiet: true })
      ).rejects.toThrow()
      expect(() => readFileSync(out)).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects when the binary is missing', async () => {
    const dir = tmp()
    try {
      await expect(
        runToFile('locabase-does-not-exist', [], join(dir, 'x'), { quiet: true })
      ).rejects.toThrow(/not found/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('runFromFile', () => {
  it('streams the file into stdin', async () => {
    const dir = tmp()
    const input = join(dir, 'in.sql')
    try {
      writeFileSync(input, 'select 1;')
      const res = await runFromFile('cat', [], input, { quiet: true })
      expect(res.ok).toBe(true)
      expect(res.output).toBe('select 1;')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a missing input file as an error, not a crash', async () => {
    const res = await runFromFile('cat', [], '/locabase/definitely/missing', { quiet: true })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/ENOENT|no such file/i)
  })

  it('does not report EPIPE when the command exits before reading', async () => {
    const dir = tmp()
    const input = join(dir, 'big.sql')
    try {
      writeFileSync(input, 'x'.repeat(2_000_000))
      const res = await runFromFile('sh', ['-c', 'exit 2'], input, { quiet: true })
      expect(res.ok).toBe(false)
      // The exit code is the real error; a broken pipe is noise on top of it.
      expect(res.code).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
