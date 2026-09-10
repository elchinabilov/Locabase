## What this changes

<!-- One or two sentences. Link the issue if there is one: Fixes #123 -->

## Why

<!-- The problem this solves. -->

## How it was verified

- [ ] `npm run lint` and `npm run format:check` pass
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Tried it in the running app (`npm run dev`) — say which screen and environment

<!-- Screenshots are welcome for UI changes. -->

## Checklist

- [ ] Comments, identifiers and test names are in English
- [ ] New user-facing strings go through `t()` and exist in both `az.ts` and `en.ts`
- [ ] No secret value is passed as a CLI argument or written unredacted to a log
- [ ] A new IPC channel has a schema in `src/shared/ipc-schemas.ts`
- [ ] Anything reaching `fs` or a shell from the renderer is validated first
- [ ] Documentation updated if behaviour changed
