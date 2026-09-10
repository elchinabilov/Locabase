# Security model

Locabase handles access tokens, database passwords, SSH access and `.env` files.
These are the guarantees the code is written to keep. If you find a way around
one of them, please report it privately — see [SECURITY.md](../SECURITY.md).

## Secrets never become command-line arguments

Anything on a process's argument list is visible to every user on the machine
through `ps`. So secret values travel another way:

| Path                | How the value travels                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Managed secrets     | `supabase secrets set --env-file <tmp>` — a temporary file with 0600 permissions, deleted afterwards |
| Self-hosted secrets | piped to the remote script over **stdin**                                                            |
| Access tokens       | the `SUPABASE_ACCESS_TOKEN` environment variable                                                     |
| SSH                 | the user's own ssh-agent / key files                                                                 |

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
2. **Identifiers always go through `quoteIdent()`** _and_ must first appear in
   the column list returned by introspection (`requireColumn`).

The remote transports cannot bind parameters, so values in queries Locabase
builds itself are inlined with `quoteLiteral()` (`standard_conforming_strings`
assumed). SQL the user typed never passes through that function — it is sent as
written, to a connection that is read-only unless the user turned that off.

## The IPC boundary

`IpcContract` in [`src/shared/ipc.ts`](../src/shared/ipc.ts) is a compile-time
type and nothing survives of it at runtime, so it is not a boundary on its own.
Every channel therefore also has a Zod schema in
[`src/shared/ipc-schemas.ts`](../src/shared/ipc-schemas.ts), and `registerIpc`
parses the payload before it dispatches. The map is typed
`satisfies Record<IpcChannel, ZodTypeAny>`, so adding a channel to the contract
without adding a schema fails to compile rather than leaving a hole.

This matters because these values go on to reach `spawn` argv arrays,
filesystem paths and SQL identifier quoting. The schemas are where
`sshHost` is refused if it could be read as an `ssh` option, where `envFile`
is refused if it contains a NUL byte, and where a `projects:update` patch is
narrowed to the three fields the renderer is allowed to change.

## Path traversal

A relative path that came from outside the process goes through
`containedPath()` in [`src/main/core/safe-path.ts`](../src/main/core/safe-path.ts)
before it reaches `fs`. `join()` resolves `..` happily, so it is not a boundary;
`containedPath` resolves and then proves the result is still inside the folder,
separator included, so a sibling `queries-evil/` is rejected too. This covers
both the saved-query names and the project's `envFile`, which the renderer can
set.

Saved query names are additionally validated against
`^[A-Za-z0-9\p{L} _-]{1,64}$` — note the absence of a dot, which kills `..`,
`a.b`, `/abs` and NUL tricks with one rule.

## Remote shell safety

Scripts sent over SSH are assembled from `sq()`-quoted fragments. Anything
interpolated into one — the container name, the backup directory, the project
id — is quoted; a value that cannot be quoted because it is a bare shell token
(`find -mtime +N`) is coerced to a number first. `ssh` and `rsync` are invoked
with `--` before the host, and the host itself is validated when the
environment is saved.

## Electron hardening

- `contextIsolation: true`, `nodeIntegration: false`. The renderer's bridge
  checks the channel against `IPC_CHANNELS` at runtime — the type alone would
  not stop an unknown channel being invoked.
- The OS sandbox is **off**, because the preload is built as ESM and a
  sandboxed preload must be CommonJS. Turning it on means moving the preload
  build to CJS first.
- A Content-Security-Policy of `default-src 'self'` is set in the renderer HTML.
- External links open in the system browser: `setWindowOpenHandler` denies
  `window.open`, and a `will-navigate` handler refuses top-level navigation away
  from the app, which `setWindowOpenHandler` does not cover.
- Permission requests (camera, microphone, location) are denied outright.
- Error messages crossing back to the renderer are redacted, not just the ones
  written to the log panel — `ssh` and the Management API both throw raw remote
  output.

## What is not covered

- Builds are **unsigned and not notarized**, and there is no auto-update. Verify
  what you download, or build from source.
- Locabase trusts the `supabase` CLI, Docker, and the servers the user points it
  at. It is a control surface for infrastructure the user already administers.
- An attacker who already runs code as the user can read anything Locabase can.
