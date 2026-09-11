# Release notes — v1.2.1 (in progress)

A running list for the next release. One short entry per piece of work, in the
order it landed. When the release is cut, this is folded into `CHANGELOG.md`
under a dated heading and the file is emptied for the version after it.

**Version:** 1.2.1 — three fixes on the path from a local migration file to a
remote database, all found by walking that path end to end on a self-hosted
project that had never been deployed to. No screen moves, no new setting, and
nothing changes on disk — the project registry, `config.toml` handling and the
saved-query layout are untouched — so only the patch number moves (semver).

## Fixed

- **A command that failed said only "Failed."** A CLI that exits non-zero reports
  why on its own stdout and stderr; nothing about the spawn itself went wrong, so
  the runner had no error to hand back and every screen that surfaces one showed
  the generic string instead. The real message was in the log drawer, one click
  away, which is exactly where you do not look when a button has just failed.
  A non-zero exit now carries the tail of the output as its message, so **Apply
  locally** reports the Postgres error that stopped the migration, on the screen
  that ran it.
- **A remote that had never had a migration applied read as unreachable.**
  `supabase_migrations.schema_migrations` does not exist on a database the CLI
  has never pushed to, so the ledger read failed with `relation … does not
exist`, the Migrations screen reported the remote ledger unreachable, and the
  remote column fell back to `–` for every row — the one situation where the
  answer is simply _nothing is applied yet_. The read now checks for the table
  first and reports an empty ledger without touching anything; deploying and
  repairing create the schema and table before they write, in the shape the CLI
  creates for itself. A first deploy to a fresh self-hosted database goes through
  on its own, with no manual bootstrap.
- **Names in the remote ledger came back glued to their versions.** The ledger
  query separated the two with `'\t'`, which with `standard_conforming_strings`
  on — the default — is a backslash followed by a `t`, not a tab. Every row then
  failed the version check and was dropped, so a remote with migrations applied
  read as an empty ledger and each file showed as pending. The separator is now
  `E'\t'`.
