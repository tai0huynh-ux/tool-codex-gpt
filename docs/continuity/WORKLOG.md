# Checkpoint Worklog

Entries are append-only after publication.

## 2026-07-18 14:33 +07:00 - P0-CONT-001

### Goal

Make repository state recoverable without prior chat history.

### Changes

Added continuity documents, machine-readable state and schema, a read-only status helper, validation tests, two project skills, and startup instructions in `AGENTS.md`.

### Files

`docs/continuity`, `docs/adr`, `.agent-state`, `.agents/skills`, `scripts/project-status.mjs`, root test configuration, and `AGENTS.md`.

### Decisions

Use symbolic Git references in state (`HEAD`, `origin/main`, and `STATE_FILE_COMMIT`) because a committed file cannot contain its own final cryptographic commit hash. Resolve them through the status helper and Git.

### Verification

Baseline full verification passed before the checkpoint. The final gate passed with 19 Vitest tests, one Chromium Playwright test, formatting, lint, strict type-check, and all builds. Both project skills passed the official validator, and the read-only status helper returned the expected repository state.

### Failures encountered

The skill initializer initially failed to print a Unicode workspace path under the Windows legacy code page.

### Root causes

Python used the active Windows character map while the repository path contains Vietnamese characters.

### Fixes

Reran the official initializer with `PYTHONUTF8=1`; no files were created outside the repository.

### Commit

Resolve with `git log -1 -- docs/continuity/WORKLOG.md`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match.

### Next action

Implement `P1-TOOL-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 14:45 +07:00 - P1-TOOL-001

### Goal

Make workspace commands portable without changing Windows operator instructions.

### Changes

Replaced Windows-only `pnpm.cmd` inside package scripts and the Playwright web-server command with portable `pnpm` invocations. Added regression tests that scan every workspace package script and the Playwright configuration.

### Files

`package.json`, `playwright.config.ts`, `tests/tooling/cross-platform-scripts.test.ts`, and continuity records.

### Decisions

Keep `pnpm.cmd` in Windows PowerShell documentation, but never embed it in package-managed scripts that execute through the platform shell.

### Verification

Targeted tooling tests passed 2/2. Full verification passed with 21 Vitest tests, one Chromium Playwright test, formatting, lint, strict type-check, and all builds.

### Failures encountered

The first full gate after advancing state failed because the continuity helper test still expected the completed task ID.

### Root causes

The initial root scripts were authored specifically for PowerShell execution-policy constraints rather than package-manager portability. The continuity test encoded a historical task ID instead of validating that the helper reflects the current state file.

### Fixes

Moved the Windows-specific choice to the operator boundary and added a regression test for future scripts. Changed the continuity assertion to compare helper output with the current machine-readable state.

### Commit

Resolve with `git log -1 --grep "chore(tooling): make workspace scripts cross-platform"`.

### Push

Verify HEAD and `origin/main` equality after publication.

### Next action

Implement `P1-CI-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 14:57 +07:00 - P1-CI-001

### Goal

Run the repository's full credential-free verification contract on every push and pull request.

### Changes

Added a Linux GitHub Actions workflow with frozen pnpm installation, Chromium setup, timeout and concurrency controls, the full verification gate, and failure-only Playwright artifacts. Updated the action majors to their Node.js 24 runtime releases and added workflow regression coverage.

### Files

`.github/workflows/verify.yml`, `README.md`, `tests/tooling/ci-workflow.test.ts`, and continuity records.

### Decisions

Keep live Codex and authenticated ChatGPT checks outside CI. Pin action major versions that use Node.js 24 while pinning the project pnpm version exactly.

### Verification

Local `pnpm.cmd run verify` passed with 24 Vitest tests, one Chromium Playwright test, formatting, lint, strict type-check, and all builds. GitHub Actions runs `29636449824` and `29636579711` passed; the final run completed in 1m18s and returned no check annotations.

### Failures encountered

The first successful workflow used action releases that emitted a Node.js 20 deprecation annotation.

### Root causes

The original action major versions still executed on the deprecated Node.js 20 action runtime even though the project itself tested on Node.js 24.

### Fixes

Updated checkout and setup-node to v7, pnpm/action-setup to v6, and upload-artifact to v7, with tests locking those runtime-compatible majors.

### Commit

