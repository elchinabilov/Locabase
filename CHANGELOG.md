# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-09-08

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

[Unreleased]: https://github.com/elchinabilov/Locabase/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/elchinabilov/Locabase/releases/tag/v0.2.0
