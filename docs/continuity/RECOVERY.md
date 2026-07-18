# Recovery Guide

## Repository identity

- Repository: `tai0huynh-ux/tool-codex-gpt`
- Remote: `origin` -> `https://github.com/tai0huynh-ux/tool-codex-gpt.git`
- Publication branch: `main`

## Required environment

- Node.js `>=20.19`; last verified locally with `24.14.1`.
- pnpm version from root `packageManager`; use `pnpm.cmd` when invoking commands from Windows PowerShell.
- Chromium installed through Playwright for fixture E2E.

## Startup commands

```text
git rev-parse --show-toplevel
git status --short --branch
git fetch --prune origin
git rev-list --left-right --count origin/main...main
pnpm.cmd status
```

Stop publication if local is behind or diverged. Preserve unknown working-tree changes.

## Instruction files

Read in order: `AGENTS.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, this file, `STATUS.md`, `ROADMAP.md`, `BLOCKERS.md`, `TEST_MATRIX.md`, and `.agent-state/state.json`.

Use `.agents/skills/context-bridge-checkpoint/SKILL.md` to publish checkpoints and `.agents/skills/context-bridge-debugging/SKILL.md` for defects.

## Current architecture

TypeScript pnpm monorepo with Electron/React desktop, an MV3 ChatGPT capture extension, SQLite persistence, contracts, project identity, file safety, secret scanning, and a mock-only Codex adapter.

## Current phase

Phase 1 - CI and foundation stabilization.

## Last known-good commit

Resolve with `git log -1 -- docs/continuity/RECOVERY.md`; verify that commit with the commands below.

## Last pushed commit

`origin/main`; do not trust a cached value without fetching.

## How to verify the current state

```text
pnpm.cmd run verify
pnpm.cmd status
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Expected known-good baseline: formatting, lint, strict type-check, 16 or more Vitest tests, one Chromium fixture E2E, and all workspace builds pass.

## Exact next task

Implement `P1-DATA-001`: make `packages/database/migrations/0001_initial.sql` the canonical initial migration source, generate the runtime TypeScript representation deterministically, and add a check that fails when generated runtime SQL drifts from the distributable SQL. Preserve the existing schema and migration version.

## Expected files to modify

- `packages/database/migrations/0001_initial.sql`
- `packages/database/src/migration.ts`
- migration generation/check tooling and tests
- root/package scripts if needed
- continuity status, roadmap, matrix, worklog, recovery, and state

## Tests to run

```text
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run test:e2e
pnpm.cmd run build
```

## Known traps

- PowerShell blocks `pnpm.ps1`; use `pnpm.cmd` at the interactive Windows shell only.
- Electron and Playwright downloads need explicit pnpm build-script permission.
- Live Codex tests are separate from CI and must never be represented by mock or fixture results.
- SQLite migration SQL currently exists in both a `.sql` file and a TypeScript string.

## Blockers and safe alternatives

`CODEX-SDK-001` blocks the live SDK path because an external model catalog is incompatible. Do not modify external Codex configuration. Continue CI, contract, extension, persistence, UI, and mock workflow work independently.
