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

## 2026-07-18 16:44 +07:00 - P8-CTX-001

### Goal

Build a deterministic context-pack preview that selects relevant repository evidence without attaching unsafe or over-budget files.

### Changes

Added a versioned context-pack Zod contract and matching JSON Schema covering objective, project evidence, Codex output, work summary, changed files, diff summary, verification, failures, questions, memories, attachment preview, complete manifest, budget use, and expected ChatGPT response. Added a context-builder package with stable scoring, full/excerpt/diff rendering, hashing, deduplication, and configurable file/byte/token budgets. Extracted reusable safe file inspection from the file store so both storage and context selection share canonical allowlist, realpath, exclusion, size, and secret checks.

### Files

Context contracts and schema; new `packages/context-builder`; reusable file-store inspection; workspace aliases and lockfile; architecture and continuity records.

### Decisions

Use deterministic local scoring before any semantic retrieval. Keep blocked, deleted, duplicate, and over-budget entries in the manifest, but never attach their content. Sanitize outside-repository paths in preview metadata, preserve rename provenance across deduplication, estimate tokens conservatively from UTF-8 bytes, and select excerpts only on whole line boundaries.

### Verification

Targeted contracts, file-store, and context-builder tests pass 15/15. Coverage includes stable repeated ordering, changed/test/pinned ranking, byte/file budgets, Unicode-safe excerpts, supplied diffs, secrets, binaries, traversal, escaping symlinks, duplicates, deleted/renamed files, and empty diffs. Full repository verification is recorded before publication.

### Failures encountered

The first builder test exposed lost `previousPath` metadata when renamed content was deduplicated. Strict TypeScript also rejected optional exclusion properties passed explicitly as `undefined`.

### Root causes

The deduplication branch constructed a reduced manifest entry without the rename provenance used by attached and blocked branches. Zod-compatible optional values were forwarded directly into exact optional TypeScript contracts.

### Fixes

Normalized optional objects through conditional spreads, preserved sanitized rename metadata in every manifest state, and added regression assertions for deterministic and provenance-preserving output.

### Commit

Resolve with `git log -1 --grep "feat(context-builder): build safe deterministic context packs"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match.

### Next action

Implement `P9-MEM-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 16:59 +07:00 - P9-MEM-001

### Goal

Persist useful long-term memory with explicit approval, strict scope isolation, source provenance, deterministic retrieval, and a bounded new-chat bootstrap.

### Changes

Added migration v3 with memory project identity, SHA-256 content hashes, supersession links, active duplicate protection, and retrieval/source indexes. Added versioned memory contracts and JSON Schema. Implemented a memory engine supporting candidate creation, edited approval, rejection, deletion, supersession, legacy backfill, duplicate detection, persistent sources, deterministic approved-only retrieval, and budgeted bootstrap rendering.

### Files

Database migration/runtime generation and tests; memory contracts/schema; new `packages/memory-engine`; workspace aliases and lockfile; architecture and continuity records.

### Decisions

Keep the official four-state model: an explicit reject action transitions a candidate to non-active `deleted` rather than introducing an incompatible fifth status. Never auto-approve candidates. Bind project, conversation, and workflow memories to a project; keep global/team memories project-neutral. Rank after scope filtering by query overlap, category, confidence, recency, then stable ID. Preserve rejected, deleted, and superseded history for duplicate detection and provenance.

### Verification

Targeted migration, contract, and memory tests pass 20/20. Coverage includes candidate exclusion, edited approval, rejection persistence, deletion, supersession history, global/team/project/conversation merging, cross-project isolation, duplicate detection, stable ranking, recency tie-breaking, provenance, exact bootstrap budget, legacy backfill, and SQLite reopen recovery. Full repository verification is recorded before publication.

### Failures encountered

The first migration run exposed a stale v1-upgrade assertion that hardcoded schema version 2. Strict lint rejected ambiguous empty-string normalization, and strict AJV rejected conditional `required` fields not declared locally in their schema branches.

### Root causes

The earlier migration test asserted a historical latest version rather than the current generated migration list. Initial scope normalization used truthiness instead of explicit empty handling. The first JSON Schema expressed valid conditions but did not satisfy AJV strict conditional-property analysis.

### Fixes

