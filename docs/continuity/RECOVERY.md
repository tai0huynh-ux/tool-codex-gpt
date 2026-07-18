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

Internal Beta Ready. The accepted MVP, internal-beta fixture UAT, Windows package, packaged smoke, and non-destructive installed relay verification pass.

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

Expected known-good baseline: formatting, lint, strict type-check, 165 or more Vitest tests, two Chromium fixture E2E tests, the 43-test internal-beta UAT selection, and all workspace builds pass. Windows release acceptance additionally requires package, packaged smoke, native relay, unsigned status, and generated staging checksums.

## Exact next task

No implementation task is active. Distribute only to a small internal group, collect feedback, and make code-signing, store publication, or approval-mode expansion separate explicit decisions. The completed desktop UI acceptance evidence is under `artifacts/ui-acceptance/2026-07-18T18-59-16-216Z/`.

## Expected files to modify

- feedback-driven fixes with reproducible evidence
- team documentation corrections
- separately authorized signing or distribution work

## Tests to run

```text
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run test:e2e
pnpm.cmd run test:internal-beta-uat
pnpm.cmd run build
pnpm.cmd run test:codex-spike
pnpm.cmd run package:win
pnpm.cmd run smoke:packaged:win
pnpm.cmd run smoke:installed-native-host:win
pnpm.cmd run prepare:internal-beta -- --verify=pass --uat=pass --package-smoke=pass --native-relay=pass
```

## Known traps

- PowerShell blocks `pnpm.ps1`; use `pnpm.cmd` at the interactive Windows shell only.
- Electron and Playwright downloads need explicit pnpm build-script permission.
- electron-builder rebuilds native modules for Electron; `run-electron-builder.mjs` must restore the Node-compatible SQLite prebuild before later Node/Vitest commands.
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

`CODEX-SDK-001`, `EXT-PERM-001`, and `BROWSER-LIVE-001` are resolved. There is no active P0/P1 blocker in the accepted internal-beta scope. The current Windows build is unsigned, store publication is deferred, and destructive clean-install/live-browser reruns remain intentionally excluded while the user installation is active.
