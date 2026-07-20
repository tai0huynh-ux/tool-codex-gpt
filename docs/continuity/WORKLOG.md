# Checkpoint Worklog

Entries are append-only after publication.

## 2026-07-19 13:12 +07:00 - P18-CODEX-001 (in progress)

### Goal

Add a repository-bound Codex execution profile that can write only the explicitly registered temporary repository while keeping read-only as the default.

### Changes

Added `CodexExecutionProfile`, canonical non-symlink root validation, a required registry validator for workspace-write, profile-specific SDK sandbox selection, and response-router approval/destination binding. Workspace-write preserves approval policy `never`, network disabled, web search disabled, and exact working-directory routing; existing threads must match the approved profile.

### Verification

Targeted adapter and response-router tests pass. Negative cases cover missing validator, non-directory root, project/fingerprint/root mismatch, and approved-profile mismatch.

### Security and limitations

No live writable Codex run was performed. The production main-process registry validator is still supplied by the upcoming desktop pilot orchestration; without it, workspace-write fails closed. Fixture results remain fixture-only.

### Next action

Run the full verification gate, publish the atomic Codex profile checkpoint, then wire the desktop pilot to supply the validator only after explicit approval.

## 2026-07-19 12:59 +07:00 - P18-CHATGPT-001 (in progress)

### Goal

Add an explicitly approved ChatGPT submit operation without weakening the existing no-submit insertion boundary.

### Changes

Added the versioned `composer.submit` contract/result, semantic submit selectors and exact page/destination/hash checks, draft and streaming pre-insert guards, assisted-service submit orchestration, and a content-script effect reservation that blocks concurrent duplicate clicks while retaining confirmation-required ambiguity.

### Verification

The initial full `pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 174 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds. The regression set then passed 46 tests, including the newly reproduced concurrent submit race and deterministic rejection retry behavior.

### Security and limitations

The operation still requires the existing main-process approval path; a successful DOM click is not treated as acknowledgement. No live ChatGPT submit was performed, no browser credentials/profile data was read, and no ambiguous result is retried automatically.

### Next action

Run the checkpoint publication procedure, then begin the repository-bound Codex workspace-write profile as a separate atomic checkpoint.

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

## 2026-07-18 18:12 +07:00 - P13-UI-001

### Goal

Expose persisted workflow state as a guided, accessible desktop timeline without moving database, approval-token, audit-detail, repository, or adapter access into the renderer.

### Changes

Added a typed workflow IPC/preload boundary that lists persisted runs, ordered events, recovery effects, approval metadata, and redacted audit outcomes. Added main-process workflow creation and cancellation through `WorkflowEngine`. Added a responsive workflow deck with run selection, textual state badges, timeline, iteration/retry limits, approval/recovery summaries, diagnostics refresh, start, and cancellation controls.

### Files

Desktop workflow IPC/service/tests; main and preload registration; workflow renderer/tests/styles; desktop workspace dependency and lockfile; roadmap, status, recovery, matrix, worklog, and machine-readable state.

### Decisions

Return approval scope and expiry but never capability tokens. Return audit event type/outcome/time but never detail payloads. Do not invent generic retry or send actions where the domain requires a reviewed context or prompt preview; the UI reports persisted state and exposes only safe actions currently backed by verified domain methods.

### Verification

Targeted desktop lint, strict type-check, build, IPC tests, project renderer tests, and workflow accessibility tests passed. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 133 Vitest tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects.

### Failures encountered

The first workflow test used a rejected-promise assertion around a synchronous service error, and strict lint rejected unused type imports, `Array<T>` style, an unsafe button cast, and an unbound mocked method reference.

### Root causes

The service intentionally supports synchronous domain execution behind an async IPC wrapper, while the initial test assumed every boundary helper returned a promise. Test ergonomics also did not initially match the repository's strict lint conventions.

### Fixes

Asserted the synchronous domain error directly, retained async behavior at IPC, normalized strict array/import style, narrowed the button with a runtime guard, and held the cancellation spy in a bound local variable.

### Commit

Resolve with `git log -1 --grep "feat(desktop): add guided workflow timeline"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match. Watch the replacement GitHub Actions run to completion.

### Next action

Implement `P14-E2E-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 18:22 +07:00 - P14-E2E-001

### Goal

Prove the complete recoverable fixture loop across persisted project identity, reviewed assisted ChatGPT transfer, structured response routing, mock Codex lifecycle, restart, and duplicate prevention.

### Changes

Added a dedicated `test:workflow-e2e` command and a file-backed SQLite integration fixture. The golden path creates a project/repository and workflow, advances the initial mock Codex phase, reviews and approves a ChatGPT handoff, proves composer insertion occurs once, acknowledges only from rendered user content, validates and routes the structured response, runs a reviewed mock Codex prompt, then reopens SQLite and verifies state, events, effects, receipt, and thread mapping. A second fixture crashes at the ambiguous composer boundary and proves restart exposes confirmation-required recovery without reinsertion.

### Files

Root E2E scripts; recoverable workflow integration fixture; roadmap, status, recovery, matrix, worklog, and machine-readable state.

### Decisions

Use real domain packages and file persistence while keeping ChatGPT and Codex adapters explicit fixtures. Do not count this as live integration. Assert both application-level duplicate response protection and effect-level no-repeat behavior across acknowledgement and ambiguous dispatch boundaries.

### Verification

`pnpm.cmd run test:workflow-e2e` passed 2/2. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 135 Vitest tests, two recoverable workflow fixture E2E tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects.

### Failures encountered

No production defect was found while composing the loop. The fixture clarified that mock adapter state itself is in-memory, so restart acceptance must be based on persisted application projections, effects, receipts, and mappings rather than pretending a new mock adapter is a live resumed Codex service.

### Root causes

Not applicable to production behavior; the distinction is an integration-evidence boundary.

### Fixes

Reopened the real SQLite database and asserted only durable application state. Kept live SDK acceptance under `CODEX-SDK-001`.

### Commit

Resolve with `git log -1 --grep "test(e2e): cover recoverable handoff loop"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match. Watch GitHub Actions to completion.

