# Regenerating the screenshots

The README images are generated, not taken by hand, so they stay consistent and
never leak a real project name.

```bash
./scripts/demo-project.sh   # create ~/locabase-demo and start its stack
npm run screenshots         # write docs/screenshots/*.png
```

Capture a single screen by name:

```bash
npm run screenshots sql tables
```

When you are done:

```bash
./scripts/demo-project.sh --stop
```

## How it works

`scripts/capture-screenshots.mjs` runs `electron-vite dev` once per screenshot
with three environment variables read by `src/main/index.ts`:

| Variable | Meaning |
| --- | --- |
| `LOCABASE_SHOT` | file to write the PNG to |
| `LOCABASE_SHOT_JS` | JavaScript evaluated in the page first — it opens the screen |
| `LOCABASE_SHOT_DELAY` | how long to wait before running that JavaScript |
| `LOCABASE_SHOT_WAIT` | how long to wait after it, before capturing |
| `LOCABASE_SHOT_WIDTH` | downscales the Retina-sized capture (1360 for the README) |

Two details make it reproducible:

- The app is started with a scratch `--user-data-dir`, and the script seeds a
  `projects.json` there containing only the demo project. Your real projects
  never appear in the sidebar.
- Navigation clicks `[data-route="<id>"]` in the sidebar, so a label change
  doesn't break the script.

`scripts/demo-project.sh` builds the demo project: a small blog schema, seed
data, two edge functions, four migrations (one deliberately left unapplied so the
Migrations screen shows a pending row), two enabled OAuth providers, and a `.env`
with placeholder secrets. Its ports live in the 583xx block so it never collides
with a real stack on the same machine.

## Adding a screenshot

Add an entry to `SHOTS` in `scripts/capture-screenshots.mjs`:

```js
{ name: 'settings', js: openRoute('settings'), wait: 2500 }
```

Then reference `docs/screenshots/settings.png` from the README.
