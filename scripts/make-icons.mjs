/**
 * SVG → PNG. Sistemdə rsvg/inkscape olmadığına görə rasterləşdirməni Electron-un
 * öz Chromium-u edir: SVG ekrandan kənarda bir pəncərədə açılır və `capturePage`
 * ilə yazılır.
 *
 *   npx electron scripts/make-icons.mjs
 *
 * Nəticə: resources/icon.png (1024 — electron-builder buradan .icns/.ico düzəldir)
 * və resources/logo-{256,128,64}.png.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'locabase-icons-'))

/** Bütün işlər üçün tək pəncərə: hər dəfə yeni pəncərə açmaq yarışa səbəb olur. */
let win = null

async function render(svgPath, size) {
  const svg = readFileSync(join(root, svgPath), 'utf8')
  const page = join(work, `${size}-${svgPath.replace(/\W/g, '_')}.html`)
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  )

  if (!win) {
    // Pəncərə göstərilir, amma ekrandan kənarda: heç vaxt göstərilməyən pəncərə
    // kompozisiya olunmur və `capturePage` sonsuz gözləyir.
    win = new BrowserWindow({
      width: 1024,
      height: 1024,
      x: -4000,
      y: -4000,
      show: true,
      frame: false,
      transparent: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { backgroundThrottling: false }
    })
  }

  await win.loadFile(page)
  await new Promise((r) => setTimeout(r, 450))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  return image.toPNG()
}

app.whenReady().then(async () => {
  const jobs = [
    ['resources/icon.svg', 1024, 'resources/icon.png'],
    ['resources/logo.svg', 256, 'resources/logo-256.png'],
    ['resources/logo.svg', 128, 'resources/logo-128.png'],
    ['resources/logo.svg', 64, 'resources/logo-64.png']
  ]
  try {
    for (const [src, size, out] of jobs) {
      const png = await render(src, size)
      writeFileSync(join(root, out), png)
      process.stdout.write(`${out}  ${size}x${size}  ${Math.round(png.length / 1024)} KB\n`)
    }
  } catch (err) {
    process.stderr.write(`XƏTA: ${err.stack ?? err}\n`)
    process.exitCode = 1
  } finally {
    win?.destroy()
    rmSync(work, { recursive: true, force: true })
    app.quit()
  }
})