### Next action

Implement `P15-SEC-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 18:30 +07:00 - P15-SEC-001

### Goal

Close the security-hardening phase by testing and bounding the newest Electron workflow IPC boundary and consolidating the existing adversarial evidence across all trust boundaries.

### Changes

Added maximum lengths for workflow IPC identifiers, destinations, event types, and outcomes; strict schemas already reject unknown properties. Added tests for oversized IDs, injected fields, and renderer response redaction. Seeded real approval and audit rows to prove approval token hashes and audit detail payloads never cross IPC. Updated the security model with implemented duplicate/iteration controls and a verification-coverage inventory.

### Files

Workflow IPC schemas/tests; security policy; roadmap, status, recovery, matrix, worklog, and machine-readable state.

### Decisions

Harden the demonstrated P13 boundary without duplicating already-green file, transport, workflow, response, extension, and routing tests. Preserve useful approval/audit summaries while keeping secrets, content, capability values, and raw detail JSON main-process-only.

### Verification

Targeted workflow IPC plus recoverable fixture tests passed 5/5. Full `pnpm.cmd run verify` passed with migration parity, formatting, lint, strict type-check, 136 Vitest tests, two recoverable workflow fixture E2E tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects.

### Failures encountered

Security review found unbounded non-empty workflow IPC identifiers. Existing strict schemas already rejected extra properties, and existing output projection already omitted sensitive database columns.

### Root causes

The first P13 IPC contract focused on shape and sender validation but did not set explicit size budgets for identifier-like input.

### Fixes

Introduced reusable bounded ID schemas and bounded output strings, then added direct regression coverage for oversized input, extra fields, approval-token hash exclusion, and audit-detail redaction.

### Commit

Resolve with `git log -1 --grep "security: harden workflow IPC boundary"`.

### Push

Verify with `git fetch origin`, `git rev-parse HEAD`, and `git rev-parse origin/main`; the hashes must match. Watch GitHub Actions to completion.

### Next action

Implement `P16-REL-001` exactly as described in `RECOVERY.md`.

## 2026-07-18 18:45 +07:00 - P16-REL-001 (publication pending)

### Goal

Create reproducible Windows desktop and extension artifacts with database recovery, redacted diagnostics, checksums, and clean-profile installation evidence.

### Changes

Added electron-builder NSIS x64 configuration, Windows packaging and packaged-smoke scripts, ignored artifact output, extension ZIP creation, SHA-256/signature manifest generation, redacted diagnostics export, and a versioned pre-open SQLite backup. Added backup tests and root release commands.

### Files

Desktop packaging configuration/dependency/lockfile; database backup module/tests and main-process integration; Windows package/smoke scripts; diagnostics exporter; Git ignore; release checklist and continuity records.

### Decisions

Use electron-builder 24.13.3 because version 26 violates the repository supply-chain policy through an exotic Git subdependency. Keep `npmRebuild` disabled because the older builder cannot execute pnpm 11's JavaScript entrypoint as a Windows executable; require packaged smoke as the acceptance check for the shipped native binary. Report signing honestly as `NotSigned` and do not publish a GitHub Release.

### Verification

Full `pnpm.cmd run verify` passed with 138 Vitest tests, two recoverable fixture E2E tests, two Chromium fixture E2E tests, and all builds. `pnpm.cmd run package:win` produced the NSIS installer, blockmap, extension ZIP, and SHA-256 manifest. Unpacked smoke passed. Silent installer exit was 0, clean-profile installed app remained running, and silent uninstall exit was 0.

### Failures encountered

electron-builder 26 was blocked by `blockExoticSubdeps`. electron-builder 24 initially attempted to execute pnpm's `.mjs` entrypoint as a Win32 binary during native rebuild. The first manifest script used a newer .NET `Path.GetRelativePath` API unavailable in Windows PowerShell. Full verify then caught a diagnostic script using the disallowed global `console`.

### Root causes

The current pnpm supply-chain policy intentionally rejects Git subdependencies; builder 24 predates pnpm 11's Windows launcher layout; Windows PowerShell runs an older .NET surface; and project ESLint does not expose browser/Node console globals by default.

### Fixes

Selected the policy-compatible builder, disabled its broken rebuild path while retaining real packaged smoke, computed relative paths by validated prefix removal, and wrote diagnostics output through `process.stdout`.

### Commit

Resolve with `git log -1 --grep "build(release): add reproducible Windows packaging"`.

### Push

Pending commit, push, remote hash verification, and clean-checkout GitHub Actions.

### Next action

Publish this checkpoint and finalize the release checklist after CI passes.

## 2026-07-18 18:50 +07:00 - MVP-RELEASE-GATE

### Goal

Finalize the independently deliverable MVP after P16 clean-checkout CI and preserve the remaining live-integration boundary honestly.

### Changes

Marked Phase 16 and the release checklist complete, moved machine-readable state to blocked live acceptance, and recorded exact next actions for `CODEX-SDK-001` and authenticated ChatGPT smoke.

### Verification

GitHub Actions run `29643141058` passed in 1m52s for `77a495b`. Local full verification, installer/extension packaging, checksums, redacted diagnostics, database backup tests, unpacked smoke, silent install, clean-profile launch, and silent uninstall all passed.

### Current limitation

Live Codex SDK acceptance remains blocked before `thread.started` by the external model catalog missing `supports_reasoning_summaries`. Mock and fixture evidence remains labeled non-live. Native Messaging registration/permission activation remains deferred to an explicitly authorized installed integration smoke.

### Next action

Resolve `CODEX-SDK-001` externally, rerun the live spike, then perform the user-opened authenticated ChatGPT smoke. No independent repository phase remains before that external condition changes.

## 2026-07-18 19:03 +07:00 - P6-IPC-002

### Goal

Audit the claimed MVP boundary and correct the production Native Messaging command direction without activating new extension permissions.

### Changes

Replaced the extension-side request client with a dormant MV3 service-worker bridge that receives capability-free host commands, validates schema, expiry, replay, size, and result shape, and routes operations to the exact user-opened ChatGPT tab. Added deterministic existing/new destination selection and a two-entry extension build.

### Root cause

The prior fixture modeled the extension as sending `conversation.capture` and composer commands to a native host, but a host cannot access the ChatGPT DOM. No background service worker consumed host-forwarded commands, so the selected production architecture could not execute the documented workflow.

### Security

The desktop capability is stripped before the browser boundary. Replay, expired, oversized, malformed, and execution-failure inputs fail closed with bounded redacted errors. The manifest still excludes `nativeMessaging` and `<all_urls>`; the service worker remains dormant until explicit permission authorization.

### Verification

`pnpm.cmd run verify` passed: migration parity, formatting, lint, strict type-check, 145 Vitest tests, two recoverable workflow E2E tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects. The extension emitted independent `content-script.js` and `service-worker.js` bundles.

### Next action

Implement P6-IPC-003: a separate authenticated native-host relay, desktop local IPC client, exact-origin Windows registration, and packaged restart/uninstall smoke without activating the extension permission.

## 2026-07-18 19:14 +07:00 - P6-IPC-002-CI

### Goal

Restore clean-checkout Chromium fixture execution after the P6-IPC-002 extension build refactor.

### Failure

GitHub Actions run `29643866680` passed formatting, lint, type-check, and all 145 Vitest tests, then both Chromium fixtures timed out because Vite could not resolve `@codex-context-bridge/contracts`.

### Root cause

The production build moved to `build.mjs`, but deleting `vite.config.ts` also removed the source alias used by the Playwright development server. Windows had stale built workspace output available, masking the clean-checkout failure.

### Fix

Restored a development-only Vite config containing the contracts source alias while keeping production's independent two-entry build script.

### Verification

Extension strict type-check passed, both recoverable workflow E2E tests passed, both Chromium fixture E2E tests passed, and the content-script plus service-worker build passed.

### Next action

Publish the CI fix, wait for clean-checkout verification, then continue P6-IPC-003.

## 2026-07-18 19:59 +07:00 - P6-IPC-003

### Goal

Install an authenticated desktop-to-native-host relay on Windows without activating new extension permissions.

### Changes

Added a capability-authenticated desktop relay over a per-user named pipe, a framed Native Messaging host, a packaged console launcher, exact-origin host manifest generation, and Chrome/Edge/Chromium per-user registration in both registry views. Added a stable extension identity while keeping `nativeMessaging` absent, real socket/framing tests, packaged host smoke, and install/restart/uninstall smoke.

### Files

Contracts and local transport relay/tests; desktop native transport, host entry, launcher, build configuration, main-process integration, and tests; extension identity/service worker; NSIS installer; Windows packaging/smoke scripts; lint generated-output boundary; continuity and state.

### Decisions

Use an application-data-derived per-user named-pipe name plus a local capability file, strip the capability before the browser frame, and run the bundled host through Electron's Node mode behind a small console launcher. Register only the deterministic extension origin. Keep the service worker dormant until explicit permission authorization.

### Verification

`pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 153 Vitest tests, two recoverable workflow E2E tests, two Chromium fixture E2E tests, and all 15 buildable projects. `pnpm.cmd run package:win` and `pnpm.cmd run smoke:packaged:win` passed. `pnpm.cmd run smoke:installed-native-host:win` parsed the installed manifest, verified six registry entries, relayed twice across the packaged host, removed all registrations and payload, and passed.

