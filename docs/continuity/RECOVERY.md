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

TypeScript pnpm monorepo with Electron/React desktop, an MV3 ChatGPT capture/assisted-composer extension, SQLite persistence, contracts, project identity, file safety, secret scanning, a persistent workflow/effect engine, assisted ChatGPT orchestration, a production read-only Codex runner, and a fixture-only mock adapter.

## Current phase

Phase 6 installed Native Messaging acceptance. P6-IPC-004 activated the authorized `nativeMessaging` permission; P6-IPC-005 must load the built extension into a user browser and run the redacted live smoke.

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

Expected known-good baseline: formatting, lint, strict type-check, 162 or more Vitest tests, two Chromium fixture E2E tests, and all workspace builds pass. The separate live Codex gate must pass without modifying external configuration. Windows permission activation additionally requires package, packaged smoke, and installed native-host smoke.

## Exact next task

With action-time confirmation, load `apps/chatgpt-extension/dist` into Edge from `edge://extensions`, open a user-selected authenticated ChatGPT tab with an empty composer, keep the packaged desktop app running, and execute `pnpm.cmd run smoke:installed-chatgpt:win`. The harness must report health ready, capture count/hash only, `sent: false`, and exact cleanup.

## Expected files to modify

- browser loading/installation only after action-time confirmation
- redacted live smoke evidence and continuity completion
- continuity and state updates reflecting the live result or blocker

## Tests to run

```text
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run test:e2e
pnpm.cmd run build
pnpm.cmd run test:codex-spike
pnpm.cmd run package:win
pnpm.cmd run smoke:packaged:win
pnpm.cmd run smoke:installed-native-host:win
```

## Known traps

- PowerShell blocks `pnpm.ps1`; use `pnpm.cmd` at the interactive Windows shell only.
- Electron and Playwright downloads need explicit pnpm build-script permission.
- Live Codex tests are separate from CI and must never be represented by mock or fixture results.
- Browser extension installation through UI requires action-time confirmation even though the manifest permission was authorized.
- Native Messaging protocol and service-worker fixtures are not live host registration evidence.
- Installed host relay evidence is not a live browser integration while `nativeMessaging` is absent.
- The installer source under `apps/desktop/build` is intentionally unignored; do not replace it with generated output.
- Add database changes as ordered `NNNN_name.sql` files, then run `pnpm.cmd migrations:generate`; never rewrite an accepted migration to simulate an upgrade.
- Renderer code must not read repositories directly; context collection and secret decisions belong in validated main/domain boundaries.
- Only approved memories may enter retrieval or bootstrap output; candidate content must never be auto-approved.
- Workflow send effects must be recoverable around acknowledgement boundaries and must never be repeated from projection state alone.
- A `dispatching` effect is ambiguous after interruption; require confirmation or downstream idempotency evidence and never auto-resend it.
- Composer insertion is not a send acknowledgement. Keep `sent: false` until rendered capture proves the approved user payload was submitted and streaming completed.
- Keep mock evidence labeled fixture-only; rerun the separate live Codex spike before claiming production acceptance in a new environment.

## Blockers and safe alternatives

`CODEX-SDK-001` and `EXT-PERM-001` are resolved. `BROWSER-LIVE-001` remains because Computer Use stopped on URL confidence before loading the extension; use a confirmed manual load or a later safe Computer Use attempt, then run the no-submit smoke.
