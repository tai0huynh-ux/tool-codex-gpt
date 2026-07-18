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

TypeScript pnpm monorepo with Electron/React desktop, an MV3 ChatGPT capture/assisted-composer extension, SQLite persistence, contracts, project identity, file safety, secret scanning, a persistent workflow/effect engine, assisted ChatGPT orchestration, and a mock-only Codex adapter.

## Current phase

Phase 12 - ChatGPT response routing. Phase 3 live Codex integration remains independently blocked.

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

Expected known-good baseline: formatting, lint, strict type-check, 124 or more Vitest tests, two Chromium fixture E2E tests, and all workspace builds pass.

## Exact next task

Implement `P12-HANDOFF-001`: consume the already strict structured ChatGPT response only after handoff/correlation/project/duplicate validation, preview `codexPrompt`, select existing/new/worktree Codex destination, and route through P10 approval/effect/iteration guards. Keep production SDK execution explicitly blocked behind `CODEX-SDK-001` and use the mock adapter only for domain tests.

## Expected files to modify

- response-routing contracts/domain package and tests
- Codex destination selection and project/thread mapping validation
- P10 approval/effect integration plus mock lifecycle acknowledgement tests
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
- Native Messaging protocol fixtures are not live registration evidence; the manifest permission and host installer remain deferred to the packaging/security gate.
- Add database changes as ordered `NNNN_name.sql` files, then run `pnpm.cmd migrations:generate`; never rewrite an accepted migration to simulate an upgrade.
- Renderer code must not read repositories directly; context collection and secret decisions belong in validated main/domain boundaries.
- Only approved memories may enter retrieval or bootstrap output; candidate content must never be auto-approved.
- Workflow send effects must be recoverable around acknowledgement boundaries and must never be repeated from projection state alone.
- A `dispatching` effect is ambiguous after interruption; require confirmation or downstream idempotency evidence and never auto-resend it.
- Composer insertion is not a send acknowledgement. Keep `sent: false` until rendered capture proves the approved user payload was submitted and streaming completed.
- Do not let P12 mock adapter success satisfy the live Codex blocker or alter external Codex configuration.

## Blockers and safe alternatives

`CODEX-SDK-001` blocks the live SDK path because an external model catalog is incompatible. Do not modify external Codex configuration. Continue CI, contract, extension, persistence, UI, and mock workflow work independently.
