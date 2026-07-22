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

Live Vertical Slice In Progress. The accepted MVP, internal-beta fixture UAT, Windows package, packaged smoke, rendered conversation catalog, multi-pilot workspace, and safe changed-file ZIP pass; P18-PILOT-001 remains active because authenticated live sending is separately approval-gated.

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

Expected known-good baseline: formatting, lint, strict type-check, 228 or more Vitest tests, two Chromium fixture E2E tests, the 46-test internal-beta UAT selection, and all workspace builds pass. Windows release acceptance additionally requires packaging, the ZIP-runtime packaged preflight, packaged app/native-host smoke, and fixture-only packaged restart recovery. The installed-host smoke must not overwrite an existing user registration.

## Exact next task

Use the persisted pilot account-transfer action only after action-time user confirmation. The current Edge extension health, rendered-only discovery, and no-submit smoke pass; local archive creation and new-chat opening are automatic, but the inline bootstrap send remains separately confirmation-gated. ZIPs larger than the safe inline budget remain explicit manual attachments; never infer upload or send acknowledgement from a prepared preview. The existing live payload `75cae5042832…428bae39` remains unsent.

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
pnpm.cmd run smoke:packaged:win
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
- ChatGPT page recovery is bounded: inspect the exact persisted destination, reload it once, then open only `https://chatgpt.com/` or the encoded exact conversation URL; never auto-submit.
- Existing ChatGPT destinations may include a validated canonical pathname. Preserve `/g/.../c/...`; never collapse an observed project route to `/c/...`, and never use screen/window state as routing identity.
- A `dispatching` ChatGPT effect is ambiguous after restart; restore it as confirmation-required and do not consume a new approval or resend it.
- Composer insertion is not a send acknowledgement. Keep `sent: false` until rendered capture proves the approved user payload was submitted and streaming completed.
- ChatGPT submission is a distinct approved effect. Reserve its effect ID before asynchronous checks; retain the reservation on ambiguous errors and release it only for deterministic pre-click rejection.
- `workspace_write_no_network` is not a global adapter mode: bind it into the approval destination, require the registry validator, canonical non-symlink root, exact project/fingerprint, and pass no additional writable roots.
- Packaged native executables resolved through dependencies may point inside `app.asar`; production execution must translate them to the matching `app.asar.unpacked` path and packaging tests must prove the pinned platform package is present.
- Adapter run handles are process-local. Persisted terminal pilot views must restore from SQLite after restart instead of querying a newly constructed adapter for an old run ID.
- Current-conversation selection must resolve through the validated main-process Native Messaging boundary. Never infer a conversation ID from renderer text, browser profile data, history, or an unverified URL.
- Background ChatGPT archive sync must call page recovery with `allowOpenExternal: false`; a failed timer refresh may reload/inspect but must never open a browser tab. Startup recovery is separately capped to one unique persisted destination.
- Codex project discovery reads only the bounded local metadata catalog and must revalidate every root through `validateGitRepositoryInput` before projecting a project/thread mapping into SQLite.
- Codex display titles come from bounded `thread_name` metadata; never use a title as a thread routing key.
- ChatGPT discovery must query and merge all eligible open `chatgpt.com` tabs with per-tab timeouts; an active new-chat tab may legitimately have an empty sidebar while another tab contains the rendered catalog, and one stale tab must not block the rest.
- Keep mock evidence labeled fixture-only; rerun the separate live Codex spike before claiming production acceptance in a new environment.
- Native health now requires the shared `CHATGPT_CONTENT_VERSION`; an old service worker is reported as `EXTENSION_VERSION_MISMATCH`/degraded and must be reloaded before discovery or account transfer.
- Account transfer uses only locally stored rendered history, scans it for secret-like content before transfer, persists the effect, and never silently uploads a ZIP. A new-chat effect may transition to an existing SPA conversation only after rendered capture proves the matching approved user payload.
- Manual ChatGPT catalog refresh is the only discovery path allowed to open the allowlisted home page; it performs one bounded open and one retry. Background polling remains no-open, and Electron enforces one desktop instance per user data directory.

## Blockers and safe alternatives

`CODEX-SDK-001`, `EXT-PERM-001`, and `BROWSER-LIVE-001` are resolved. There is no active P0/P1 blocker in the accepted internal-beta scope. The current Windows build is unsigned, store publication is deferred, and destructive clean-install/live-browser reruns remain intentionally excluded while the user installation is active.

## 2026-07-22 manual catalog recovery

The installed desktop build was older than the fresh package, so its renderer did not contain the current catalog path. The new build separates manual recovery from background discovery: a user click can open `https://chatgpt.com/` once and retry rendered sidebar discovery once; timers never open tabs. The installed build was updated in place and live DOM-only acceptance returned three titled canonical links and selectable Codex projects without sending a message.