Implementation: `3787b41`. Runtime update: `b091234`.

### Push

Both commits were pushed to `origin/main`; `HEAD` and `origin/main` matched at `b0912340068440c16e618ba479d81776c836f335` before this continuity update.

### Next action

Implement `P1-DATA-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 15:02 +07:00 - P1-DATA-001

### Goal

Remove silent drift between the distributable SQLite migration and the runtime migration bundled into the database package.

### Changes

Made `packages/database/migrations/0001_initial.sql` the canonical source, added deterministic runtime module generation, added check and generate commands, enforced parity at root verification and direct database type-check/build entry points, and added drift/regeneration regression tests.

### Files

`scripts/sync-initial-migration.mjs`, `packages/database/src/migration.ts`, root and database package scripts, `tests/tooling/migration-source.test.ts`, architecture, and continuity records.

### Decisions

Keep the runtime migration embedded in the compiled package for reliable distribution, but treat it as generated output. Normalize line endings for cross-platform generation while requiring every other generated byte to match.

### Verification

Targeted migration and database tests passed 4/4. Full `pnpm.cmd run verify` passed with migration parity checks, 26 Vitest tests, one Chromium Playwright test, formatting, lint, strict type-check, and all builds.

### Failures encountered

The first generated TypeScript module was semantically correct but did not match Prettier's line break before the long string literal.

### Root causes

The generator emitted a valid one-line assignment while repository formatting requires the assignment operator and long literal on separate lines.

### Fixes

Adjusted the deterministic renderer to emit Prettier-compatible output directly and strengthened exact target comparison so extra generated bytes are detected.

### Commit

Resolve with `git log -1 --grep "fix(database): prevent migration source drift"`.

### Push

Verify HEAD and `origin/main` equality after publication.

### Next action

Implement `P2-CODEX-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 15:08 +07:00 - P2-CODEX-001

### Goal

Make the mock Codex lifecycle lossless and explicit before any production adapter depends on it.

### Changes

Added typed start, progress, completion, failure, and cancellation events with monotonic sequence numbers and timestamps; added event journaling and replay for late subscribers; returned running runs before background completion; added structured run lookup, cancellation idempotency, terminal guards, immutable recorded events, and subscriber failure isolation.

### Files

`packages/codex-adapter/src/index.ts`, `packages/codex-adapter/src/index.test.ts`, architecture, and continuity records.

### Decisions

Keep this adapter explicitly mock-only. Use structured lifecycle state rather than final-response text, preserve late-subscriber evidence through replay, and reject cancellation after completion or failure.

### Verification

Six targeted lifecycle tests cover identity, ordered replay, cancellation races, structured failure, completed-run terminal guards, and broken subscriber isolation. Full `pnpm.cmd run verify` passed with 31 Vitest tests, one Chromium Playwright test, migration parity, formatting, lint, strict type-check, and all builds.

### Failures encountered

Strict type-check rejected an explicit `error: undefined` copy, and full lint rejected two verbose null/status guards.

### Root causes

The repository enables `exactOptionalPropertyTypes` and the optional-chain preference rule; the initial compatible implementation did not yet follow those stricter local contracts.

### Fixes

Only copy the optional error field when present and express missing-or-not-running guards with optional chaining.

### Commit

Resolve with `git log -1 --grep "fix(codex): preserve ordered run lifecycle"`.

### Push

Verify HEAD and `origin/main` equality after publication.

### Next action

Implement `P4-EXT-001` exactly as described in `RECOVERY.md` while `CODEX-SDK-001` keeps Phase 3 live acceptance blocked.

## 2026-07-18 15:16 +07:00 - P4-EXT-001

### Goal

Capture long virtualized conversations without losing messages that are removed from the DOM.

### Changes

Added multi-pass scrolling accumulation with stable message IDs, explicit ordering, content fallback deduplication, streaming text replacement, abort support, bounded passes, and selector failure reporting. Replaced the Chromium fixture with a virtualized window containing duplicate text.

### Verification

Unit fixtures cover visible capture, virtualized replacement, abort, selector failure, and streaming updates. Full verification passed with 34 Vitest tests, one virtualized Chromium E2E, formatting, lint, strict type-check, migration parity, and all builds.

### Failures and fixes