### Failures encountered

The first installed manifest contained unescaped Windows separators. After switching to forward slashes, the smoke compared equivalent path strings without canonicalization. NSIS then left the smoke-owned install root empty after removing its payload. Lint also scanned an earlier generated packaged bundle.

### Root causes

`$INSTDIR` was interpolated directly into JSON; Windows path separators differed textually; NSIS cannot remove its active install root during uninstall; and the flat ESLint ignores omitted the root artifact directory.

### Fixes

Normalize `$INSTDIR` to forward slashes before writing JSON, compare canonical paths, require the uninstall root to be empty before non-recursive smoke cleanup, and ignore `artifacts/**` in ESLint. Intentionally unignore the three installer source files so clean checkouts can package.

### Security

The host rejects missing/incorrect/expired capabilities, malformed frames, disconnects, timeouts, and mismatched responses. Extension frames contain no capability. Registration contains one exact origin, no wildcard, and no new manifest permission. Logs and errors remain bounded and redacted.

### Commit

`19ccc32dc4fc2d7da8ab183dc7a963654bf97f96` - `feat(transport): install authenticated native host relay`.

### Push

Pushed `main` to `origin`; `HEAD` and `origin/main` matched `19ccc32dc4fc2d7da8ab183dc7a963654bf97f96`. GitHub Actions Verify run `29645472474` passed clean-checkout Linux verification in 1m47s.

### Next action

