# Contributing to Locabase

Thanks for taking the time to contribute. Locabase is a small codebase with a
deliberate shape, so this document is short and specific.

## Getting set up

Locabase drives the `supabase` CLI and Docker, so both have to work on your
machine before the app is useful:

| Requirement                                                          | Why                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| Node.js 22 (`.nvmrc`)                                                | build and dev server                                |
| [`supabase` CLI](https://supabase.com/docs/guides/local-development) | every stack, migration, function and deploy command |
| Docker Desktop or OrbStack                                           | the local Supabase stack                            |
| `ssh` + `rsync`                                                      | only for self-hosted remote environments            |

The app checks all of these itself under **Settings → Environment check**.

```bash
npm install
npm run dev
```

## Before you open a pull request

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
```

All four must pass; CI runs the same four on Linux, macOS and Windows.

`npm run lint:fix` and `npm run format` fix most of what the first two report.
A `pre-commit` hook runs both on staged files, so in practice you rarely need
to run them by hand. Formatting is Prettier's — settings live in `.prettierrc`
and `.editorconfig`; don't hand-format around them.

`npm run test:coverage` enforces a floor. It is deliberately set at whatever
the project covers today, so it can only go up: if you add code, add the test
that keeps the number where it is.

## Ground rules

1. **English only in source.** Comments, identifiers, commit messages, test
   names and documentation are English. The only Azerbaijani text that belongs
   in the repo is the UI dictionary at
   `src/renderer/src/i18n/locales/az.ts` and the field labels in
   `src/shared/config-schema.ts` — see [docs/i18n.md](docs/i18n.md).
2. **User-facing strings go through `t()`.** If you add UI text, add the key to
   both `az.ts` and `en.ts`; `tests/i18n.test.ts` fails when the two dictionaries
   drift apart.
3. **Conventional Commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
   `chore:`.
4. **Secrets never become CLI arguments.** See [docs/security.md](docs/security.md)
   before touching anything under `src/main/core/remote/` or `secrets.ts`.
5. **Destructive remote actions stay confirmed.** `db reset` and remote deploys
   require the user to type the project name; don't weaken that.

## Where things live

```
src/shared/       types, the IPC contract, config field metadata, provider list
src/main/core/    everything that touches the filesystem, Docker, ssh or Postgres
src/renderer/src/ React 19 + Tailwind 4 UI, its own small primitives
tests/            Vitest, run against real config.toml fixtures
```

[docs/architecture.md](docs/architecture.md) explains how these fit together.

## Adding an IPC call

1. Add the channel and its argument/result types to `src/shared/ipc.ts`.
2. Implement the handler in `src/main/ipc/router.ts`, delegating to a module in
   `src/main/core/`.
3. Call it from the renderer with `call('channel', args)` or
   `useQuery('channel', args)` from `src/renderer/src/lib/ipc.ts`.

The contract is typed end to end — `npm run typecheck` catches a mismatch.

## Screenshots

README screenshots are generated, not hand-taken:

```bash
npm run screenshots
```

See [docs/screenshots.md](docs/screenshots.md) for what the script needs.

## Building installers

```bash
npm run dist:mac   # arm64 .dmg
npm run dist:win   # x64 NSIS installer
```

Builds are **unsigned and not notarized**. Releases are cut manually for now.

## Reporting bugs

Use the issue templates. Security problems go to
[SECURITY.md](SECURITY.md) instead — please don't open a public issue for those.
