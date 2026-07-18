# Project Status

## Current phase

Phase 2 - Codex adapter lifecycle.

## Current objective

Add a lossless typed Codex run lifecycle with ordered events and guarded terminal states.

## Last completed checkpoint

P1-DATA-001 - Canonical SQL migration source with deterministic runtime generation and drift enforcement. Resolve the checkpoint commit with `git log -1 --grep "fix(database): prevent migration source drift"`.

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

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Mock Codex adapter lifecycle reliability and virtualized chat capture are not yet proven.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Reproduce lifecycle event loss and terminal-state races in the mock Codex adapter.
2. Add a typed, ordered run lifecycle contract with regression coverage.
3. Preserve cancellation, failure, replay, and terminal guards without claiming live SDK acceptance.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: migration parity, 26 Vitest tests, 1 Chromium Playwright test, formatting, lint, strict type-check, and all builds. GitHub Actions run `29636673930` also passed for the preceding continuity checkpoint.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 15:02 +07:00.