Request explicit authorization for P6-IPC-004 before adding `nativeMessaging`; independently keep `CODEX-SDK-001` external.

## 2026-07-18 21:00 +07:00 - P3-CODEX-001

### Goal

Replace the blocked live Codex path with a production, read-only, structured runtime that preserves external configuration and has deterministic cancellation and cleanup ownership.

### Changes

Pinned the official Codex SDK for protocol types and bundled binary discovery; added `SdkCodexAdapter`, per-process bundled catalog isolation, structured JSONL lifecycle mapping, persisted-thread resume, bounded failure mapping, exact child cancellation, and runtime disposal. Expanded the live spike to prove start, progress/completion ordering, read-only write blocking, same-thread resume, cancellation, working-directory failure mapping, and cleanup.

### Files

`packages/codex-adapter` production adapter and tests, live spike, lockfile, architecture/security/feasibility records, continuity files, and machine-readable state.

### Decisions

Keep `@openai/codex-sdk` pinned at `0.144.5` for official types and bundled runtime discovery, but own `codex exec --experimental-json` directly because SDK generator cancellation did not provide reliable Windows child ownership. Export only the bundled model catalog to a temporary restricted path and select it with a per-process override. Never edit external Codex configuration or credentials. Keep `MockCodexAdapter` fixture-only.

### Verification

Targeted adapter lint, strict type-check, and 12 lifecycle tests passed. `pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 159 Vitest tests, two workflow E2E tests, two Chromium E2E tests, and all 15 workspace builds. `pnpm.cmd run test:codex-spike` passed live start/lifecycle/read-only/resume/cancellation/failure acceptance.

### Failures encountered

The original SDK path failed before `thread.started` with `supports_reasoning_summaries` missing from an inherited external model catalog. Diagnostic cancellation also left generated temporary catalog directories after manually terminated runs; the environment policy rejected both recursive and exact non-recursive cleanup commands. The first full gate found a continuity test that still hard-coded `CODEX-SDK-001` as active. The first post-hardening live rerun produced correct lifecycle evidence but exited with code 13 because disposal awaited a cancelled task whose readline loop remained open.

### Root causes

The external catalog schema was incompatible with the bundled runtime, and SDK-level streamed cancellation did not provide sufficiently deterministic Windows process ownership for this adapter boundary.

### Fixes

Use the SDK-bundled catalog through an isolated process override, own child stdio and termination directly, close the JSONL readline interface during abort, await cancelled child work before deleting runtime state, redact failures, and update the continuity assertion to require the sole remaining blocker `EXT-PERM-001`. The stale directories were validated to contain only generated `models.json` files but remain in `%TEMP%` because deletion was policy-blocked; normal successful adapter disposal cleans its own runtime directory.

### Security

Every production turn forces read-only sandboxing, approval policy `never`, disabled network/web search, an exact working directory, bounded stderr, redacted stable errors, and mode-restricted temporary catalog storage. No external configuration, authentication, or repository file was modified by the live acceptance run.

### Commit

Resolve with `git log -1 --grep "feat(codex): isolate production runtime lifecycle"`.

### Push

Publish `main` to `origin`, fetch, and require `HEAD` to equal `origin/main`.

### Next action

Stop at `EXT-PERM-001` and request explicit authorization before adding `nativeMessaging` for P6-IPC-004.

## 2026-07-18 23:08 +07:00 - P6-IPC-004

### Goal

Activate the explicitly authorized Native Messaging permission and prepare a safe, repeatable installed ChatGPT acceptance harness without claiming the browser path before it runs.

### Changes

Added `nativeMessaging` to the exact-scope extension manifest, changed desktop and release metadata to report the permission active, and added an installed ChatGPT smoke command. The harness checks bridge health, inspects a user-selected ChatGPT page, refuses unsupported/read-only/non-empty composers, captures only redacted message-count and snapshot-hash evidence, inserts a generated marker with `sent: false`, and clears only the exact matching hash.

### Files

Extension manifest and boundary tests; desktop permission status; Windows release metadata; installed ChatGPT smoke harness and integration tests; architecture, security, continuity, release checklist, and machine-readable state.

### Decisions

Treat permission activation and live browser evidence as separate proof layers. Never overwrite an existing draft, never submit the ChatGPT form, never print conversation titles/messages/IDs, and never use host-only or fixture evidence to claim a browser-owned native port.

### Verification

Targeted manifest, extension bridge/executor, desktop relay, and smoke-harness verification passed with 16 tests. `pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 162 Vitest tests, two workflow E2E tests, two Chromium E2E tests, and all 15 workspace builds. `package:win`, packaged smoke, and installed native-host smoke passed; release metadata reports `permissionActive: true`.

### Failures encountered

Computer Use enumerated the single running Edge window, then stopped before any browser action because it could not determine the current browser URL with enough confidence to enforce policy.

### Root causes

The remaining failure is a Windows browser URL-confidence policy stop, not a repository, extension, installer, registry, or native-host transport defect.

### Fixes

Recorded `BROWSER-LIVE-001`, preserved a manual/action-time-confirmed extension-loading path, and created P6-IPC-005 for the real health/capture/insert/clear acceptance.

### Security

The manifest adds only `nativeMessaging`; host access remains exactly `https://chatgpt.com/*` with no `<all_urls>`. The host still accepts one fixed extension origin, the desktop capability never crosses into the browser, the smoke does not submit or expose rendered content, and no browser profile storage, cookies, tokens, or credentials were read.

### Commit

Resolve with `git log -1 --grep "feat(transport): activate authorized native messaging"`.

### Push

Publish `main` to `origin`, fetch, and require `HEAD` to equal `origin/main`.

### Next action