Strict lint rejected unsafe DOM assertions, numeric template interpolation, redundant conversions, and an overly verbose optional guard. Replaced them with explicit fixture checks, string conversion at markup boundaries, and the repository's strict narrowing style.

### Commit

Resolve with `git log -1 --grep "fix(extension): preserve virtualized conversation capture"`.

### Push

Verify HEAD and `origin/main` equality after publication.

### Next action

Implement `P5-EXT-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 15:28 +07:00 - P5-EXT-001

### Goal

Update user-opened ChatGPT composers through controlled editing behavior without automatic submission, and parse only a bounded structured response associated with the expected handoff and project.

### Changes

Added native textarea-setter and contenteditable insertion with cancellable `beforeinput`, `input`, and `change` events; rejected missing, disabled, and read-only composers. Added a strict response contract in Zod and JSON Schema, exact paired markers, a 100,000-character default bound, explicit parse errors, identity checks, and duplicate rejection. Updated page status handling and handoff documentation.

### Files

Extension page actions, content script, extension package metadata and tests; response contracts and schema; lockfile; handoff protocol; and continuity records.

### Decisions

Never submit from the insertion helper. Treat all rendered ChatGPT output as untrusted, select the latest opening marker and require its matching close marker, validate before routing, and keep final forwarding subject to user review.

### Verification

Targeted contract and page-action tests passed 13/13. Extension and contracts type-checks passed. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict TypeScript, 45 Vitest tests, one Chromium fixture E2E, and all workspace builds.

### Failures encountered

Initial tests contained a syntax typo; AJV strict mode rejected conditional properties that were not locally declared; ESLint rejected unbound native getter/setter references.

### Root causes

The first schema conditions were semantically valid but did not satisfy AJV's strict conditional-property analysis, and extracting prototype methods directly violated the repository's method-binding safety rule.

### Fixes

Corrected the fixture, declared conditional properties within the strict schema branches, and invoked native accessors through their property descriptor without weakening AJV, TypeScript, or ESLint.

### Commit

Resolve with `git log -1 --grep "fix(extension): harden composer and response parsing"`.

### Push

Verify HEAD and `origin/main` equality after publication.

### Next action

Implement `P6-IPC-001` exactly as described in `RECOVERY.md`, beginning with the transport ADR.

## 2026-07-18 15:50 +07:00 - P6-IPC-001

### Goal

Choose a safe local extension boundary and implement authenticated, bounded transport contracts plus a typed Electron renderer/main boundary.

### Changes

Accepted ADR-0001 selecting Native Messaging after comparing localhost HTTP, localhost WebSocket, and manual clipboard. Added operation-specific transport schemas, capability authentication, short expiry, replay caches, rate limiting, bounded framing, explicit errors, reconnecting extension client behavior, and exact request correlation. Added Electron IPC sender validation, runtime schemas, timeout/error mapping, transfer audit metadata, and narrow preload methods.

### Files

ADR, research/security/architecture docs; contracts; new `packages/local-transport`; extension native client and tests; desktop IPC/main/preload and tests; workspace aliases, package metadata, lockfile, and continuity records.

### Decisions

Use Native Messaging for production because it has an exact browser-managed extension origin and no listening socket. Keep host registration and `nativeMessaging` manifest permission activation separate and deferred; the current manifest is unchanged and desktop reports `permissionActive: false`. Manual clipboard remains Assisted-mode fallback only.

### Verification

Official Chrome and Electron documentation was reviewed for native framing/origin rules, MV3 WebSocket lifecycle, cross-origin permissions, and context-isolated IPC guidance. Targeted transport/client/IPC tests passed 12/12. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict TypeScript, 57 Vitest tests, one Chromium fixture E2E, and all workspace builds.

### Failures encountered

The first timeout test attached its rejection assertion after fake time advanced, producing an unhandled-rejection warning. Initial strict lint also rejected promise-only async fixtures, an unused destructured capability, and unformatted new files.

### Root causes

The test promise rejected before Vitest observed the assertion, and the first implementation used async syntax and omission patterns that did not satisfy the repository's strict lint contract.

### Fixes

Attached the rejection expectation before advancing time, returned explicit promises in fixtures, constructed a capability-free authenticated request explicitly, formatted the changed files, bounded replay caches to request expiry, and narrowed trusted IPC senders to registered renderer IDs.

### Commit

Resolve with `git log -1 --grep "feat(transport): add authenticated local extension bridge"`.

### Push

Verify HEAD and `origin/main` equality after publication.

### Next action

Implement `P7-PROJ-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 16:07 +07:00 - P7-DATA-001

