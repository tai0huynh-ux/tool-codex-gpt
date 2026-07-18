# Project Status

## Current phase

Phase 6 production transport completion. Phase 3 live Codex acceptance remains externally blocked.

## Current objective

Preserve the completed authenticated native-host relay while keeping permission activation and live user-opened ChatGPT acceptance explicitly authorization-gated.

## Last completed checkpoint

P6-IPC-003 - Package an authenticated desktop-to-native-host relay with exact-origin per-user Windows registration and install/restart/uninstall evidence. Resolve with `git log -1 --grep "feat(transport): install authenticated native host relay"`.

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
- The extension build includes a dormant service worker that activates only when `nativeMessaging` is explicitly present in the manifest.
- Host-forwarded operations are validated without a desktop capability, replay/expiry/oversize are rejected before DOM execution, and existing-conversation inserts require an exact URL identity.
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
- Assisted ChatGPT previews bind workflow/project/handoff/correlation/destination and exact rendered text hashes; mutation after review is rejected before approval or transfer.
- Existing conversations require an exact URL conversation ID; new-chat sends may acknowledge only after the page transitions to a captured conversation containing the matching user message.
- Composer insertion validates the P10 effect/payload hash, reports `sent: false`, never submits the form, and cannot repeat while an effect is `dispatching`.
- Clipboard delivery is an explicit user-selected fallback; ambiguous adapter failures remain `confirmation_required` rather than being retried.
- Streaming responses defer acknowledgement; capture advances the workflow only after streaming stops and the latest rendered user message matches the approved payload.
- Polling cancellation preserves recovery state, while explicit transfer cancellation clears composer text only when its hash still matches before marking the effect failed.
- SQLite migration v5 persists one response receipt per handoff and workflow/hash, so duplicate ChatGPT responses remain blocked after restart.
- Response routing revalidates schema, handoff, correlation, project, workflow state, prompt hash, receipt hash, destination repository, and thread identity before dispatch.
- Existing Codex threads resume only through persisted project/fingerprint mappings; new threads persist their mapping; new-worktree routes require an explicit provider.
- Codex prompt approval and preparation use P10 single-use capabilities and iteration limits; ambiguous adapter failures remain `dispatching` and are never retried automatically.
- Mock lifecycle events advance `codex_running` to completed/failed/cancelled states, but do not satisfy the active live SDK blocker.
- Desktop workflow data is reconstructed in the main process from persisted runs, ordered events, recovery effects, approval metadata, and redacted audit outcomes.
- Renderer actions create, refresh, and cancel workflows only through validated typed preload IPC; approval tokens, database handles, and audit details never cross the boundary.
- The responsive workflow deck exposes textual state badges, keyboard-native controls, event timelines, iteration/retry limits, and explicit recovery status without claiming that review-only states were sent.
- `test:workflow-e2e` composes the real SQLite, project registry, workflow engine, assisted ChatGPT service, response router, and mock Codex adapter across a close/reopen boundary.
- The golden fixture proves both sends are acknowledged once, the response receipt and thread mapping persist, and repeated ChatGPT or Codex dispatch attempts are rejected.
- The recovery fixture proves a transport-loss effect remains `dispatching` after restart, is surfaced as `confirmation_required`, and is not inserted again.
- Workflow IPC rejects oversized identifiers and unknown fields before service execution.
- Renderer workflow responses expose approval scope and audit outcome only; approval token hashes and audit detail payloads are excluded and regression-tested.
- Windows packaging produces an unsigned NSIS x64 installer, blockmap, extension ZIP, and SHA-256 release manifest under ignored `artifacts/`.
- A versioned SQLite copy is created before an existing desktop database is opened for migration; the first recovery point is not overwritten.
- Packaged smoke passed for unpacked launch and silent install/clean-profile launch/silent uninstall; the manifest explicitly reports `NotSigned`.
- Diagnostic export contains platform, Git, phase, blocker, and verification identity only; it does not read environment variables or database/chat/file content.
- Desktop requests reach the native host over a per-user named pipe authenticated by a local capability that is stripped before the browser boundary.
- The packaged console launcher runs the bundled native host through Electron's Node mode and preserves framed stdin/stdout without exposing a listening network socket.
- Windows installation writes one exact extension origin and registers Chrome, Edge, and Chromium in both per-user registry views; silent uninstall removes every registration and installed payload.
- Packaged and installed native-host smokes prove correlated bidirectional relay, restart behavior, and capability-free extension frames while `nativeMessaging` remains absent.

## Current known failures

- Live Codex SDK spike exits before `thread.started` because the configured external model catalog is incompatible with SDK `0.144.5`.
- The `nativeMessaging` extension permission remains intentionally inactive; no live transport is claimed.

## Active blockers

- `CODEX-SDK-001` blocks live Codex acceptance but does not block the remaining Native Messaging implementation.

## Next three actions

1. Request explicit authorization before adding the `nativeMessaging` permission for P6-IPC-004.
2. After authorization, run the installed user-opened ChatGPT health/capture/assisted-insert smoke with redacted evidence.
3. Independently resolve `CODEX-SDK-001` externally without editing the user's Codex configuration.

## Latest verification

`pnpm.cmd run verify` passed locally on 2026-07-18 for P6-IPC-003: migration parity, formatting, lint, strict type-check, 153 Vitest tests, two recoverable workflow fixture E2E tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects. `package:win`, unpacked/package native smoke, and installed native-host smoke passed; the installed host relayed twice, all six per-user registry registrations matched, and uninstall removed registrations and payload. GitHub Actions Verify run `29645472474` passed in 1m47s for commit `19ccc32`.

## Latest commit

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-18 19:59 +07:00.
