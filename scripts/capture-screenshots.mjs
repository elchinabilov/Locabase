/**
 * Generates the README screenshots in `docs/screenshots/`.
 *
 * Each shot is one full `electron-vite dev` run: the app is started with a
 * scratch `--user-data-dir` (so only the demo project shows up in the sidebar),
 * a snippet of JavaScript opens the screen we want, and the main process writes
 * a PNG through `LOCABASE_SHOT` (see `src/main/index.ts`).
 *
 * Prerequisites — see docs/screenshots.md:
 *  - a demo project at `~/locabase-demo` with its stack running
 *    (`supabase start`), created from `scripts/demo-project.sh`;
 *  - Docker running.
 *
 * Usage: npm run screenshots
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'docs', 'screenshots')
const DEMO = process.env['LOCABASE_DEMO_DIR'] ?? join(homedir(), 'locabase-demo')
const UDATA = join(tmpdir(), 'locabase-shots-userdata')

/** Clicks a sidebar entry by its route id (`data-route` in `app.tsx`). */
const openRoute = (route) => `document.querySelector('[data-route="${route}"]').click()`

/** Clicks the first element whose text content contains `text`. */
const clickText = (selector, text) =>
  `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (el) el.click() })()`

const SHOTS = [
  { name: 'overview', js: null, wait: 0, delay: 9000 },
  {
    // The 'General' group has a single field; 'Auth Email' shows what a real
    // group looks like.
    name: 'configuration',
    js: `${openRoute('config')}; setTimeout(() => { ${clickText('button', 'Auth Email')} }, 1500)`,
    wait: 4000
  },
  { name: 'auth', js: openRoute('auth'), wait: 2500 },
  {
    name: 'tables',
    js: `${openRoute('tables')}; setTimeout(() => { ${clickText('aside button', 'posts')} }, 2500)`,
    wait: 7000
  },
  {
    name: 'sql',
    js: `${openRoute('sql')};
         setTimeout(() => { ${clickText('aside button', 'top posts')} }, 2000);
         setTimeout(() => { ${clickText('button', 'Run')} }, 4000)`,
    wait: 9000
  },
  { name: 'migrations', js: openRoute('migrations'), wait: 3500 },
  { name: 'functions', js: openRoute('functions'), wait: 3500 },
  { name: 'secrets', js: openRoute('secrets'), wait: 3000 }
]

function seedRegistry() {
  rmSync(UDATA, { recursive: true, force: true })
  mkdirSync(UDATA, { recursive: true })
  const registry = {
    projects: [
      {
        id: randomUUID(),
        name: 'demo',
        path: DEMO,
        projectId: 'demo',
        envFile: '.env',
        environments: [],
        addedAt: new Date().toISOString()
      }
    ]
  }
  writeFileSync(join(UDATA, 'projects.json'), `${JSON.stringify(registry, null, 2)}\n`)
}

function capture(shot) {
  return new Promise((done, fail) => {
    const file = join(OUT, `${shot.name}.png`)
    rmSync(file, { force: true })
    const child = spawn('npx', ['electron-vite', 'dev', '--', `--user-data-dir=${UDATA}`], {
      cwd: ROOT,
      stdio: 'ignore',
      env: {
        ...process.env,
        LOCABASE_SHOT: file,
        LOCABASE_SHOT_JS: shot.js ?? '',
        LOCABASE_SHOT_DELAY: String(shot.delay ?? 7000),
        LOCABASE_SHOT_WAIT: String(shot.wait ?? 2500),
        // The window is 1360×900; capture is Retina-sized, so scale back down.
        LOCABASE_SHOT_WIDTH: '1360'
      }
    })
    const deadline = Date.now() + 90_000
    const poll = setInterval(() => {
      if (existsSync(file)) {
        clearInterval(poll)
        // give the write a moment to flush before killing the app
        setTimeout(() => {
          child.kill('SIGTERM')
          done(file)
        }, 500)
      } else if (Date.now() > deadline) {
        clearInterval(poll)
        child.kill('SIGKILL')
        fail(new Error(`${shot.name}: timed out waiting for ${file}`))
      }
    }, 500)
  })
}

if (!existsSync(join(DEMO, 'supabase', 'config.toml'))) {
  process.stderr.write(`No demo project at ${DEMO}. Create one first — see docs/screenshots.md.\n`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
seedRegistry()

const only = process.argv.slice(2)
const queue = only.length > 0 ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS

for (const shot of queue) {
  process.stdout.write(`· ${shot.name} … `)
  const file = await capture(shot)
  process.stdout.write(`${file}\n`)
}

process.stdout.write(`\n${queue.length} screenshot(s) written to ${OUT}\n`)
