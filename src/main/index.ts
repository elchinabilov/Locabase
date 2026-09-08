import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { app, BrowserWindow, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { registerIpc, pipeEvents } from './ipc/router.js'
import { stopAllTails } from './core/docker.js'
import { closeAll as closeSqlPools } from './core/sql/pool.js'
import { migrateUserData } from './core/userdata.js'
import { fixPath } from './core/env-path.js'
import { logBus } from './core/log.js'

// Dev-də paket adı, produksiyada `productName` işlənir — ikisi eyni qovluğa
// baxsın deyə adı burada, hər şeydən əvvəl sabitləyirik.
app.setName('Locabase')

// Finder/.dmg-dən açılanda GUI prosesi login shell PATH-ini almır — `supabase`
// və digər CLI-lər tapılmır. Hər şeydən əvvəl PATH-i bərpa edirik.
fixPath()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    // Dev-only: GUI-nin görüntüsünü fayla yazır. Başsız yoxlama üçün —
    // `SUPAGUI_SHOT=/yol/shot.png npm run dev`.
    const shot = process.env['SUPAGUI_SHOT']
    if (is.dev && shot) {
      const js = process.env['SUPAGUI_SHOT_JS']
      setTimeout(
        () => {
          void (js ? win.webContents.executeJavaScript(js) : Promise.resolve())
            .then(() => new Promise((r) => setTimeout(r, js ? 2500 : 0)))
            .then(() => win.webContents.capturePage())
            .then((img) => writeFileSync(shot, img.toPNG()))
            .catch(() => undefined)
        },
        Number(process.env['SUPAGUI_SHOT_DELAY'] ?? 4000)
      )
    }
  })

  // Xarici linklər sistem brauzerində açılır — pəncərənin içində yox.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

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
  if (migrated) logBus.push('app', 'info', `Köhnə ayarlar köçürüldü: ${migrated}`)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  registerIpc()
  pipeEvents()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAllTails()
  closeSqlPools()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAllTails()
  closeSqlPools()
})