With action-time confirmation, load `apps/chatgpt-extension/dist` into Edge, open an authenticated ChatGPT tab with an empty composer, run `pnpm.cmd run smoke:installed-chatgpt:win`, and complete P6-IPC-005 only if the redacted no-submit smoke passes.

## 2026-07-19 00:17 +07:00 - P6-IPC-005

### Goal

Prove the installed Edge Native Messaging path end to end and close every runtime defect discovered by the real browser gate without reading browser credentials, profile storage, or rendered conversation content.

### Changes

Fixed the Electron ESM bundle boundary, rebuilt native SQLite against a supported Electron ABI, packaged the required native runtime bindings, and strengthened packaged smoke to require actual bridge initialization. Added MV3 content-ready wake recovery, one-time content-script injection for pre-existing tabs, consistent ChatGPT Project conversation URL parsing, and valid zero-message snapshots for new-chat pages while retaining strict missing-message failure for identified conversations. Added operation-specific redacted smoke errors.

### Files

Desktop build/runtime configuration and startup diagnostics; packaged Windows smoke and electron-builder wrapper; extension capture, content script, service worker, operation routing, tests, lockfile; architecture, security, research, release checklist, continuity records, and machine-readable state.

### Decisions

Use Electron 42 because `better-sqlite3 12.11.1` publishes an official Windows Electron ABI 146 binary but not Electron 43 ABI 148. Keep remote debugging disabled because Microsoft requires restarting Edge with a debug port, which would expose the authenticated profile to a local debugging endpoint. Wake MV3 through a fixed data-free content message rather than browser-profile manipulation or a broader `management` permission.

### Verification

The live installed Edge smoke passed with `health: ready`, `pageMode: new`, `capturedMessages: 0`, a SHA-256 snapshot hash, `composerInserted: true`, `composerSent: false`, and `composerCleared: true`. Targeted extension and smoke tests passed. `pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 164 Vitest tests, two workflow E2E tests, two Chromium E2E tests, and all 15 workspace builds.

### Failures encountered

The prior packaged smoke accepted an Electron shell process after the main bundle had already failed. The main bundle incorrectly embedded Electron CommonJS into ESM, native SQLite used the Node ABI instead of Electron ABI, pnpm transitive packaging omitted `bindings`, old ChatGPT tabs lacked content receivers, project conversation URLs were parsed inconsistently, MV3 did not wake after browser restart, and new-chat capture rejected the valid empty state.

### Root causes

The release gate checked process survival instead of application readiness; Electron 43 had no matching prebuilt `better-sqlite3` binary; electron-builder's pnpm traversal did not retain every native runtime dependency; extension lifecycle assumptions treated service workers as eager; and page identity logic was duplicated with different URL rules.

### Fixes

Externalize Electron from tsup, use the supported Electron ABI, invoke electron-builder without the non-executable pnpm `.mjs` path, declare native runtime dependencies at the app boundary, isolate packaged smoke app data, capture startup stderr, stop the exact test process tree, retry only missing content receivers, unify conversation path parsing, wake the worker from allowlisted ChatGPT content, and distinguish new-chat empty snapshots from broken existing-conversation capture.

### Security

No new permission was added. Host access remains exactly `https://chatgpt.com/*`; the native host still allows only `chrome-extension://ccchffnkidpolmnnlonbnakjjmphfdjp/`. The live output contained count/hash/status only, insertion was never submitted, cleanup required the exact hash, and no cookie, token, browser history, profile database, conversation title, message text, or conversation ID was read or printed.

### Commit

Resolve with `git log -1 --grep "fix(release): complete installed browser acceptance"`.

### Push

Publish `main` to `origin`, fetch, and require `HEAD` to equal `origin/main`.

### Next action

Confirm the published GitHub Actions Verify run is green, then begin only explicitly scoped post-MVP maintenance or release work.

## 2026-07-19 01:00 +07:00 - P17-BETA-001

### Goal

Move the published technical MVP to Internal Beta Ready with a repeatable UAT gate, safe Windows artifact staging, complete team guidance, and accurate continuity without disrupting the active Edge/native-host installation.

### Changes

Added a composite internal-beta UAT command, nine user guides, and an ignored staging-manifest generator with SHA-256 output. Fixed the release toolchain so electron-builder restores the Node-compatible `better-sqlite3` binary after rebuilding it for Electron. Added a regression check that loads SQLite under the active Node runtime after release tooling.

### Verification

`pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 165 Vitest tests, two workflow E2E tests, two Chromium E2E tests, and all 15 buildable workspace projects. `pnpm.cmd run test:internal-beta-uat` passed 43 targeted workflow/context/approval/routing/recovery cases and two Chromium fixture flows. `pnpm.cmd run package:win`, packaged desktop/native-host smoke, post-package Node ABI tests, and three non-destructive installed native-host relay runs passed. The staging manifest reports the unsigned installer, unpacked app, native host, extension ZIP, release manifest, sizes, and SHA-256 values.

### Failure and root cause

The first full verification after a frozen install failed 61 SQLite-dependent tests because a prior electron-builder run had replaced the shared Node ABI 137 native binary with Electron ABI 146. A plain pnpm rebuild did not restore it; the successful recovery required running `prebuild-install` from the actual `better-sqlite3` package directory. The first wrapper fix also exposed cwd-dependent paths when invoked from `apps/desktop`.

### Fix

Resolve electron-builder and dependency paths from `import.meta.dirname` and pnpm package resolution, always run the Node native-runtime restorer after builder completion, verify the binding by opening an in-memory database, and fail packaging if restoration cannot be proven.

### Security and limitations

No permission, submission behavior, browser profile, credential, or public distribution path changed. The active Edge session, installed app, native-host registration, and user data were not modified. Live Edge smoke remains previously accepted and was not rerun this session; destructive clean-install smoke was not rerun because the app is installed and active. Artifacts remain unsigned and ignored by Git; no public GitHub Release or store publication was created.

### Next action

Publish the Internal Beta Ready checkpoint, require final GitHub Actions Verify success, then distribute the checksum-verified build only to a small internal group.

## 2026-07-19 02:01 +07:00 - P17-BETA-002

### Goal

Exercise the desktop UI from the beginning with real keyboard/click input, fix runtime defects, and repeat the acceptance pass until the isolated fixture is clean.

### Changes

Fixed packaged Electron preload parity by emitting/loading `preload.cjs`; retained relative Vite assets, bundled sandboxed preload contracts, Git-root validation, and a picker timeout exception. The acceptance harness can now target the packaged executable through `CODEX_CONTEXT_BRIDGE_ACCEPTANCE_EXECUTABLE`.

### Verification

Computer Use observed the packaged window with a rendered workspace instead of a white screen. The packaged Playwright acceptance run recorded 12 initial interactive nodes and 7/7 passing checks (project creation, invalid/valid repository preview, mapping confirmation, alias, workflow start/cancel, and diagnostics refresh) under `artifacts/ui-acceptance/2026-07-18T18-59-16-216Z/`. Full `pnpm.cmd run verify` passed with 169 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all 15 workspace builds. Internal-beta UAT passed 43 targeted tests plus two Chromium flows. Windows packaging and packaged smoke passed.

### Failures encountered

The first packaged launch was blank because an ESM package interpreted the CommonJS preload emitted as `.js`. A separate dev-harness attempt exposed the expected Node/Electron SQLite ABI mismatch after packaging; the repository's package-and-restore path was used, and the final packaged acceptance avoided the shared ABI boundary.

### Security and limitations

Only temporary Git fixtures and temporary app data were used. No user project, browser profile, cookies, tokens, credentials, Edge session, or destructive archive action was touched. Live Edge and clean-install smoke remain intentionally excluded from this checkpoint.

### Next action

Fetch, verify ancestry, commit the accepted checkpoint, push `main`, confirm `HEAD == origin/main`, and monitor the final GitHub Actions Verify run.

## 2026-07-19 13:47 +07:00 - P18-PILOT-001 implementation checkpoint

### Goal

Wire the desktop Live Project Pilot without claiming authenticated live execution.

### Changes

Added shared strict pilot contracts, main-process typed orchestration and SQLite persistence, refreshable production Codex completion projection, explicit ChatGPT/Codex approval controls, static website verification, and a sandboxed preview BrowserWindow. Renderer mocks and focused IPC, persistence, UI, and verifier tests were added.

### Verification

`pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 190 Vitest tests, two recoverable workflow fixture tests, two Chromium fixture tests, and all 15 workspace builds. Published as `13ddbd4` after fetch/ancestry verification; `HEAD == origin/main`.

### Security and limitations

The renderer receives only typed, schema-validated views; approval tokens, database handles, audit details, credentials, cookies, tokens, and browser history remain outside the renderer. Website verification is local and fail-closed. No live ChatGPT submit, structured response, writable Codex run, website generation, or restart acceptance has been claimed.

### Next action

Add `test:project-pilot`, packaged UI/restart evidence, and then attempt the authenticated path only if a safe user-opened ChatGPT destination is available.

## 2026-07-19 13:56 +07:00 - P18-PILOT-001 fixture checkpoint

### Goal

Prove the complete reviewed pilot orchestration in a deterministic fixture without calling it live evidence.

### Changes

Added `test:project-pilot`, a full fixture flow using the typed pilot service, fixture ChatGPT transport, mock Codex lifecycle, temporary repository files, website verification, and persisted reload. The fixture exposed and removed a premature duplicate `sent_to_chatgpt` transition; durable effect acknowledgement remains the sole state transition owner.

### Verification

`pnpm.cmd run test:project-pilot` passed. The subsequent full `pnpm.cmd run verify` passed formatting, lint, strict type-check, 191 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds. Published as `960e566`; `HEAD == origin/main` after push.

### Security and limitations

Fixture evidence is explicitly not live evidence. No browser credentials, cookies, tokens, history, profiles, private APIs, or real user repository writes were used.

### Next action

Run packaged pilot UI/restart acceptance, then determine whether a safe authenticated live destination is available.

## 2026-07-19 14:36 +07:00 - P18-PILOT-001 packaged restart checkpoint

### Goal

Prove that the packaged Codex runtime starts from its Electron ASAR layout and that a persisted terminal pilot remains readable after the desktop process restarts.

### Changes

Pinned the Codex runtime and Windows platform package in the desktop application, translated dependency executable paths from `app.asar` to `app.asar.unpacked`, rebuilt workspace dependencies before Windows packaging, awaited Codex disposal before closing SQLite, and stopped terminal pilot refresh from querying process-local run handles. Added a packaged restart acceptance script and regression coverage for each boundary.

### Verification

