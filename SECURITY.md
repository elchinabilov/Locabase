# Security Policy

## Supported versions

Only the latest release receives security fixes.

| Version | Supported |
| --- | --- |
| 1.0.x | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

**Do not open a public issue.** Email **abilovelchin@gmail.com** with:

- what the issue is and which component it affects
  (`main/core/remote/`, the TOML patcher, secret storage, the SQL layer, …),
- steps to reproduce, or a proof of concept,
- the impact you think it has.

You will get an acknowledgement within 72 hours and an assessment within 7 days.
Fixes are released before the report is made public, and you will be credited in
the changelog unless you prefer otherwise.

## What Locabase handles

Locabase touches material worth reporting carefully:

- **Supabase access tokens and database passwords** — stored via Electron
  `safeStorage` (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
- **Project `.env` files** — read and written on disk in place.
- **SSH access to self-hosted servers** — commands are executed remotely over
  the user's own SSH configuration.
- **Direct Postgres connections** — local, and remote when the user opts in.

Anything that leaks a secret into a log line, a CLI argument, a crash report or
a temporary file with loose permissions is in scope. See
[docs/security.md](docs/security.md) for the guarantees the code is meant to keep.

## Out of scope

- Vulnerabilities in the `supabase` CLI, Docker, or Supabase itself — report
  those to their maintainers.
- Findings that require an attacker to already have local code execution as the
  user running Locabase.
- Unsigned/unnotarized builds — a known limitation, documented in the README.
