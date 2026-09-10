# Architecture

Locabase is an Electron app with three processes' worth of code and no server
component. Everything it knows comes from the filesystem, the `supabase` CLI,
Docker, or a remote environment the user configured.

```
src/
  shared/            types shared by main and renderer, the IPC contract,
                     config field metadata, the auth provider list
  main/core/
    toml/            the comment-preserving config.toml patcher (scan + patch)
    remote/          RemoteAdapter: managed.ts (CLI + Management API),
                     selfhosted.ts (ssh + docker exec + rsync)
    sql/             query building, introspection, pooling, transports
    ...              projects, stack, docker, ports, config, envfile,
                     migrations, functions, sync, secrets, log, cli
  preload/           the context bridge — the only surface the renderer sees
  renderer/src/      React 19 + Tailwind 4, with its own small UI primitives
```

## The main ↔ renderer contract

Every channel and its input/output types live in one file,
[`src/shared/ipc.ts`](../src/shared/ipc.ts). The handler in
[`src/main/ipc/router.ts`](../src/main/ipc/router.ts) and the renderer call in
[`src/renderer/src/lib/ipc.ts`](../src/renderer/src/lib/ipc.ts) both read that
same type, so a mismatch is a compile error rather than a runtime surprise.

Adding a call is three steps:

1. add the channel to `IpcContract` in `src/shared/ipc.ts`;
2. implement it in `router.ts`, delegating to a module under `src/main/core/`;
3. call it from the renderer with `call('channel', args)` or
   `useQuery('channel', args)`.

Two conventions matter:

- **Errors cross as data, not exceptions.** A thrown error becomes
  `{ ok: false, error }` on the renderer side. But SQL execution deliberately
  does _not_ throw: a failing query returns `SqlRun.error`, because the router
  can only carry a `string` and `position`/`hint`/`detail` would be lost.
- **Every cell that crosses IPC is text.** Row values are `string | null`
  (`TEXT_TYPES` in `src/main/core/sql/build.ts`) — structured clone would mangle
  a `Buffer` and drop a `bigint`, and the two transports disagree about `int8`.

## The comment-preserving TOML patcher

Real `config.toml` files are dense with comments, and no JavaScript TOML library
that re-serializes preserves them. So Locabase never re-serializes.

[`toml/scan.ts`](../src/main/core/toml/scan.ts) walks the file once and records,
for every key, the byte offsets where its value starts and ends.
[`toml/patch.ts`](../src/main/core/toml/patch.ts) then replaces **only that
range**. Comments, ordering, indentation and blank lines survive byte for byte.
A new key is appended to the end of its table; a new table to the end of the file.

Before anything is written, the result is re-parsed with `smol-toml` and each
patch is checked against the value it was supposed to produce. On a mismatch,
nothing is written. Every write leaves a `config.toml.bak` behind.

The tests run against three real `config.toml` files (1,085 lines): a no-op pass
must be byte-identical, and changing `auth.jwt_expiry` must differ by exactly one
line.

## RemoteAdapter

`Sync`, `Deploy`, `SQL` and `Tables` don't know which kind of remote they are
talking to. [`remote/index.ts`](../src/main/core/remote/index.ts) defines the
interface; two implementations satisfy it.

|               | Managed (supabase.com)                         | Self-hosted (SSH)                                  |
| ------------- | ---------------------------------------------- | -------------------------------------------------- |
| Migrations    | `supabase db push` (all pending, no selection) | one transaction per migration, ledger row included |
| Functions     | `supabase functions deploy` / `download`       | `rsync` + restart the edge runtime container       |
| Secrets       | `secrets set --env-file` (0600, temporary)     | merged into the remote `.env` over stdin           |
| Auth config   | Management API                                 | the server's own `.env`                            |
| SQL           | Management API `database/query`                | `docker exec psql -q --csv` over ssh               |
| Containers    | not controllable (the platform owns them)      | `docker stop` / `docker start`                     |
| Function diff | version number only (`unknown`)                | per-file md5 in **one** ssh call                   |

The self-hosted adapter shells out to the system `ssh` binary rather than using
the ssh2 library, so `~/.ssh/config` host aliases, ssh-agent and `known_hosts`
behave exactly as they do in the user's terminal.

## The SQL layer

Query text is identical across environments; only the transport differs.

| Environment | Transport                         | Consequences                                                                  |
| ----------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Local       | the `pg` driver, `$n` parameters  | full fidelity; cancellation works                                             |
| Managed     | Management API `database/query`   | no column types, same-named columns collapse, `read_only` enforced by the API |
| Self-hosted | ssh + `docker exec psql -q --csv` | one result block, no error position                                           |

Because the remote transports cannot bind `$n`, values in queries **we build**
are pasted with `quoteLiteral()` (see
[`sql/ident.ts`](../src/main/core/sql/ident.ts)). User-written SQL never goes
through that path. Identifiers are always quoted _and_ checked against the
introspected column list first (`requireColumn`).

Read-only is enforced server-side — `begin read only` locally and on self-hosted,
the API's `read_only` flag on managed — never by pattern-matching the SQL. A
regex is not a security boundary:
`with x as (delete … returning *) select * from x` passes any of them.

Row writes on a remote environment skip the `json_agg` wrapper, because Postgres
only allows a data-modifying CTE at the top level.

## The renderer

React 19 and Tailwind 4, with the app's own small primitives in
[`components/ui.tsx`](../src/renderer/src/components/ui.tsx) — no component
library, no data-fetching library. `useQuery` in `lib/ipc.ts` is a dozen lines;
every screen works with a handful of calls.

Two things are deliberately absent: a virtualization library (the result grid
does simple fixed-height windowing above 300 rows) and a CodeMirror wrapper (the
editor is set up once and reconfigured through refs and a `Compartment`, so the
cursor never jumps).

Interface text goes through `t()` — see [i18n.md](i18n.md).