Targeted regression tests passed 19 cases. `pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 195 Vitest tests, two recoverable workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds. Internal-beta UAT passed 46 targeted tests plus two Chromium flows, and the live read-only Codex spike passed start, resume, cancellation, sandbox, and failure mapping. `pnpm.cmd run package:win` and `pnpm.cmd run smoke:packaged:win` passed. `pnpm.cmd run test:pilot-packaged-restart` launched the packaged executable twice, restored a fixture-only `codex_completed` pilot, displayed its persisted final response, and recorded zero renderer runtime errors under `artifacts/pilot-restart-acceptance/2026-07-19T07-34-45-337Z/`.

### Security and limitations

The acceptance used temporary app data and a temporary Git repository, did not connect to ChatGPT, did not run writable production Codex, and did not touch browser credentials, profiles, cookies, tokens, history, user repositories, or the active installed application. The evidence remains explicitly fixture-only.

### Next action

Confirm whether a safe user-opened authenticated ChatGPT destination with an empty composer is available. If it is, run one bounded temporary-repository live pilot with explicit approvals; otherwise record the external blocker without substituting fixture evidence.

## 2026-07-19 14:56 +07:00 - P18-PILOT-001 current-conversation checkpoint

### Goal

Remove manual ChatGPT conversation-ID entry from the live pilot while preserving exact destination identity and the explicit approval boundary.

### Changes

Added a create-only `current` destination mode. The main process now requires connected Native Messaging, inspects the user-opened page, accepts only an identified existing conversation, records composer/streaming state, and persists the resolved exact existing-thread destination. The renderer exposes `Conversation đang mở`; persisted pilot views continue to allow only `new` or exact `existing` destinations.

### Verification

Targeted pilot IPC/UI tests passed 9 cases. `pnpm.cmd run verify` passed formatting, lint, strict type-check, 197 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds. Windows packaging, packaged smoke, and packaged restart acceptance passed. The installed ChatGPT no-submit smoke returned `health: ready`, `pageMode: existing`, two hashed captured messages, `composerSent: false`, and exact composer cleanup. A reviewed handoff was prepared for a temporary repository with payload hash `75cae5042832…428bae39`.

### Security and limitations

No browser profile, cookies, tokens, authorization headers, history, credentials, or private API was read. Conversation identity crossed only the validated Native Messaging/main-process boundary. The prepared payload was not submitted; action-time confirmation is still mandatory before representational communication to ChatGPT.

### Next action

After publication, ask the user to confirm sending reviewed payload `75cae5042832…428bae39`. Submit exactly once only after confirmation, wait for rendered acknowledgement and a schema-valid structured response, then stop again for the separate Codex workspace-write approval.

## 2026-07-19 16:11 +07:00 - P18-PILOT-001 ChatGPT startup recovery checkpoint

### Goal

Open or recover the persisted ChatGPT destination when the desktop starts without repeating an ambiguous external send.

### Changes

Added a strict `page.reload` contract and MV3 content-script acknowledgement that schedules `location.reload()` only after the service worker selects the exact ChatGPT destination. Added bounded main-process recovery that inspects, reloads once, opens only an allowlisted ChatGPT URL, retries with delays, and audits redacted action outcomes. Pilot inspection and approval recover the page before approval consumption. Persisted orphaned `dispatching` effects now restore as `chatgpt_confirmation_required` and are never resent.

### Verification

Targeted recovery/extension/contracts/pilot/integration tests passed: 36 tests. The source package was rebuilt in an isolated worktree because the current Codex runtime held the Node SQLite binary lock; `pnpm.cmd run package:win` and `pnpm.cmd run smoke:packaged:win` passed there, the resulting artifacts were hash-verified after synchronization, and the workspace packaged/native-host smoke passed. Launching the rebuilt artifact against normal app data displayed pilot `8ec5d3b7` as `Cần xác nhận lần gửi` through the renderer, with no resend or submit. `pnpm.cmd run verify` then passed migration parity, formatting, lint, strict type-check, 206 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds.

### Security and limitations

Recovery reads only rendered page inspection through the validated Native Messaging boundary. It does not read cookies, tokens, authorization headers, history, browser storage, or conversation content for routing. Startup never submits a message. The reviewed payload remains ambiguous and requires action-time user confirmation before any representational ChatGPT send.

### Next action

Publish this checkpoint, then ask for action-time confirmation before resolving the existing ambiguous ChatGPT effect.

## 2026-07-19 - Chat history archive MVP checkpoint

Implemented exact rendered ChatGPT conversation archiving for the selected Live Project Pilot. The extension now routes `conversation.capture` to an optional exact destination and long capture restores the user's original scroll position. The desktop main process recomputes content hashes, persists immutable revisions and ordered messages in the existing SQLite archive tables, rejects unsafe bounds, auto-syncs exact existing conversations every 30 seconds, and exports all selected-project revisions as lossless JSON through the main-process save dialog. Renderer responses contain archive summaries only.

Verification: `pnpm.cmd run format:check`, `pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test` (214 tests), `pnpm.cmd run test:e2e` (2 Chromium tests), `pnpm.cmd run test:internal-beta-uat` (46 tests + 2 Chromium tests), `pnpm.cmd run build`, `pnpm.cmd run package:win`, `pnpm.cmd run smoke:packaged:win`, and `pnpm.cmd run test:pilot-packaged-restart` passed. Targeted archive/capture/pilot tests passed 32 cases.

Security: no cookies, tokens, authorization headers, browser history, browser storage, private APIs, or raw filesystem/database handles cross into the renderer. Auto-sync is bounded and best-effort; new-chat destinations and streaming pages are not archived automatically. Authenticated ChatGPT submission and writable Codex execution remain separately approval-gated.

## 2026-07-20 - Canonical ChatGPT destination recovery checkpoint

### Goal

Stop a persisted ChatGPT conversation from silently degrading into the home/new-chat page and remove Windows screen state from production routing decisions.

### Root cause

The extension could inspect an unrelated active ChatGPT tab because `page.inspect` had no destination. Pilots stored only a conversation ID, so recovery reconstructed `/c/<id>` and lost an observed ChatGPT Project route such as `/g/<project>/c/<id>`. When ChatGPT redirected an inaccessible conversation to home, the bounded recovery ended with the generic `CHATGPT_NOT_READY` code.

### Changes

Added validated optional canonical conversation paths to the shared destination/page contracts, persisted the rendered path for current pilots, and let legacy pilots retain it after successful exact inspection or archive sync. Inspection, streaming, capture, submit confirmation, and response status now carry the exact destination. Recovery reopens the canonical project path, ignores unrelated active tabs, and reports `CHATGPT_CONVERSATION_UNAVAILABLE` when a connected exact conversation cannot be restored. The renderer explains how to open the correct account/workspace conversation and re-inspect. ADR-0002 records that structured Codex/Native Messaging surfaces are production boundaries and screen control is diagnostic only.

### Verification

Targeted regression tests passed 70 cases. `pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 219 tests, two workflow fixture tests, two Chromium tests, and all workspace builds. `pnpm.cmd run test:internal-beta-uat` passed 46 tests plus two Chromium tests. Windows packaging, packaged/native-host smoke, and `pnpm.cmd run test:pilot-packaged-restart` passed; restart artifact `artifacts/pilot-restart-acceptance/2026-07-19T18-10-31-089Z/` reported zero runtime errors.

