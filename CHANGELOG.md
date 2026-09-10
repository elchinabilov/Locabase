# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- The IPC boundary is validated at runtime. `IpcContract` is erased at build
  time, so nothing established the shape of a renderer payload before it
  reached `spawn` argv, filesystem paths and SQL identifier quoting. Every
  channel now has a schema, checked before dispatch.
- `projects:update` accepted an unfiltered patch, which made `envFile`
  renderer-controllable and turned `env:read`/`env:write` into an arbitrary
  file read and write. Patches are restricted to an allowlist and paths are
  proved to stay inside the project.
- The self-hosted backup script left the project id unquoted and pasted the
  retention days straight into `find -mtime`. Both are now quoted or coerced.
- `sshHost` reached an `ssh`/`rsync` argv unvalidated; a leading `-` is read as
  an option. Validated on save, with `--` closing option parsing at the call.
- `stack:tailLogs` accepted any container on the host. Scoped to the project's.
- Errors crossing back to the renderer are redacted, `config:write` is limited
  to keys the form actually renders, and top-level navigation away from the app
  is refused.

### Fixed

- Checking rows in the table editor and then changing page acted on whichever
  rows landed in those positions next — the selection was held by index.
  Selection and the open row editor are now keyed by primary key.
- Adding the first environment from the Sync screen's empty state left the panel
  unreachable.
- Switching project carried the previous project's environment id into the
  Migrations, Functions and Sync queries.
- Following a foreign key into another schema landed on nothing.
- A failed start, stop, restart, deploy, serve, upload or log tail changed
  nothing on screen. Sync's "Dry run" discarded its result entirely.
- A render error blanked the window with no way back; screens now fail in place.
- `pg_dump`/`psql` output was truncated one line short of the requested limit.
- json and array columns rendered as `[object Object]` in the results grid.
- The stack's connection pool and column cache outlived a removed project, and
  `supabase functions serve` outlived the app, holding its port.

### Changed

- Dialogs are proper `role="dialog"` elements with a focus trap, focus
  restoration, and an Escape that no longer closes the dialog underneath.
- One `stack:status` poll per project instead of three, so the Overview screen,
  the sidebar and the database gate no longer each inspect every container.
- The main process emits English only; `editableReason` crosses as a code the
  renderer translates, so an English UI no longer showed Azerbaijani.

### Internal

- ESLint, Prettier, lint-staged and Dependabot; `lint`, `format:check` and a
  coverage gate in CI, now including a Windows runner.
- Test coverage from 27% to 43%, with a jsdom project for the renderer.
- `shared/types.ts` split by domain; the three near-identical process runners in
  `cli.ts` share one lifecycle; the async-action pattern fifteen screens had
  each written by hand is one hook.

## [1.2.0] — 2026-09-09

### Added

- **Edge Functions** — Functions and Secrets moved into one section with a
  resizable sidebar.
- **Settings** — split into separate pages, also with a resizable sidebar.
- Saved queries can be renamed from the SQL screen.
- The app version is shown in the sidebar footer.

## [1.1.0] — 2026-09-09

### Added

- **Backups** — take a dump of the local stack or a remote environment, keep it
  locally or upload it to an S3-compatible bucket, restore one over any target
  with a typed confirmation, and schedule the whole thing.
- **Users** — the GoTrue user table with filtering, paging, a detail panel,
  ban/unban and delete.
- **Light theme**, selectable in Settings alongside system and dark.
- **English interface** — the second dictionary, with English as the default.
- Resizable panes on the SQL and Tables screens, remembered between sessions.

## [1.0.0] — 2026-09-08

First public release.

### Added

- **Overview** — per-service toggles backed by `config.toml` `enabled` keys,
  per-container RAM usage, start/stop/restart/`db reset`, direct links to
  Studio, Mailpit, the API and the database, and port-collision warnings.
- **Configuration** — 108 `config.toml` fields as a form across 14 groups, with
  a diff preview before writing and a restart banner when a change needs one.
- **Auth** — 19 OAuth providers, automatic callback-URL computation, and
  `env()` wiring to the project's `.env`.
- **Secrets** — root `.env` editor with masking and a list of the empty
  references `config.toml` expects.
- **Tables** — schema/table browser with filtering, sorting and pagination, row
  create/edit/delete, and a structure view (type, PK, FK, default).
- **SQL** — CodeMirror editor with schema autocompletion and ⌘↵ execution,
  read-only mode enforced server-side, multi-statement script results, saved
  queries stored in the repo, and "save as migration".
- **Migrations** — files, local ledger and remote ledger side by side, with
  new/up/diff/repair.
- **Functions** — list, create from template, serve locally, `verify_jwt`, and
  single or bulk deploy.
- **Sync / Deploy** — diff across five axes (migrations, schema, functions,
  secrets, auth), file-by-file content diff for functions, selective deploy, dry
  run, and on/off plus RAM for remote containers.
- **Project creation** — `supabase init` in a chosen folder with a free port
  block assigned automatically, so a new stack never collides with existing ones.
- **Comment-preserving `config.toml` patcher** — surgical offset-range
  replacement, re-parsed and verified before writing, with a `.bak` on every write.
- **AZ/EN interface** — English by default, Azerbaijani available in Settings.
- Apache-2.0 license, English documentation, contributor guide and CI.

### Known limitations

- No selective migration apply on managed projects — `supabase db push` applies
  everything pending.
- No remote comparison for auth configuration yet.
- Multi-statement SQL scripts run as one implicit transaction, unlike `psql`.
- The table editor uses offset pagination, so far pages of large tables are slow.
- Builds are unsigned and not notarized, and there is no auto-update.

[Unreleased]: https://github.com/elchinabilov/Locabase/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/elchinabilov/Locabase/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/elchinabilov/Locabase/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/elchinabilov/Locabase/releases/tag/v1.0.0