Advanced the migration expectation to v3, used explicit undefined/empty normalization, declared conditional properties inside each JSON Schema branch, backfilled legacy hashes/project identity/source provenance, and added regression tests for every failure.

### Commit

Resolve with `git log -1 --grep "feat(memory): add approved scoped long-term memory"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match.

### Next action

Implement `P10-WF-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 17:19 +07:00 - P10-WF-001

### Goal

Persist workflow transitions, transfer approvals, external-send intent, acknowledgement, and restart recovery so an interrupted process cannot silently repeat a ChatGPT or Codex handoff.

### Changes

Added migration v4 with bounded workflow controls, structured event metadata, scoped approval bindings, and an idempotent effect journal. Added versioned workflow Zod/JSON Schema contracts and a workflow engine for transactional event/projection updates, explicit transition guards, retry/iteration limits, single-use approval capabilities, prepared/dispatching/acknowledged/failed effects, audit records, projection rebuild, and restart recovery.

### Files

Database migration/runtime generation and upgrade tests; workflow contracts and schema; new `packages/workflow-engine`; workspace aliases and lockfile; security, architecture, and continuity records.

### Decisions

Use the effect journal, never renderer or workflow projection state, as the duplicate-send authority. Persist `dispatching` before crossing the external boundary; after an interruption it requires confirmation and is never auto-resent. Store only SHA-256 approval-token hashes, cap approval lifetime at 15 minutes, bind each approval to workflow/project/operation/destination/payload, consume it in the same transaction that creates the effect, and increment Codex iterations only after acknowledgement.

### Verification

Targeted migration, contract, and workflow tests passed 34/34 after the final additions. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 109 Vitest tests, one Chromium fixture E2E, and all 13 buildable workspace projects.

### Failures encountered

Pre-test review found inconsistent normalization that could store uppercase hashes or whitespace-padded idempotency/destination values, a raw SQLite correlation conflict, and approval creation outside an audit transaction. Fault-injection tests also exercised partial transition, approval-consumption, dispatch, and acknowledgement boundaries.

### Root causes

The initial draft validated some values for lookup but reused the unnormalized input for persistence. It relied on a unique constraint for correlation ownership and treated approval creation as a standalone insert rather than an audited security decision.

### Fixes

Normalized and runtime-validated operations, hashes, identifiers, and destinations before lookup and persistence; mapped correlation reuse to a stable domain error; made approval plus audit insertion atomic; and added regression coverage for rollback, mismatch, expiry, token secrecy, idempotency conflicts, loop limits, failed sends, projection rebuild, and SQLite reopen recovery.

### Commit

Resolve with `git log -1 --grep "feat(workflow): persist recoverable handoff workflows"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match.

### Next action

Implement `P11-CHAT-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 17:36 +07:00 - P11-CHAT-001

### Goal

Prepare a reviewed context handoff for an existing or new ChatGPT conversation, require the persisted single-use workflow approval, avoid automatic submission, and acknowledge only a manually sent payload proven through rendered capture.

### Changes

Added versioned assisted-preview and page-operation contracts, effect-bound composer insert/clear operations, page identity/composer inspection, exact text hashing, and a second Chromium fixture flow. Added `packages/assisted-chatgpt` for deterministic handoff rendering, confidence/project/destination guards, P10 approval/effect preparation, composer or explicit clipboard dispatch, no-repeat confirmation state, streaming-aware capture acknowledgement, abortable polling, and exact-hash cancellation.

### Files

Assisted contracts and JSON Schema; new assisted ChatGPT package and tests; extension page actions, content request handling, fixture, and E2E; workspace aliases/lockfile; architecture, security, protocol, and continuity records.

### Decisions

Do not treat composer insertion as a completed send. Persist `dispatching` before insertion/copy, return `sent: false`, and acknowledge only after streaming stops and the latest rendered user message matches the approved payload hash. Require exact conversation identity for existing destinations, allow a new-chat page to transition to its created conversation, make clipboard use explicit, and never clear composer content after user edits change its hash.

### Verification

Targeted assisted-contract, orchestration, page-action, transport, and Chromium fixture tests passed. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 124 Vitest tests, two Chromium fixture E2E tests, and all 14 buildable workspace projects.

### Failures encountered

Strict TypeScript rejected `Array.findLast` under the ES2022 target and an overly narrow test adapter inference. Strict lint found an unnecessary async test and a type-only runtime import. The first E2E run resolved a stale built contracts package that lacked the new page schema. Security review also found that a caller-mutated preview could retain an old payload hash before clipboard dispatch.

