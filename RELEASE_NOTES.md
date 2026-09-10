# Release notes — v1.2.0 (in progress)

A running list for the next release. One short entry per piece of work, in the
order it landed. When the release is cut, this is folded into `CHANGELOG.md`
under a dated heading and the file is emptied for the version after it.

**Version:** 1.2.0 — two screens reorganized, one new behaviour, and a security
pass, all on top of 1.1.0. Nothing changes about the project registry, the
`config.toml` format or the saved-query layout on disk, so the minor number moves
and the major stays put (semver).

## Added

- **Edge Functions is one section, not two sidebar entries.** Functions and
  Secrets sat next to each other in the root navigation and were used together
  every time — deploying a function and setting the key it needs is one task, not
  two screens a list apart. They are now the two pages of an **Edge Functions**
  section, behind a resizable sidebar of their own.
- **Settings is a section with its own pages.** The four groups had nothing to do
  with one another — a colour scheme, a language, a bucket's credentials, the
  state of the machine — and stacking them in one scroll made the last of them
  invisible. Each is a page now: **Appearance** (theme and typography),
  **Language**, **Storage** (S3-compatible connections) and **System** (the
  CLI/Docker check and the port picture), behind a resizable sidebar. Which page
  is open is held by the shell, so another screen can send you straight to the one
  it means: the Backups screen's link to storage connections lands on Storage
  rather than on Settings at large.
- **Saved queries can be renamed from the SQL screen**, from the same list they
  are opened and deleted in, instead of being deleted and written again.
- **The app version is shown in the sidebar footer**, baked in at build time from
  `package.json` so it cannot drift from what you are actually running.
- **Every screen comes back where you left it.** A route used to lose everything
  the moment you left it, so walking through the sidebar and back cost the same
  three clicks every time — and a restart cost all of them. Now restored, per
  project: the selected project and screen, the open Settings, Authentication and
  Edge Functions page, the log drawer, the environment picked on SQL, Tables,
  Users, Migrations, Functions, Sync and Backups, the schema and selected table
  with its Rows/Structure tab, **each table's own sort, filters and page size**,
  the Users filters, the Configuration group and search box, the open provider
  panel, the expanded service row on Overview, the backup scope and destination,
  and the **SQL buffer itself** — saved or not, because an unsaved query is often
  the reason the app is still open.

  It costs one `localStorage` entry, read and parsed once at startup and then
  served from memory; a write updates that copy and arms a 250 ms trailing flush,
  so a keystroke in a filter box costs a property assignment rather than a
  serialize, and the whole thing reaches the disk at most four times a second.
  Every value is validated on the way back in and ids are re-derived against what
  is actually there, so a removed environment, a dropped schema or a deleted
  storage connection falls back to the default instead of being queried. What a
  project remembered is dropped when the project leaves the registry, a table's
  row view is kept for the twenty most recent tables, and a single text over
  200 KB is not remembered at all — one runaway paste cannot fill the quota.

  Four things stay deliberately unremembered, each for a reason: SQL's
  **read-only** switch, which still resets on every open; unsaved Configuration
  and Secrets drafts, which would otherwise come back as an invisible pending
  write against a file that may have changed underneath them; **"reveal
  secrets"**, which starts masked every time; and the page number of a paged list,
  because page 4 of yesterday's rows is not page 4 today.

## Security

- **The IPC boundary is checked at runtime.** `IpcContract` is erased at build
  time, so nothing established the shape of a renderer payload before it reached
  `spawn` argv, filesystem paths and SQL identifier quoting. Every channel now
  has a schema, parsed before dispatch — and the map is typed against the channel
  list, so adding a channel without a schema is a compile error rather than a
  hole.
- **`projects:update` accepted an unfiltered patch.** That made `envFile`
  renderer-controllable, which turned `env:read` and `env:write` into an arbitrary
  file read and write. Patches are now restricted to an allowlist of three fields,
  and every path is proved to stay inside the project folder.
- **The self-hosted backup script left the project id unquoted** and pasted the
  retention days straight into `find -mtime`. Both are quoted or coerced now.
- **`sshHost` reached an `ssh`/`rsync` argv unvalidated**, where a leading `-` is
  read as an option rather than a host. It is validated on save, and `--` closes
  option parsing at the call site.
- **`stack:tailLogs` accepted any container on the host.** Scoped to the
  project's own.
- **Errors crossing back to the renderer are redacted**, `config:write` is limited
  to the keys the form actually renders, and top-level navigation away from the
  app is refused.

## Fixed

- **Checking rows in the table editor and then changing page acted on whichever
  rows landed in those positions next** — the selection was held by row index,
  which is only meaningful for the page that produced it. The selection and the
  open row editor are keyed by primary key now.
- **Adding the first environment from the Sync screen's empty state left the panel
  unreachable**, because the environment id had been seeded once at mount.
- **Switching project carried the previous project's environment id** into the
  Migrations, Functions and Sync queries.
- **Following a foreign key into another schema landed on nothing.**
- **A failed start, stop, restart, deploy, serve, upload or log tail changed
  nothing on screen** — the rejection was unhandled. Sync's "Dry run" discarded
  its result entirely.
- **A render error blanked the window with no way back.** Screens fail in place
  now, one boundary per route, so the sidebar stays usable and navigating away
  clears the failure.
- **`pg_dump`/`psql` output was truncated one line short of the requested limit.**
- **json and array columns rendered as `[object Object]`** in the results grid.
- **The connection pool and column cache outlived a removed project**, and
  `supabase functions serve` outlived the app, holding its port.

## Changed

- **Dialogs are real dialogs.** Proper `role="dialog"`, a focus trap, focus
  restored to whatever opened them, and an Escape that closes the top dialog
  rather than the one underneath it.
- **One `stack:status` poll per project instead of three.** The Overview screen,
  the sidebar and the database gate no longer each inspect every container; they
  share one refcounted poll.
- **The main process emits English only.** `editableReason` crosses the boundary
  as a code the renderer translates, so an English interface no longer showed
  Azerbaijani sentences from the backend.

## Internal

- **ESLint, Prettier, lint-staged, Husky and Dependabot**, with `format:check`,
  `lint` and a coverage gate in CI — now including a Windows runner alongside
  Linux and macOS.
- **Test coverage from 27% to 43%**, 333 tests, with a jsdom project for the
  renderer's hooks and components next to the Node one for the main process.
- **The big files are split.** `shared/types.ts` by domain; the two largest
  screens into their parts; the three near-identical process runners in `cli.ts`
  share one lifecycle; what the two remote adapters had in common is written once;
  and the async-action pattern fifteen screens had each written by hand is one
  hook.
