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

Live Vertical Slice In Progress. The accepted MVP, internal-beta fixture UAT, Windows package, packaged smoke, and non-destructive installed relay verification pass; P18-PILOT-001 is the active checkpoint after published P18-CODEX-001.

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

Expected known-good baseline: formatting, lint, strict type-check, 197 or more Vitest tests after current-conversation selection, two Chromium fixture E2E tests, the 46-test internal-beta UAT selection, and all workspace builds pass. Windows release acceptance additionally requires package, packaged smoke, native relay, unsigned status, and generated staging checksums.

## Exact next task

P18-CODEX-001 is published at `c3ec3a7`; pilot implementation, fixture, and packaged restart checkpoints are published through `849812b`. The installed ChatGPT no-submit smoke now confirms a safe existing conversation with an empty composer, and a reviewed live payload is persisted at hash `75cae5042832…428bae39`. The exact next action is action-time user confirmation before the representational ChatGPT submit. Do not click submit or infer approval from the prepared preview.

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
pnpm.cmd run test:pilot-packaged-restart
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
- ChatGPT submission is a distinct approved effect. Reserve its effect ID before asynchronous checks; retain the reservation on ambiguous errors and release it only for deterministic pre-click rejection.
- `workspace_write_no_network` is not a global adapter mode: bind it into the approval destination, require the registry validator, canonical non-symlink root, exact project/fingerprint, and pass no additional writable roots.
- Packaged native executables resolved through dependencies may point inside `app.asar`; production execution must translate them to the matching `app.asar.unpacked` path and packaging tests must prove the pinned platform package is present.
- Adapter run handles are process-local. Persisted terminal pilot views must restore from SQLite after restart instead of querying a newly constructed adapter for an old run ID.
- Current-conversation selection must resolve through the validated main-process Native Messaging boundary. Never infer a conversation ID from renderer text, browser profile data, history, or an unverified URL.
- Keep mock evidence labeled fixture-only; rerun the separate live Codex spike before claiming production acceptance in a new environment.

## Blockers and safe alternatives

`CODEX-SDK-001`, `EXT-PERM-001`, and `BROWSER-LIVE-001` are resolved. There is no active P0/P1 blocker in the accepted internal-beta scope. The current Windows build is unsigned, store publication is deferred, and destructive clean-install/live-browser reruns remain intentionally excluded while the user installation is active.
