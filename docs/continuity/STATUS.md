# Project Status

## Current phase

Phase 6 - Desktop and extension transport.

## Current objective

Choose and implement an authenticated local extension transport with a typed Electron IPC boundary.

## Last completed checkpoint

P5-EXT-001 - Controlled composer insertion and bounded paired-marker response parsing with strict schema, identity, payload, and duplicate validation. Resolve with `git log -1 --grep "fix(extension): harden composer and response parsing"`.

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

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- Authenticated desktop-to-extension transport and typed renderer/main IPC are not yet implemented.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block independent MVP work.

## Next three actions

1. Record an ADR comparing Native Messaging, localhost HTTP, localhost WebSocket, and clipboard fallback.
2. Implement the selected authenticated transport with runtime validation, reconnect, rate, and spoofing defenses.
3. Add a typed allowlisted Electron IPC boundary and its security tests.

## Latest verification

`pnpm.cmd run verify` passed on 2026-07-18: migration parity, 45 Vitest tests, one virtualized Chromium fixture E2E, formatting, lint, strict type-check, and all builds. GitHub Actions run `29637231505` passed for checkpoint `2272682` with no annotations.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 15:28 +07:00.
