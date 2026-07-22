# Project Status

## Current phase

Live Vertical Slice In Progress. P18-CODEX-001 and the first P18-PILOT-001 implementation checkpoint are published; authenticated live execution remains separately gated.

## Current objective

Complete the live ChatGPT -> Codex project pilot without weakening the read-only default or claiming fixture evidence as live evidence. Every external send remains explicitly reviewed and approved.

## Last completed checkpoint

P18-PILOT-001 multi-connection catalog and safe bundle checkpoint - Discover only rendered ChatGPT sidebar conversations, list verified Codex projects/thread mappings with five-item expansion, persist independent connection tabs, detect terminal ChatGPT/Codex states, and create an audited secret-safe ZIP of Codex reports and changed files. Local ZIP attachment remains explicit; authenticated sending remains separately approval-gated.

Redirect-loop/local-catalog hardening is now included in this checkpoint: background ChatGPT sync cannot open tabs, and the primary Codex picker discovers local projects automatically.

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
- Rendered ChatGPT sidebar discovery preserves `/g/.../c/...` paths, queries up to 16 eligible open ChatGPT tabs concurrently with two-second per-tab bounds, merges by canonical path, caps output at 200 conversations, reports truncation, and never reads account APIs, browser profiles, storage, history, cookies, or tokens.
- The pilot workspace lists Codex projects with collapsible verified thread mappings, shows five threads initially, reveals five more per action, displays persisted Codex thread titles, and lets each persisted pilot bind an exact ChatGPT conversation to either a new or existing Codex thread.
- Multiple active pilots poll terminal state independently; startup recovery opens up to eight unique persisted ChatGPT destinations without using Windows screen state as identity.
- Approved Codex runs capture a main-process Git baseline and terminal completion creates an audited ZIP containing the full report, manifest, and only path/symlink/exclusion/size/binary/secret-safe changed files. Deleted and blocked files remain manifest-only.
- Packaged smoke now preflights the ZIP runtime inside `app.asar`; the regression caught and removed an `archiver` transitive-dependency packaging failure before acceptance.
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
- SQLite migration v6 persists bounded Codex thread display titles without changing thread identity or routing fields.
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
- Existing destinations now retain the canonical rendered pathname, destination-bound inspect/status/capture operations ignore unrelated active tabs, and a connected redirect to ChatGPT home fails closed as `CHATGPT_CONVERSATION_UNAVAILABLE` with recovery guidance in the renderer.
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

The canonical destination checkpoint supersedes the earlier baseline: 70 targeted tests passed; `pnpm.cmd run verify` passed 219 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds; internal-beta UAT, Windows packaging, packaged/native-host smoke, and fixture-only packaged restart acceptance also passed.

## 2026-07-22 compatibility/catalog checkpoint

- Shared ChatGPT path parsing now rejects `/library`, `/projects`, `/scheduled`, and `/plugins`; root and Project conversation paths remain valid.
- Legacy rendered catalogs are normalized before schema validation: UI navigation links are dropped, query/hash decorations are removed, and `conversationId` is derived from the canonical pathname.
- Native health accepts old extension requests but reports `EXTENSION_LEGACY_COMPATIBILITY` instead of hiding a stale service worker.
- Packaging supports `CODEX_CONTEXT_BRIDGE_DESKTOP_ARTIFACT_ROOT` so a locked prior unpacked artifact can be left untouched while a fresh package is produced.
- Verification: format, lint, strict typecheck, 246 Vitest tests, 2 workflow fixture E2E, 2 Chromium fixture E2E, workspace build, unsigned NSIS package, packaged smoke, native-host smoke, and fixture-only packaged restart acceptance all passed.
- Remaining live step: reload the current unpacked Edge extension and open ChatGPT tabs; no authenticated submit or Codex write has been performed.

## Chat history archive MVP checkpoint

- Exact existing ChatGPT conversations can be archived from rendered DOM snapshots into SQLite; duplicate content hashes create no duplicate revision, updated content creates a new immutable revision, and exports remain isolated to the selected project.
- The Live Project Pilot auto-syncs its exact existing conversation every 30 seconds while the desktop is open, exposes manual sync/export controls, and writes lossless JSON in the main process after a save-dialog choice. New-chat destinations are never auto-archived.
- Archive hashes are recomputed in the main process before persistence; archive size, message count, role, and destination bounds fail closed.

