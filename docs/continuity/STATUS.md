# Project Status

## Current phase

Phase 11 - Assisted ChatGPT sending.

## Current objective

Connect reviewed context-pack previews to the existing ChatGPT composer boundary through the persistent workflow engine.

## Last completed checkpoint

P10-WF-001 - Migration v4, versioned workflow contracts, transactional event/projection transitions, bounded retries and iterations, scoped single-use approval capabilities, idempotent effect journaling, acknowledgement state, and restart recovery without duplicate transfer. Resolve with `git log -1 --grep "feat(workflow): persist recoverable handoff workflows"`.

## Current verified capabilities

- Strict TypeScript monorepo builds on Windows.
- SQLite schema and project registry CRUD pass automated tests.
- Repository fingerprinting distinguishes same-named repositories.
- File traversal, symlink escape, exclusions, and secret fixtures are blocked.
- Handoff validation passes Zod and JSON Schema checks.
- ChatGPT capture fixture passes in jsdom and Chromium.
- Electron uses context isolation, sandboxing, and no renderer Node integration.
- GitHub Actions runs frozen installation, Chromium fixture E2E, and the full verification gate on Linux with Node.js 24.
- Database runtime SQL is generated from the distributable migration and direct package type-check/build commands reject stale output.
- Mock Codex runs expose replayable ordered start, progress, completion, failure, and cancellation events without allowing terminal-state overwrite.
- Long conversation capture accumulates virtualized windows, preserves duplicate messages with stable IDs, updates streaming text, and supports abort.
- Composer insertion uses native editing behavior for controlled textareas and contenteditable fields, honors cancellation and read-only state, and never submits automatically.
- Structured ChatGPT responses use strict paired markers, a 100,000-character default bound, schema validation, handoff/correlation/project checks, and duplicate rejection.
- ADR-0001 selects Native Messaging without opening a LAN listener or silently activating extension permissions.
- Local transport validates versioned operations, capability, expiry, replay, payload size, rate, timeout, correlation, and reconnect behavior.
- Electron preload exposes only allowlisted typed status and operation methods with exact renderer validation and redacted transfer audit events.
- SQLite upgrades existing v1 databases transactionally to mapping schema v2 without losing project data.
- Projects and repositories support archive/restore or archive-only lifecycle, aliases, worktree/branch metadata, fingerprint refresh, ChatGPT sources, and Codex thread registration.
- Mapping confirmations preserve scored evidence, supersede prior active mappings atomically, and retain history.
- Equal-confidence project candidates return explicit ambiguity instead of silently selecting the first match.
- Desktop project data persists in the Electron user-data SQLite database and remains main-process-only.
- The typed preload exposes project list/create/archive/alias/root-picker/preview/confirm operations without raw IPC.
- Repository confidence and evidence are recomputed in the main process; renderer payloads cannot assert trusted evidence.
- The responsive project workspace supports registration, evidence preview, explicit ambiguous-project selection, confirmation, aliases, archive, and persisted reload.
- Context packs validate through matching Zod and published JSON Schema contracts.
- File ranking is stable across repeated builds and prioritizes changes, tests, types, configs, pins, and dependency neighbors while penalizing generated and lock files.
- Context file inspection reuses canonical allowlist, symlink, exclusion, size, and secret safety before hashing content.
- Binary, secret, traversal, escaping-symlink, oversized, duplicate, deleted, and budget-omitted files receive explicit manifest status without unsafe attachment.
- Large text files use line-safe excerpts or supplied diffs; full, excerpt, and token budgets are reported in the pack preview.
- SQLite migration v3 adds memory project isolation, content hashes, supersession links, active duplicate protection, and retrieval indexes without rewriting prior migrations.
- Memory candidates require explicit approval; candidate, rejected/deleted, and superseded records never enter retrieval or bootstrap output.
- Retrieval isolates project/conversation/workflow scopes, merges only requested team and global records, and ranks deterministically by relevance, category, confidence, recency, and ID.
- Memory sources remain attached to every returned record; legacy rows receive deterministic migration provenance.
- Duplicate content is detected per scope/project across history, while supersession preserves the old record and points to the approved replacement.
- New-chat bootstrap includes project identity, goal, architecture, status, blockers, objective, handoff protocol, and approved memories within an exact character budget.
- SQLite migration v4 preserves existing workflow rows while adding limits, recovery state, event actors/payloads, scoped approval fields, and an idempotent effect journal.
- Workflow transitions persist monotonic events, projection updates, and audit records atomically; injected faults prove rollback before projection completion.
- Approval capabilities expire within 15 minutes, are stored only as SHA-256 token hashes, bind workflow/project/operation/destination/payload, and are consumed once in the effect transaction.
- Prepared effects are safe to dispatch once; dispatching effects require confirmation after restart and are never automatically resent; acknowledged and failed effects cannot dispatch again.
- ChatGPT and Codex sends advance workflow state only after acknowledgement, with bounded retry and acknowledged-Codex iteration counters.
- Workflow recovery, approval consumption, effect state, and duplicate prevention persist after reopening SQLite.

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Native Messaging host registration and manifest permission activation are intentionally deferred to the packaging/security gate; no live transport is claimed yet.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Implement `P11-CHAT-001` reviewed existing/new ChatGPT conversation handoff through the composer boundary.
2. Add streaming/cancellation state and explicit clipboard fallback without automatic submit.
3. Bind every attempted send to the P10 approval/effect journal and fixture-test acknowledgement recovery.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: migration parity, 109 Vitest tests, one virtualized Chromium fixture E2E, formatting, lint, strict type-check, and all 13 buildable workspace projects. GitHub Actions run `29640228145` passed for the preceding published checkpoint `0b5d8b0`; P10 CI is pending publication.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 17:19 +07:00.
