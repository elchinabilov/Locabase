# Security model

Locabase handles access tokens, database passwords, SSH access and `.env` files.
These are the guarantees the code is written to keep. If you find a way around
one of them, please report it privately — see [SECURITY.md](../SECURITY.md).

## Secrets never become command-line arguments

Anything on a process's argument list is visible to every user on the machine
through `ps`. So secret values travel another way:

| Path | How the value travels |
| --- | --- |
| Managed secrets | `supabase secrets set --env-file <tmp>` — a temporary file with 0600 permissions, deleted afterwards |
| Self-hosted secrets | piped to the remote script over **stdin** |
| Access tokens | the `SUPABASE_ACCESS_TOKEN` environment variable |
| SSH | the user's own ssh-agent / key files |

`run()` in [`src/main/core/cli.ts`](../src/main/core/cli.ts) is the single place
external commands are spawned, and it takes `input` for exactly this reason.

## Every log line is redacted

`redact()` in [`src/main/core/log.ts`](../src/main/core/log.ts) runs over every
line that reaches the log bus — CLI output, docker logs, deploy steps — and hides:

- JWTs (`eyJ…`),
- `sb_secret_…` and `sbp_…` keys,
- the value in a `KEY=value` assignment (the key name stays),
- the password inside a Postgres connection URL.

This is the second layer, not the first. The first is that secrets are not passed
as arguments in the first place.

## Tokens are stored by the OS keychain

Remote access tokens and SSH passwords go through Electron `safeStorage`:
Keychain on macOS, DPAPI on Windows, libsecret on Linux. If encryption is not
available, Locabase **does not store the value at all** and asks again next
time — a false sense of security is worse than a prompt.

The project registry on disk holds only paths and environment metadata. It never
holds a secret value, and it never caches `config.toml` or `.env` content.

## Destructive actions are confirmed by typing the project name

`db reset` and remote deploys require the user to type the project's name. A
mismatch aborts before anything runs. A remote schema change is always preceded
by a backup, and the deploy order is fixed: **backup → migrations → functions →
secrets → verify**.

## Read-only is enforced by the server, not by a regex

The SQL editor's read-only mode is on by default and resets on every open. It is
enforced by `begin read only` (local and self-hosted) or the Management API's
`read_only` flag (managed).

It is never enforced by inspecting the SQL text, because this passes any pattern
you can write:

```sql
with x as (delete from users returning *) select * from x;
```

## SQL injection

Two rules, both mechanical:

1. **Values are always `$n` parameters** on the local path. There is no code path
   in [`sql/build.ts`](../src/main/core/sql/build.ts) that pastes a value into
   SQL text.
2. **Identifiers always go through `quoteIdent()`** *and* must first appear in
   the column list returned by introspection (`requireColumn`).

The remote transports cannot bind parameters, so values in queries Locabase
builds itself are inlined with `quoteLiteral()` (`standard_conforming_strings`
assumed). SQL the user typed never passes through that function — it is sent as
written, to a connection that is read-only unless the user turned that off.

## Path traversal

Saved query names are validated against `^[A-Za-z0-9\p{L} _-]{1,64}$` — note the
absence of a dot, which kills `..`, `a.b`, `/abs` and NUL tricks with one rule.
The resolved path is then checked to still be inside the queries folder,
separator included, so a sibling `queries-evil/` is rejected too.

## Electron hardening

- `contextIsolation: true`, `nodeIntegration: false`; the renderer only sees the
  channels listed in [`src/preload/index.ts`](../src/preload/index.ts).
- A Content-Security-Policy of `default-src 'self'` is set in the renderer HTML.
- External links open in the system browser; `setWindowOpenHandler` denies
  everything else.

## What is not covered

- Builds are **unsigned and not notarized**, and there is no auto-update. Verify
  what you download, or build from source.
- Locabase trusts the `supabase` CLI, Docker, and the servers the user points it
  at. It is a control surface for infrastructure the user already administers.
- An attacker who already runs code as the user can read anything Locabase can.