### Root causes

The initial implementation assumed a newer array library, inferred one destination variant from the fake adapter initializer, and relied on workspace `dist` resolution during source-level Vite tests. Preview schema checked shape and character count but could not itself recompute cryptographic hashes.

### Fixes

Used an ES2022-compatible reverse scan, explicitly typed the adapter union, corrected strict imports/tests, aliased the extension Vite build to the contracts source, and recomputed both payload and lineage hashes inside every approval/prepare/dispatch trust boundary. Added regression tests for mutation, legacy approval-only operations, wrong destinations, ambiguous clipboard failures, exact clear, and new-chat URL transition.

### Commit

Resolve with `git log -1 --grep "feat(chatgpt): add reviewed assisted handoffs"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match.

### Next action

Implement `P12-HANDOFF-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 17:52 +07:00 - P12-HANDOFF-001

### Goal

Persist and route one validated structured ChatGPT response to the correct Codex destination without cross-project execution, replay, unreviewed prompts, or duplicate transfer.

### Changes

Added migration v5 response receipts, Codex destination/route preview contracts, persisted Codex thread lookup, and `packages/response-router`. The router validates response identity and workflow state, persists a unique receipt, builds a tamper-checked prompt preview, resolves existing/new/worktree destinations, consumes P10 approval/effects, registers new threads, and projects structured mock lifecycle events.

### Files

Database migration/runtime/tests; response and destination contracts; project-registry thread lookup; new response-router package/tests; workspace aliases/lockfile; architecture, security, and continuity records.

### Decisions

Use a durable receipt rather than an in-memory accepted-ID set. Require an explicit worktree provider instead of mutating Git directly. Treat mock adapter lifecycle as domain evidence only. Persist `dispatching` before adapter calls and make thread mapping, acknowledgement, workflow projection, and receipt routing one local transaction after external acceptance.

### Verification

Targeted database, registry, and router tests passed 15/15. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 130 Vitest tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects.

### Failures encountered

The first test setup used stale registry constructor/method names, destination inference narrowed to new-thread only, and strict lint required optional-chain normalization.

### Root causes

The implementation was written against inferred registry ergonomics rather than its exact public API, while test helper defaults over-specialized a destination union. Strict lint exposed redundant null checks after control-flow narrowing.

### Fixes

Aligned setup with `ProjectRegistry.create` and its clock callback, typed destination helpers against the full union, normalized strict conditions, and reran targeted plus full gates.

### Commit

Resolve with `git log -1 --grep "feat(routing): route validated prompts to codex"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match.

### Next action

Implement `P13-UI-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 18:02 +07:00 - P12-CI-002

### Goal

Restore reproducible clean-checkout lint and test resolution for the published P12 response router before starting Phase 13.

### Changes

Added matching TypeScript and Vitest source aliases for `@codex-context-bridge/codex-adapter`, keeping source-level verification independent of locally generated package `dist` artifacts.

### Files

Root TypeScript and Vitest resolution configuration plus continuity status, matrix, worklog, and machine-readable state.

### Decisions

Fix package resolution at the workspace tooling boundary instead of weakening response-router lint/types or adding generated artifacts to CI. No production behavior, extension permission, or live-integration claim changes.

### Verification

Targeted response-router ESLint, package type-check, and six router tests passed. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 130 Vitest tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects.

### Failures encountered

GitHub Actions run `29641649890` failed during lint on a clean Ubuntu checkout with unresolved/error-typed `MockCodexAdapter` and `CodexRun` usage in response-router tests.

### Root causes

The response router imported the workspace Codex adapter without matching aliases in `tsconfig.base.json` and `vitest.config.ts`. Local generated `dist` output masked the missing source resolution before publication.

### Fixes

Mapped the Codex adapter package directly to its source entry in both TypeScript and Vitest, then reproduced the failing package boundary and reran the full gate.

### Commit

Resolve with `git log -1 --grep "fix(ci): resolve codex adapter from source"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match. Replacement GitHub Actions must pass before Phase 13 implementation starts.

### Next action

Publish this CI fix, watch its GitHub Actions run to completion, then implement `P13-UI-001` exactly as described in `RECOVERY.md`.
