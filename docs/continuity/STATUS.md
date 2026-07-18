# Project Status

## Current phase

Phase 5 - Composer and response parsing.

## Current objective

Harden controlled composer insertion and bounded structured response parsing without automatic submission.

## Last completed checkpoint

P4-EXT-001 - Lossless virtualized conversation capture with stable identity, ordering, streaming updates, abort handling, and selector failure evidence. Resolve with `git log -1 --grep "fix(extension): preserve virtualized conversation capture"`.

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
- Long conversation capture accumulates virtualized windows, preserves duplicate messages with stable IDs, updates streaming text, and supports abort.

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Controlled composer state updates and bounded paired-marker response parsing are not yet proven.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Reproduce controlled composer insertion failure and add DOM fixtures.
2. Insert text through the native editing path without submitting automatically.
3. Parse only bounded paired structured-response markers with schema validation.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: migration parity, 34 Vitest tests, virtualized Chromium fixture E2E, formatting, lint, strict type-check, and all builds. GitHub Actions run `29637042416` passed for lifecycle checkpoint `2198c25`.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 15:16 +07:00.
