# Architecture

## Phase 1 boundaries

Codex Context Bridge is a local-first TypeScript monorepo. The current milestone implements identity,
validation, persistence, audit, file safety, and feasibility spikes. It does not implement the autonomous
workflow loop, automatic sending, or a production ChatGPT/Codex adapter.

## Components

- `apps/desktop`: minimal Electron + React + Vite shell with context isolation and sandboxing.
- `apps/chatgpt-extension`: Manifest V3 capture spike restricted to user-opened `chatgpt.com` tabs.
- `packages/contracts`: versioned handoff and project identity contracts.
- `packages/database`: SQLite migration runner and append-only audit primitive; distributable SQL is the canonical migration source and the bundled TypeScript module is generated and parity-checked.
- `packages/project-registry`: project CRUD over normalized relational tables.
- `packages/project-detector`: fingerprint creation and evidence-based confidence scoring.
- `packages/file-store`: allowlisted, content-addressed file ingestion.
- `packages/secret-scanner`: deterministic pre-ingestion secret checks.
- `packages/codex-adapter`: typed ordered run lifecycle boundary plus an explicitly mock-only fallback for the blocked SDK spike; replay and terminal guards are contract-tested.
- `packages/local-transport`: authenticated Native Messaging protocol guard, bounded stdio framing, replay/rate controls, and reconnect policy.

## Local transport boundary

ADR-0001 selects Native Messaging for the production extension boundary. The browser-owned native port is protected by exact `allowed_origins` plus an ephemeral application capability. Requests are versioned, operation-specific, short-lived, replay-protected, size-bounded, rate-limited, and audited without payload or capability logging.

The extension client reconnects only through a fixed native-host name and validates correlated responses. Electron preload exposes allowlisted status and operation methods; the renderer never receives raw `ipcRenderer` or a native port. Native-host registration and the `nativeMessaging` manifest permission remain intentionally inactive until the packaging/security gate.

Later packages such as memory, context building, workflow orchestration, and production adapters are
intentionally deferred. Their database boundaries exist so Phase 1 does not force unstructured query data.

## Dependency direction

Contracts and database are foundational. Registry depends on database. Detector depends on contracts.
File store depends on secret scanning. Apps may consume packages later but no package depends on an app.

## Project identity

A fingerprint hashes normalized Git remote, canonical root, project name, repository marker, and optional
`AGENTS.md` hash. Detection scores matching evidence. A score of at least `0.85` can auto-select, `0.60` to
`0.84` requires confirmation, and lower scores are blocked from sending.