## Canonical ChatGPT destination recovery checkpoint

- ADR-0002 selects structured Codex/Native Messaging surfaces for production and limits Windows screen control to diagnostics/manual acceptance.
- Exact ChatGPT Project paths such as `/g/<project>/c/<conversation>` are validated against the conversation ID, persisted for new/current pilots, and learned by legacy pilots after an exact successful inspection or archive sync.
- `page.inspect`, streaming, capture, submit confirmation, and structured-response status are routed to the persisted destination instead of an arbitrary active ChatGPT tab.
- Recovery remains bounded and never submits. When Native Messaging is connected but ChatGPT redirects the exact conversation away, the app reports `CHATGPT_CONVERSATION_UNAVAILABLE` instead of continuing on home/new chat.
- Background history sync passes a no-open recovery policy, so a redirect to `chatgpt.com` cannot spawn repeated tabs; startup recovery is limited to one destination.
- The packaged pilot reads the bounded Codex local catalog and displays verified projects such as `các tool đơn giản`, with no manual project-name entry required.
- Verification passed formatting, lint, strict type-check, 219 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, the 46-test internal-beta UAT selection, all workspace builds, Windows packaging, packaged/native-host smoke, and fixture-only packaged restart acceptance with zero runtime errors.

`pnpm.cmd run verify` passed locally on 2026-07-20 with migration parity, formatting, lint, strict type-check, 232 Vitest tests, two recoverable workflow fixture E2E tests, two Chromium fixture E2E tests, and all 15 buildable workspace projects. The focused recovery/catalog/pilot suite passed 30 tests. Windows packaging, packaged smoke, and packaged restart acceptance passed. The prior installed ChatGPT no-submit smoke remains accepted, but it was not rerun against the unavailable user conversation; no authenticated ChatGPT submit, live structured response, writable Codex run, or website generated by production Codex has been claimed.

## Latest commit

## Prior startup recovery evidence

The rebuilt Windows package and packaged/native-host smoke passed. A real app-data renderer inspection displayed pilot `8ec5d3b7` as `Cần xác nhận lần gửi`; no ChatGPT message was resent or submitted. The targeted recovery set passed 36 tests, and `pnpm.cmd run verify` passed with 206 Vitest tests, two workflow fixture E2E tests, two Chromium fixture E2E tests, and all workspace builds.

Resolve current HEAD with `git rev-parse HEAD`; the state helper reports it with `pnpm status`.

## Latest successful push

Resolve the published hash with `git rev-parse origin/main`; publication requires equality with HEAD.

## Account transfer checkpoint - 2026-07-21

The Live Project Pilot now supports an explicit account-switch transfer from locally archived rendered ChatGPT history. The action creates an audited ZIP, opens a new ChatGPT destination in the current account, renders a bounded inline bootstrap preview when safe, requires one action-time confirmation before sending, verifies the rendered user message, and rebinds the same persisted pilot/project/Codex target to the new conversation.

Large archives remain complete in the local ZIP but stop at `manual_attachment_required`; the app does not claim a browser file upload. Secret-like content blocks transfer before any external send. Transfer effects are persisted and ambiguous dispatch is restored as confirmation-required.

The Native Messaging health check now requires the shared content version handshake and a rendered content-script ping. A stale unpacked extension is reported as `EXTENSION_VERSION_MISMATCH`/degraded instead of false `ready`. New-chat confirmation can resolve the SPA transition from `/` to a concrete conversation without resending.

Verification for this checkpoint: `pnpm.cmd run verify` passed 240 Vitest tests, two workflow fixture E2E tests, two Chromium fixture tests, all workspace builds, the 46-case internal-beta UAT, Windows packaging, packaged smoke, and fixture-only packaged restart acceptance with zero runtime errors. Focused account-transfer/health/UI coverage passed 84 tests. No authenticated external ChatGPT send or live Codex write is claimed by these fixture gates.

## Last updated

2026-07-20 01:11 +07:00.
