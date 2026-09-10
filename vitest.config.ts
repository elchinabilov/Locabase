import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Two projects, because the two halves of the app run in two different places.
 * `node` covers the main process and the pure shared logic; `dom` covers the
 * renderer's hooks and components, which need a document.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          globals: true,
          setupFiles: ['tests/setup-dom.ts']
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/main/**', 'src/shared/**', 'src/renderer/src/lib/**'],
      // Thresholds start at what is covered today, so the number can only go up.
      thresholds: { statements: 43, branches: 86, functions: 66, lines: 43 }
    }
  }
})
