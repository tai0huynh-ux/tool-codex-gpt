# Project Status

## Current phase

Phase 1 - CI and foundation stabilization.

## Current objective

Remove duplicated migration sources by making one SQL file canonical and enforcing generated runtime parity.

## Last completed checkpoint

P1-CI-001 - Credential-free cross-platform repository verification. Implementation commits: `3787b41` and `b091234`.

## Current verified capabilities

- Strict TypeScript monorepo builds on Windows.
- SQLite schema and project registry CRUD pass automated tests.
- Repository fingerprinting distinguishes same-named repositories.
- File traversal, symlink escape, exclusions, and secret fixtures are blocked.
- Handoff validation passes Zod and JSON Schema checks.
- ChatGPT capture fixture passes in jsdom and Chromium.
- Electron uses context isolation, sandboxing, and no renderer Node integration.
- GitHub Actions runs frozen installation, Chromium fixture E2E, and the full verification gate on Linux with Node.js 24.

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Mock Codex adapter lifecycle reliability and virtualized chat capture are not yet proven.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Make `packages/database/migrations/0001_initial.sql` the canonical initial migration source.
2. Generate and verify the runtime TypeScript migration without silent drift.
3. Add a lossless typed Codex run lifecycle contract.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: 24 Vitest tests, 1 Chromium Playwright test, formatting, lint, strict type-check, and all builds. GitHub Actions run `29636579711` passed in 1m18s with no annotations.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 14:57 +07:00.
