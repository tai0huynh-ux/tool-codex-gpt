# Project Status

## Current phase

Live Vertical Slice In Progress. P18-CODEX-001 and the first P18-PILOT-001 implementation checkpoint are published; authenticated live execution remains separately gated.

## Current objective

Complete the live ChatGPT -> Codex project pilot without weakening the read-only default or claiming fixture evidence as live evidence. Every external send remains explicitly reviewed and approved.

## Last completed checkpoint

P18-PILOT-001 current-conversation checkpoint - Resolve the user-opened ChatGPT conversation through Native Messaging in the main process, persist its exact existing-thread destination, and expose a Vietnamese UI option without requiring manual conversation ID entry. Authenticated sending remains explicitly approval-gated.

## Current verified capabilities

- Strict TypeScript monorepo builds on Windows.
- SQLite schema and project registry CRUD pass automated tests.
- Repository fingerprinting distinguishes same-named repositories.
- File traversal, symlink escape, exclusions, and secret fixtures are blocked.
- Handoff validation passes Zod and JSON Schema checks.
- ChatGPT capture fixture passes in jsdom and Chromium.
- Desktop pilot IPC uses shared strict Zod contracts, bounded inputs, trusted-sender validation, audit outcomes, SQLite persistence, and refreshable Codex completion projection.
- Live Project Pilot exposes explicit ChatGPT/Codex approval controls, repository-bound workspace-write profile metadata, structured-response preview, and keyboard-accessible status surfaces.
- Static website verification fails closed on missing/symlinked files, scripts, forms, iframes, external URLs, inline handlers, malformed HTML, or missing required Vietnamese text.
- Website preview uses an isolated sandboxed BrowserWindow with JavaScript, navigation, popups, downloads, permissions, and external protocols blocked.
- `test:project-pilot` runs the complete reviewed fixture flow through ChatGPT acknowledgement, structured response routing, Codex mock lifecycle, website creation, local verification, and persisted reload.
- The packaged desktop resolves the native Codex executable from `app.asar.unpacked`, includes the pinned Windows runtime explicitly, and refreshes all workspace builds before electron-builder runs.
- Electron shutdown waits for Codex runtime disposal before closing SQLite and exiting, preventing cleanup races during packaged restart.
- Terminal pilot views are self-contained in SQLite and restore after restart without querying adapter-local run handles that no longer exist.
- `test:pilot-packaged-restart` launches the packaged executable twice against isolated app data and a temporary Git repository, then proves the persisted terminal Codex report is visible with zero renderer runtime errors. This evidence is fixture-only, not an authenticated ChatGPT or writable Codex run.
- Pilot creation can select `Conversation đang mở`; the main process requires connected Native Messaging, accepts only an identified existing conversation, and persists the resolved destination before any preview or approval is created.
- The live installed ChatGPT no-submit smoke passed with an existing conversation, two hashed captured messages, an empty composer, exact marker insertion/clear, and `composerSent: false`.
- A temporary live pilot is persisted at the reviewed-preview state for the current conversation. Its payload hash is `75cae5042832…428bae39`; no ChatGPT message has been submitted.
- Electron uses context isolation, sandboxing, and no renderer Node integration.
- Desktop startup recovery inspects the persisted exact destination, reloads that tab once when unreadable, opens only the allowlisted ChatGPT URL, and retries with bounded delays while recording redacted audit outcomes.
- Persisted `dispatching` ChatGPT effects are restored as `chatgpt_confirmation_required`; startup recovery never consumes approval or resends an ambiguous effect.
- GitHub Actions runs frozen installation, Chromium fixture E2E, and the full verification gate on Linux with Node.js 24.
- Database runtime SQL is generated from the distributable migration and direct package type-check/build commands reject stale output.
- Codex runs expose replayable ordered start, progress, completion, failure, and cancellation events without allowing terminal-state overwrite.
- The production Codex adapter uses the SDK-bundled binary and a temporary bundled catalog, preserves external configuration, forces read-only/approval-never/network-disabled execution, owns structured JSONL lifecycle and exact cancellation, and cleans temporary runtime state.
- Long conversation capture accumulates virtualized windows, preserves duplicate messages with stable IDs, updates streaming text, and supports abort.
- Composer insertion uses native editing behavior for controlled textareas and contenteditable fields, honors cancellation and read-only state, and never submits automatically.
- Explicit ChatGPT submission is a separate approved operation: it revalidates exact destination, composer hash, streaming/read-only/disabled state, uses a semantic control, and preserves confirmation-required ambiguity.
- Content-script submit effects reserve their ID before asynchronous checks, preventing concurrent duplicate clicks while allowing deterministic pre-click rejection retries.
- Codex execution profiles bind to the approval destination: `read_only` is the default, while `workspace_write_no_network` requires exact registry validation and maps only to workspace-write with network disabled.
- Structured ChatGPT responses use strict paired markers, a 100,000-character default bound, schema validation, handoff/correlation/project checks, and duplicate rejection.
- ADR-0001 selects Native Messaging without opening a LAN listener or silently activating extension permissions.
- The extension manifest explicitly includes the user-authorized `nativeMessaging` permission and activates the fixed-host service worker without adding `<all_urls>`.
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
- Fixture mock lifecycle events advance `codex_running` deterministically; separate live acceptance proves the production adapter.
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
- Packaged and installed native-host smokes prove correlated bidirectional relay, restart behavior, and capability-free extension frames with release metadata reporting the permission active.
- The installed ChatGPT harness refuses existing drafts, captures only count/hash evidence, inserts a generated marker without submit, and clears only the exact matching hash.
- The live Edge smoke passed with `health: ready`, a redacted zero-message new-chat snapshot hash, `composerSent: false`, and exact composer cleanup.
- MV3 recovery no longer depends on manually opening the extension page: an allowlisted ChatGPT content script sends a data-free readiness event that wakes the service worker and reconnects Native Messaging.
- Browser routing recognizes both root conversations and ChatGPT Project URLs containing `/g/.../c/<conversationId>`, while insertions still require an exact conversation identity.
- Windows packaging now proves the Electron main process initialized the bridge, rebuilds a compatible native SQLite binary, packages required runtime bindings, and fails with captured startup diagnostics instead of accepting a surviving shell process.
- Windows packaging restores the Node-compatible SQLite prebuild after electron-builder finishes, so release packaging no longer poisons subsequent Node/Vitest runs.
- `test:internal-beta-uat` composes 43 workflow, context, approval, routing, recovery, and negative-path cases plus two Chromium extension fixture flows.
- The ignored `artifacts/internal-beta` staging set contains a machine-readable manifest, SHA-256 list, installer, unpacked app, native host, extension archive, and exact installation entry point.
- Nine team guides cover Windows/Edge installation, first project setup, capture, Codex handoff, recovery, troubleshooting, updates, and safe uninstall.

