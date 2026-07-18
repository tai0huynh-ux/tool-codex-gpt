# Project Status

## Current phase

Phase 4 - Conversation capture.

## Current objective

Preserve complete rendered conversations across virtualized scrolling, streaming updates, deduplication, and cancellation.

## Last completed checkpoint

P2-CODEX-001 - Lossless typed mock run lifecycle with replay, sequencing, failure/cancellation coverage, and terminal guards. Resolve the checkpoint commit with `git log -1 --grep "fix(codex): preserve ordered run lifecycle"`.

## Current verified capabilities

- Strict TypeScript monorepo builds on Windows.
- SQLite schema and project registry CRUD pass automated tests.
- Repository fingerprinting distinguishes same-named repositories.
- File traversal, symlink escape, exclusions, and secret fixtures are blocked.
- Handoff validation passes Zod and JSON Schema checks.
- ChatGPT capture fixture passes in jsdom and Chromium.
- Electron uses context isolation, sandboxing, and no renderer Node integration.
- GitHub Actions runs frozen installation, Chromium fixture E2E, and the full verification gate on Linux with Node.js 24.
- Database runtime SQL is generated from the distributable migration and direct package type-check/build commands reject stale output.
- Mock Codex runs expose replayable ordered start, progress, completion, failure, and cancellation events without allowing terminal-state overwrite.

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Virtualized chat capture is not yet proven.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Reproduce message loss in a virtualized conversation fixture.
2. Accumulate, deduplicate, and order messages across scroll passes and streaming updates.
3. Cover abort behavior and selector-health failures without broadening extension permissions.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: migration parity, 31 Vitest tests, 1 Chromium Playwright test, formatting, lint, strict type-check, and all builds. GitHub Actions run `29636851097` passed for database checkpoint `0c9776e`.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 15:08 +07:00.
