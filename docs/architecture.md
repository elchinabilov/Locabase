# Architecture

Locabase is an Electron app with three processes' worth of code and no server
component. Everything it knows comes from the filesystem, the `supabase` CLI,
Docker, or a remote environment the user configured.

```
src/
  shared/
    types/           the shapes that cross the bridge, split by domain
                     (project, stack, sql, backup, …) behind one barrel
    ipc.ts           the channel contract — types
    ipc-schemas.ts   the channel contract — Zod, checked at runtime
    ...              config field metadata, the auth provider list
  main/core/
    toml/            the comment-preserving config.toml patcher (scan + patch)
    remote/          RemoteAdapter: managed.ts (CLI + Management API),
                     selfhosted.ts (ssh + docker exec + rsync)
    sql/             query building, introspection, pooling, transports
    ...              projects, stack, docker, ports, config, envfile,
                     migrations, functions, sync, secrets, log, cli
  preload/           the context bridge — the only surface the renderer sees
  renderer/src/
    lib/             the bridge client (`ipc.ts`), and the hooks every screen
                     shares: useAction, useCopy, useStackStatus
    components/      the UI primitives — no component library
    routes/          one file per screen
```

## The main ↔ renderer contract

Every channel and its input/output types live in one file,
[`src/shared/ipc.ts`](../src/shared/ipc.ts). The handler in
[`src/main/ipc/router.ts`](../src/main/ipc/router.ts) and the renderer call in
[`src/renderer/src/lib/ipc.ts`](../src/renderer/src/lib/ipc.ts) both read that
same type, so a mismatch is a compile error rather than a runtime surprise.

Adding a call is four steps:

1. add the channel to `IpcContract` in `src/shared/ipc.ts`;
2. add its request schema to `IPC_SCHEMAS` in `src/shared/ipc-schemas.ts` —
   the map is typed against `IpcChannel`, so skipping this does not compile;
3. implement it in `router.ts`, delegating to a module under `src/main/core/`;
4. call it from the renderer with `call('channel', args)` or
   `useQuery('channel', args)`.

Step 2 is the one that is easy to think of as ceremony and is not: the types in
step 1 are erased at build time, so the schema is the only thing that actually
establishes what arrived. See [security.md](security.md).

Two conventions matter:

- **Errors cross as data, not exceptions.** A thrown error becomes
  `{ ok: false, error }` on the renderer side. But SQL execution deliberately
  does _not_ throw: a failing query returns `SqlRun.error`, because the router
  can only carry a `string` and `position`/`hint`/`detail` would be lost.
- **Every cell that crosses IPC is text.** Row values are `string | null`
  (`TEXT_TYPES` in `src/main/core/sql/build.ts`) — structured clone would mangle
  a `Buffer` and drop a `bigint`, and the two transports disagree about `int8`.
- **The main process has no locale.** Anything it produces is English. Where a
  string is UI copy rather than a log line it crosses as a code the renderer
  translates — `DbRowsPage.editableReason` is the example to copy.

## State in the renderer

There is no state library. A handful of hooks in `renderer/src/lib/` carry the
patterns that would otherwise be rewritten per screen:

- **`useQuery(channel, req, options)`** calls on mount and whenever the request
  changes. The request is its own dependency — it is serialized to a key — so
  there is no dependency array to keep in sync with it. A response that arrives
  after the request changed is discarded, which is what makes switching project
  mid-flight safe.
- **`useAction()`** wraps an action in its busy flag and error message, catches
  rather than throws, and is unmount-safe. Every button that calls main goes
  through it; a bare `void call(...)` is a bug, because a failure would change
  nothing on screen.
- **`useStackStatus(projectId)`** shares one `stack:status` poll per project
  across every screen watching it, refcounted.
- **`useUiState(key, schema, initial)`** is `useState` that survives leaving the
  screen and closing the app — see below.
- **`useOnChange(value, effect)`** is `useEffect` minus the mount run. Once a
  screen starts _restored_, an effect that resets state when a value changes has
  to tell "changed" from "was set", or it undoes the restore on the first render.

Failures that get past all of that hit an `ErrorBoundary` — one at the root and
one per route, so a screen that throws leaves the sidebar usable and navigating
away clears it.

### Where the user left off

A route unmounts the moment you leave it, so every screen's _place_ — the
environment picked, the schema, the selected table, the filters, the query being
written — lives in [`lib/ui-state.ts`](../src/renderer/src/lib/ui-state.ts)
instead of in the component that renders it.

It is one `localStorage` entry, for the same reason the theme and the pane sizes
are: the read has to be **synchronous**, or a screen mounts on a default and
jumps a frame later. That entry is read and parsed **once**, at module load, and
then served from memory; a write updates the memory copy and arms a 250 ms
trailing flush, so a keystroke in a filter box costs a property assignment and
the whole bag is serialized at most four times a second. The pending flush is
forced on `pagehide`.

Every value is validated against a Zod schema on the way back in. This is a file
a user can edit and a format that changes between releases, so a stale schema
name, a filter on a dropped column or a hand-typed `"pageSize": "lots"` has to
fall back to the default rather than reach React. Ids are re-derived on top of
that: a remembered environment or storage connection that no longer exists
resolves to local, the way `MigrationsRoute` already did it.

Growth is bounded in three places. Values that belong to one project are keyed
`p.<projectId>.<name>` and dropped when the project leaves the registry. State
that belongs to a table — its sort, filters and page size — is kept per table
with only the twenty most recent remembered. A single text value over 200 KB is
not remembered at all, so one runaway paste in the SQL editor cannot take the
rest of the bag down with it.

Four things are deliberately **not** remembered, each with the reason at its call
site: SQL's read-only switch (it resets on every open by design), unsaved drafts
in Configuration and Secrets (a pending write the user never saved, against a
file that may have moved under it), "reveal secrets", and the page number of a
paged list (page 4 of yesterday's rows is not page 4 today).

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
