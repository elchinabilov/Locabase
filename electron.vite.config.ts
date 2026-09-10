import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared, '@main': resolve('src/main') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@shared': shared, '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    /* The renderer shows the app version in the sidebar footer; baked in at
       build time so it never drifts from package.json. */
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
})
