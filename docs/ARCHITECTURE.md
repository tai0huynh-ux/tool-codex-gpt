# Architecture

## Phase 1 boundaries

Codex Context Bridge is a local-first TypeScript monorepo. The current milestone implements identity,
validation, persistence, audit, file safety, approved memory, context building, and recoverable workflow
orchestration. It does not implement automatic ChatGPT sending. Codex has a production read-only structured
runner, while the mock adapter remains available only for deterministic fixtures.

## Components

- `apps/desktop`: Electron + React + Vite project workspace with context isolation, sandboxing, and typed preload boundaries.
- `apps/chatgpt-extension`: Manifest V3 capture spike restricted to user-opened `chatgpt.com` tabs.
- `packages/contracts`: versioned handoff and project identity contracts.
- `packages/database`: SQLite migration runner and append-only audit primitive; distributable SQL is the canonical migration source and the bundled TypeScript module is generated and parity-checked.
- `packages/project-registry`: project CRUD over normalized relational tables.
- `packages/project-detector`: fingerprint creation and evidence-based confidence scoring.
- `packages/context-builder`: deterministic, budgeted, secret-safe context pack selection and preview contracts.
- `packages/memory-engine`: approved-only scoped memory lifecycle, deterministic retrieval, provenance, and budgeted chat bootstrap.
- `packages/workflow-engine`: transactional workflow transitions, scoped single-use approvals, idempotent send-effect journaling, acknowledgement, limits, audit, and restart recovery.
- `packages/assisted-chatgpt`: deterministic reviewed previews, destination binding, composer/clipboard dispatch, manual-send confirmation, streaming, cancellation, and workflow-effect integration.
- `packages/response-router`: durable response receipts, strict identity/replay validation, Codex prompt review, destination resolution, workflow-effect routing, and mock lifecycle projection.
- `packages/file-store`: allowlisted, content-addressed file ingestion.
- `packages/secret-scanner`: deterministic pre-ingestion secret checks.
- `packages/codex-adapter`: typed ordered run lifecycle boundary, a production bundled-binary JSONL runner, and an explicitly fixture-only mock; replay, terminal guards, cancellation, failure redaction, and isolated runtime cleanup are contract-tested.
- `packages/local-transport`: authenticated Native Messaging protocol guard, bounded stdio framing, replay/rate controls, and reconnect policy.

## Local transport boundary

ADR-0001 selects Native Messaging for the production extension boundary. The browser-owned native port is protected by exact `allowed_origins`; the packaged native host authenticates desktop-originated operations over a per-user named pipe with an ephemeral application capability before forwarding a capability-free request into the extension. Requests are versioned, operation-specific, short-lived, replay-protected, size-bounded, rate-limited, and audited without payload or capability logging.

The extension service worker reconnects only through a fixed native-host name, receives host-forwarded commands, revalidates expiry/replay/size, and routes DOM work to an exact user-opened ChatGPT tab. It never receives the desktop capability. Electron preload exposes allowlisted status and operation methods; the renderer never receives raw `ipcRenderer`, the capability, or a native port. Windows packaging installs a console launcher, bundled Node-mode host, exact-origin manifest, and per-user Chrome/Edge/Chromium registration in both registry views. The service worker remains dormant while the `nativeMessaging` manifest permission is intentionally inactive.

Live installed ChatGPT sending remains authorization-gated. Adapter and transport domain boundaries stay
separate from renderer and extension trust boundaries.

## Dependency direction

Contracts and database are foundational. Registry depends on database. Detector depends on contracts.
File store depends on secret scanning. Apps may consume packages later but no package depends on an app.

Database migrations are an ordered, generated version list sourced from `packages/database/migrations/*.sql`. Each version runs in its own transaction and advances SQLite `user_version` only after success. Migration v2 adds non-destructive project/repository archive state, worktree metadata, and append-only mapping confirmation history.

Migration v4 adds bounded workflow limits, recovery state, structured event metadata, scoped approval bindings, and a durable effect journal. An effect is persisted as `prepared` before dispatch, changes to `dispatching` before the external boundary, and advances the workflow only after `acknowledged`. Restart recovery may dispatch a prepared effect once, but a dispatching effect always requires confirmation and is never automatically resent.

Assisted ChatGPT delivery renders the validated handoff and context pack into an exact preview with payload and lineage hashes. It checks the active page against an existing conversation ID or a new-chat destination before crossing the effect boundary. Composer insertion never submits. The effect remains `dispatching` until streaming stops and rendered capture proves the latest user message matches the approved payload; ambiguous insertion or clipboard failures require confirmation instead of retry.

Migration v5 stores unique ChatGPT response receipts before routing. The response router validates receipt, workflow, handoff, correlation, project, prompt hash, repository, and persisted thread identity; it routes existing/new/worktree destinations through the P10 effect journal. External success is followed by one local transaction for thread mapping, acknowledgement, workflow projection, and receipt status. Fixture E2E remains deterministic through `MockCodexAdapter`; separate live acceptance proves the production adapter without making live Codex a CI dependency.

## Project identity

A fingerprint hashes normalized Git remote, canonical root, project name, repository marker, and optional
`AGENTS.md` hash. Detection scores matching evidence. A score of at least `0.85` can auto-select, `0.60` to
`0.84` requires confirmation, and lower scores are blocked from sending.

Branch is operational metadata, not repository identity. Distinct worktree roots remain distinct repository registrations while normalized remote and other evidence can associate them with the same project. Equal-confidence candidates return an explicit ambiguity and never select the first database row implicitly. Confirmations retain evidence and supersede older active mappings without deleting history.

The desktop main process owns the persistent SQLite connection and recomputes repository detection evidence. The renderer can list, create, alias, archive, preview, and explicitly confirm mappings only through validated IPC; it cannot supply trusted confidence or evidence and never receives database or filesystem access.

Context packs use a versioned Zod and JSON Schema contract. The builder ranks changed, test, type, config, pinned, and dependency-neighbor files deterministically; canonicalizes and resolves every path; blocks traversal, escaping symlinks, exclusions, secrets, binaries, and oversized files; hashes and deduplicates content; and applies separate file, byte, single-file, token, full-file, and excerpt budgets. Omitted and blocked files remain visible in a manifest without exposing outside-repository absolute paths.

Long-term memory is explicit-approval only. Candidate records never enter retrieval, rejection maps to the defined non-active `deleted` lifecycle, and supersession preserves the prior row with a pointer to its approved replacement. Scope and project identity are validated before persistence; retrieval merges only applicable global, team, project, conversation, and workflow records, then ranks by query overlap, category, confidence, recency, and stable ID. Every returned memory retains source provenance and bootstrap rendering obeys a strict character budget.
