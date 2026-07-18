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