### Goal

Create the non-destructive persistence and identity foundation required for multi-repository project mapping before exposing it through the desktop UI.

### Changes

Generalized generated runtime migrations into an ordered version list and added migration v2 for project/repository archive state, branch/worktree metadata, and mapping confirmation history. Extended the registry with archive/restore, aliases, repository registration/refresh/archive, ChatGPT source and Codex thread registration, validated evidence, and atomic mapping supersession. Made Windows path identity host-independent and added explicit tied-candidate ambiguity.

### Files

Migration generator and SQL/runtime migration files; database migration runner/tests; contracts; project detector; project registry/package/lockfile; architecture and continuity records.

### Decisions

Never hard-delete projects through the registry's supported lifecycle. Keep branch outside the repository fingerprint, distinguish worktrees by canonical root, and refuse to auto-select when multiple candidates share the highest confidence. Preserve all mapping decisions as confirmed, rejected, or superseded history.

### Verification

Targeted migration, detector, and registry tests passed 14/14. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict TypeScript, 63 Vitest tests, one Chromium fixture E2E, and all workspace builds.

### Failures encountered

The initial multi-migration generator emitted double-quoted migration names that Prettier rewrote, causing deterministic parity checks to fail. Strict lint also rejected numeric template interpolation and optional string handling.

### Root causes

The generated module was semantically correct but not byte-identical to repository formatting, and the first implementation did not fully follow strict interpolation/nullish conventions.

### Fixes

Made the generator emit Prettier-stable single-quoted names, stringified migration versions explicitly, normalized optional metadata through a dedicated helper, and retained deterministic drift checking.

### Commit

Resolve with `git log -1 --grep "feat(projects): add mapping persistence"`.

### Push

Verify HEAD and `origin/main` equality after publication.

### Next action

Implement `P7-UI-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 16:31 +07:00 - P7-UI-001 / P7-PROJ-001

### Goal

Expose the verified project-mapping persistence through a safe, usable desktop workflow without moving trust or database access into the renderer.

### Changes

Added validated project IPC for list, create, archive, aliases, directory selection, repository preview, and explicit confirmation. Opened the persistent SQLite database in Electron main, recomputed evidence in the main process, recorded payload-free audit outcomes, and exposed narrow preload methods. Replaced the foundation renderer with a responsive Vietnamese-first project workspace covering project detail, repository metadata, confidence evidence, ambiguous destination selection, confirmation, aliases, and non-destructive archive.

### Files

Desktop main/preload/project IPC and tests; renderer component, typing, tests, styling, and HTML; project detector scoring export; desktop package metadata and lockfile; architecture and continuity records.

### Decisions

Never accept renderer-supplied confidence or evidence. Require literal confirmation at the validated IPC boundary, keep SQLite and directory dialogs in Electron main, omit undefined optional properties under strict TypeScript, and preserve the existing cream/forest/rust visual language with one dominant repository-analysis action.

### Verification

Targeted IPC, renderer, and detector tests passed 11/11, including file-backed SQLite reopen. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 69 Vitest tests, one Chromium fixture E2E, and all builds. Chromium screenshots at 1440x1000 and 390x844 were inspected for desktop/mobile layout.

### Failures encountered

Initial IPC objects explicitly carried optional `undefined` values under `exactOptionalPropertyTypes`; strict lint also rejected unsafe test matchers, redundant conditions, deprecated form event types, and numeric template interpolation.

### Root causes

Zod inference permits optional fields to be present with `undefined`, while the project fingerprint contract requires exact omission. Early tests used broad asymmetric matchers that weakened static analysis, and renderer event/types had not yet been aligned with the repository's strict ESLint profile.

### Fixes

Added exact optional normalization helpers, kept runtime schemas authoritative, replaced unsafe matchers with typed assertions, used current React event types, and added focused regression coverage for ambiguity confirmation and persistent reload.

### Commit

Resolve with `git log -1 --grep "feat(projects): add registration and mapping UI"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match.

### Next action

Implement `P8-CTX-001` exactly as described in `RECOVERY.md`.
