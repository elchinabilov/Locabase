import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/main/**', 'src/shared/**', 'src/renderer/src/lib/**'],
      // Thresholds start at what is covered today, so the number can only go up.
      thresholds: { statements: 27, branches: 84, functions: 56, lines: 27 }
    }
  }
})
