# Project Status

## Current phase

Phase 7 - Project mapping.

## Current objective

Build the project registration and ambiguity-confirmation UI on the verified mapping persistence layer.

## Last completed checkpoint

P7-DATA-001 - Versioned mapping migration, non-destructive project/repository registry, worktree metadata, aliases, and confirmation history. Resolve with `git log -1 --grep "feat(projects): add mapping persistence"`.

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

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Native Messaging host registration and manifest permission activation are intentionally deferred to the packaging/security gate; no live transport is claimed yet.
- Project registration and ambiguity confirmation are not yet exposed through the desktop UI.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Add typed project-registry IPC backed by the local SQLite database.
2. Build project list/detail and repository registration forms with clear ambiguity evidence.
3. Add renderer tests and an Electron project-flow smoke fixture.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: migration parity, 63 Vitest tests, one virtualized Chromium fixture E2E, formatting, lint, strict type-check, and all builds. GitHub Actions run `29638214032` passed for checkpoint `fa5d4e9` with no annotations.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 16:07 +07:00.
