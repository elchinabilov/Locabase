import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { registerIpc, pipeEvents } from './ipc/router.js'
import { stopAllTails } from './core/docker.js'
import { stopAllServes } from './core/functions.js'
import { closeAll as closeSqlPools } from './core/sql/pool.js'
import { migrateUserData } from './core/userdata.js'
import { fixPath } from './core/env-path.js'
import { logBus } from './core/log.js'
import * as prefs from './core/prefs.js'
import * as scheduler from './core/scheduler/index.js'

// In dev the package name is used, in production `productName` — the name is
// pinned here, before anything else, so both point at the same folder.
app.setName('Locabase')

// Launched from Finder or a .dmg, the GUI process does not inherit the login
// shell's PATH — `supabase` and other CLIs go missing. Restore PATH first.
fixPath()

function createWindow(): BrowserWindow {
  // Set before the window exists, so the first frame is already the right
  // colour — the renderer confirms the same choice a moment later.
  nativeTheme.themeSource = prefs.theme()
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: prefs.BACKGROUND[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'],
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // The OS sandbox stays off because the preload is built as ESM
      // (`index.mjs`) and a sandboxed preload must be CommonJS. The renderer is
      // still isolated: `contextIsolation` is on, Node is off, the bridge is a
      // fixed channel allowlist and `index.html` carries a `default-src 'self'`
      // CSP. Turning this on means moving the preload build to CJS first.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    // Dev-only: writes a picture of the GUI to a file. For headless checks and
    // for the README screenshots — `LOCABASE_SHOT=/path/shot.png npm run dev`.
    // `LOCABASE_SHOT_JS` is JavaScript evaluated in the page first (to open a
    // route), `LOCABASE_SHOT_DELAY` is how long to wait before capturing, and
    // `LOCABASE_SHOT_WIDTH` downscales the (Retina-sized) capture before writing.
    const shot = process.env['LOCABASE_SHOT']
    if (is.dev && shot) {
      const js = process.env['LOCABASE_SHOT_JS']
      setTimeout(
        () => {
          void (js ? win.webContents.executeJavaScript(js) : Promise.resolve())
            .then(
              () =>
                new Promise((r) =>
                  setTimeout(r, js ? Number(process.env['LOCABASE_SHOT_WAIT'] ?? 2500) : 0)
                )
            )
            .then(() => win.webContents.capturePage())
            .then((img) => {
              const width = Number(process.env['LOCABASE_SHOT_WIDTH'] ?? 0)
              const out = width > 0 ? img.resize({ width, quality: 'best' }) : img
              writeFileSync(shot, out.toPNG())
            })
            .catch(() => undefined)
        },
        Number(process.env['LOCABASE_SHOT_DELAY'] ?? 4000)
      )
    }
  })

  // External links open in the system browser — never inside the window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // `setWindowOpenHandler` only covers `window.open`. A top-level navigation
  // (`location.href = …`) would replace the app with a remote origin that still
  // has the preload bridge attached, so it is refused and sent to the browser.
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (url.startsWith('file://') || (devUrl && url.startsWith(devUrl))) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  // Nothing in the renderer needs a camera, a microphone or a location.
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('app.locabase')

  const migrated = migrateUserData()
  if (migrated) logBus.push('app', 'info', `Old settings migrated: ${migrated}`)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  registerIpc()
  pipeEvents()
  // Scheduled backups only run while the app is open — arm them once it is.
  scheduler.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

/** Everything that owns a child process, a socket or a timer. */
function releaseAll(): void {
  stopAllTails()
  stopAllServes()
  closeSqlPools()
}

app.on('window-all-closed', () => {
  releaseAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  releaseAll()
  scheduler.stop()
})

/**
 * The last line of defence. A rejected promise nobody awaited would otherwise
 * take the whole main process down — and with it the user's running stack — so
 * it is logged to the panel the user already has open instead.
 */
process.on('unhandledRejection', (reason) => {
  logBus.push('app', 'error', `unhandled rejection: ${String(reason)}`)
})

process.on('uncaughtException', (err) => {
  logBus.push('app', 'error', `uncaught exception: ${err.message}`)
})