### Security and limitations

No browser profile, cookies, tokens, authorization headers, history, storage, private API, or screen-derived identity was used. Recovery remains bounded and never submits. A live authenticated check of the user's unavailable conversation was not claimed because Windows Computer Use could not verify the active Edge URL; the new deterministic behavior is covered by the Native Messaging boundary and packaged fixtures.

## 2026-07-20 - Multi-connection catalog and safe Codex ZIP checkpoint

### Goal

Let the user select rendered ChatGPT conversations and verified Codex projects/threads, keep several independent connections active, and preserve complete Codex output plus changed files without weakening the file or browser trust boundaries.

### Changes

Added a bounded MV3 rendered-sidebar discovery operation that preserves canonical project conversation paths and never reads account APIs or browser state. Added typed desktop catalogs for Codex projects, repositories, and persisted thread mappings; the Vietnamese workspace expands/collapses projects, shows five threads initially, reveals five more per action, and binds each SQLite pilot to a new or existing Codex thread. Active pilots poll completion independently and startup recovery handles up to eight unique exact ChatGPT destinations.

Before approved Codex dispatch, the main process records Git HEAD plus dirty-file fingerprints. Completion compares new commits and working-tree changes, revalidates every candidate through canonical path, symlink, exclusion, size, binary, and secret checks, and creates an audited ZIP containing the complete Codex report, manifest, and accepted files. Deleted or blocked files are manifest-only. The renderer can reveal the ZIP for explicit review and attachment.

### Defect and fix

The first packaged build stayed alive without initializing the bridge. An Electron-as-Node reproduction proved `archiver` was present in `app.asar` but its transitive `readdir-glob` dependency was missing under the pnpm/electron-builder layout. Replaced it with dependency-free `fflate` and added a packaged ZIP-runtime preflight before launch. Packaged smoke then passed.

### Verification

`pnpm.cmd run verify` passed migration parity, formatting, lint, strict type-check, 228 Vitest tests, two workflow fixture E2E tests, two Chromium tests, and all workspace builds. `pnpm.cmd run test:internal-beta-uat` passed 46 tests plus two Chromium tests. `pnpm.cmd run package:win`, `pnpm.cmd run smoke:packaged:win`, and `pnpm.cmd run test:pilot-packaged-restart` passed; restart artifact `artifacts/pilot-restart-acceptance/2026-07-19T18-50-24-800Z/` reported zero runtime errors. Installed-host smoke stopped before modification because an existing user Registry64 registration was detected.

### Security and limitations

Discovery is rendered-DOM-only and capped at 200 links. ZIP creation is local, audited, secret-safe, and explicitly reviewed. Automatic browser file upload remains unimplemented because a safe size-bounded production file-input boundary has not been accepted. No authenticated ChatGPT submit or writable live Codex run is claimed by this checkpoint.

## 2026-07-20 - Redirect-loop and automatic Codex project discovery fix

### Goal

Stop ChatGPT archive synchronization from opening a new tab on every failed recovery attempt, and make Codex projects selectable without manual project entry.

### Changes

Added an explicit `allowOpenExternal` recovery option. Background `syncChatHistory` uses the no-open mode, while startup recovery is capped to one destination. Redirected exact conversations now fail with a stable unavailable status instead of causing tab fan-out.

Added `codex-local-catalog.ts`, which reads only bounded, non-symlink Codex metadata files, extracts project/root/thread metadata, validates Git roots in the main process, and projects safe mappings into the registry. The pilot now refreshes this catalog automatically (10-second throttle) and exposes a primary `Đồng bộ project Codex` button; projects remain collapsible with five-thread expansion.

### Verification

The targeted recovery/catalog/IPC/renderer suite passed 30 tests. `pnpm.cmd run verify` passed 232 Vitest tests, two workflow fixture tests, two Chromium fixture tests, and all workspace builds. `pnpm.cmd run package:win` and `pnpm.cmd run smoke:packaged:win` passed after closing the previously running unpacked app; the rebuilt packaged app was reopened and visibly displayed the local Codex project tree.

### Security and limitations

No browser profile, cookies, tokens, credentials, prompt bodies, or private APIs were read. Local Codex discovery is metadata-only and fails closed for invalid roots/files. Automatic browser ZIP upload remains unimplemented; ZIP reveal and attachment stay explicit.

### Next action

Publish this checkpoint. The separate live pilot remains paused for action-time confirmation of payload `75cae5042832…428bae39`; after any confirmed ChatGPT send, stop again for the independent Codex workspace-write approval.
