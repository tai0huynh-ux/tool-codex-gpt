# Project Status

## Current phase

Phase 1 - CI and foundation stabilization.

## Current objective

Establish credential-free GitHub Actions verification, then remove duplicated migration sources.

## Last completed checkpoint

P0-CONT-001 - Persistent recovery workflow. Resolve the checkpoint commit with `git log -1 -- docs/continuity/STATUS.md`.

## Current verified capabilities

- Strict TypeScript monorepo builds on Windows.
- SQLite schema and project registry CRUD pass automated tests.
- Repository fingerprinting distinguishes same-named repositories.
- File traversal, symlink escape, exclusions, and secret fixtures are blocked.
- Handoff validation passes Zod and JSON Schema checks.
- ChatGPT capture fixture passes in jsdom and Chromium.
- Electron uses context isolation, sandboxing, and no renderer Node integration.

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Mock Codex adapter lifecycle reliability and virtualized chat capture are not yet proven.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Add GitHub Actions verification with frozen lockfile and Chromium fixture E2E.
2. Select one canonical migration source and add schema/migration parity coverage.
3. Add a lossless typed Codex run lifecycle contract.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: 21 Vitest tests, 1 Chromium Playwright test, lint, strict type-check, and all builds. Package scripts and the Playwright server command are verified free of Windows-only pnpm shims.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 14:45 +07:00.