## Current known failures

- None in the accepted MVP scope.

## Active blockers

- None.

## Next three actions

1. Obtain action-time user confirmation for the persisted reviewed ChatGPT payload `75cae5042832…428bae39`.
2. After confirmation, submit once, wait for rendered acknowledgement and a validated structured response, then stop again for the separate Codex write approval.
3. Continue through temporary-repository website verification/preview only after each external effect receives its required explicit approval.

## Latest verification

The 16:11 recovery checkpoint supersedes the earlier baseline for this change: 36 targeted tests passed, the rebuilt package and packaged/native-host smoke passed, and the real app-data renderer showed pilot `8ec5d3b7` as confirmation-required without resend.

`pnpm.cmd run verify` passed locally on 2026-07-19 with migration parity, formatting, lint, strict type-check, 197 Vitest tests, two recoverable workflow fixture E2E tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects. Windows packaging, packaged smoke, packaged restart acceptance, and the installed ChatGPT no-submit smoke passed. The current-conversation live preview was prepared against a temporary Git repository and connected Native Messaging, but no authenticated ChatGPT submit, live structured response, writable Codex run, or website generated by production Codex has been claimed.

## Latest commit

## Recovery checkpoint verification

The rebuilt Windows package and packaged/native-host smoke passed. A real app-data renderer inspection displayed pilot `8ec5d3b7` as `Cần xác nhận lần gửi`; no ChatGPT message was resent or submitted. The targeted recovery set passed 36 tests, and `pnpm.cmd run verify` passed with 206 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds.

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Last updated

2026-07-19 14:56 +07:00.
