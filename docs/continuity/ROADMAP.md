# Delivery Roadmap

Each task has a stable ID, dependency, acceptance condition, and publication record. `pending` means no accepted commit exists yet.

## Phase 0 - Continuity and governance

- [x] P0-CONT-001 Add persistent recovery workflow
  - Depends on: foundation commit `0cc5600`
  - Done when: continuity docs, state schema/test, status helper, and project skills pass full verification
  - Commit: resolve with `git log -1 -- docs/continuity/ROADMAP.md`

## Phase 1 - CI and foundation stabilization

- [x] P1-TOOL-001 Make workspace scripts cross-platform
  - Depends on: P0-CONT-001
  - Done when: Windows uses `pnpm.cmd` externally while package scripts use portable commands
  - Commit: resolve with `git log -1 --grep "chore(tooling): make workspace scripts cross-platform"`
- [x] P1-CI-001 Add credential-free repository verification workflow
  - Depends on: P1-TOOL-001
  - Done when: frozen install, format, lint, type-check, unit, Chromium fixture E2E, and build run with timeout and failure artifacts
  - Commits: `3787b41` workflow and `b091234` Node.js 24 action runtimes
- [x] P1-DATA-001 Establish a canonical migration source
  - Depends on: P0-CONT-001
  - Done when: runtime migrations and distributable SQL cannot drift silently
  - Commit: resolve with `git log -1 --grep "fix(database): prevent migration source drift"`

## Phase 2 - Codex adapter lifecycle

- [x] P2-CODEX-001 Add a lossless typed run lifecycle
  - Depends on: P1-CI-001
  - Done when: start, progress, completion, failure, cancellation, replay, sequencing, and terminal guards pass contract tests
  - Commit: resolve with `git log -1 --grep "fix(codex): preserve ordered run lifecycle"`

## Phase 3 - Production Codex integration

- [x] P3-CODEX-001 Prove isolated read-only SDK integration
  - Depends on: P2-CODEX-001
  - Done when: structured start, run, final response, lifecycle, resume, failure mapping, cancellation, working directory, and sandbox are evidenced live
  - Commit: resolve with `git log -1 --grep "feat(codex): isolate production runtime lifecycle"`

## Phase 4 - Conversation capture

- [x] P4-EXT-001 Preserve virtualized conversations
  - Depends on: P1-CI-001
  - Done when: accumulated capture passes long, virtualized, duplicate-text, streaming, abort, ordering, and selector-health fixtures
  - Commit: resolve with `git log -1 --grep "fix(extension): preserve virtualized conversation capture"`

## Phase 5 - Composer and response parsing

- [x] P5-EXT-001 Harden composer insertion and bounded response parsing
  - Depends on: P4-EXT-001
  - Done when: controlled input fixtures and paired-marker validated responses pass without automatic submit
  - Commit: resolve with `git log -1 --grep "fix(extension): harden composer and response parsing"`

## Phase 6 - Desktop and extension transport

- [x] P6-IPC-001 Add authenticated local transport and typed IPC
  - Depends on: P2-CODEX-001, P5-EXT-001
  - Done when: transport threat model, runtime validation, reconnect, spoofing, rate, and Electron IPC tests pass
  - Commit: resolve with `git log -1 --grep "feat(transport): add authenticated local extension bridge"`
- [x] P6-IPC-002 Correct the Native Messaging extension command boundary
  - Depends on: P6-IPC-001
  - Done when: a dormant MV3 service worker receives host-forwarded operations, routes them to the exact user-opened ChatGPT tab, rejects expiry/replay/oversize, and never receives the desktop capability
  - Commit: resolve with `git log -1 --grep "fix(transport): route native operations through extension"`
- [x] P6-IPC-003 Add the desktop-to-host relay and Windows native-host registration
  - Depends on: P6-IPC-002
  - Done when: a separate packaged host authenticates desktop requests, relays bounded operations bidirectionally, installs an exact-origin manifest and per-user registry entries, and passes install/restart/uninstall smoke without activating extension permissions
  - Commit: resolve with `git log -1 --grep "feat(transport): install authenticated native host relay"`
- [x] P6-IPC-004 Activate the explicitly authorized Native Messaging permission
  - Depends on: P6-IPC-003, explicit authorization to add the `nativeMessaging` extension permission
  - Done when: the manifest, desktop status, release metadata, boundary tests, package, packaged smoke, and installed host smoke all require and report the permission active
  - Commit: resolve with `git log -1 --grep "feat(transport): activate authorized native messaging"`
- [x] P6-IPC-005 Prove the installed Native Messaging browser path
  - Depends on: P6-IPC-004, action-time confirmation to install/load the browser extension
  - Done when: the installed extension and host complete a user-opened authenticated ChatGPT health/capture/assisted-insert/clear smoke with redacted evidence
  - Commit: resolve with `git log -1 --grep "fix(release): complete installed browser acceptance"`

## Phase 7 - Project mapping

- [x] P7-DATA-001 Add versioned project mapping persistence
  - Depends on: P6-IPC-001
  - Done when: v1 upgrade, archive, worktrees, aliases, evidence history, ambiguity, ChatGPT source, and Codex thread tests pass
  - Commit: resolve with `git log -1 --grep "feat(projects): add mapping persistence"`
- [x] P7-UI-001 Add project registration and ambiguity confirmation UI
  - Depends on: P7-DATA-001
  - Done when: typed IPC and renderer flows cover project/repository registration, evidence, confirmation, archive, and persisted reload
  - Commit: resolve with `git log -1 --grep "feat(projects): add registration and mapping UI"`
- [x] P7-PROJ-001 Add repository registration and mapping UI
  - Depends on: P7-DATA-001, P7-UI-001
  - Done when: multiple repositories, ambiguity confirmation, worktrees, aliases, and persisted mappings work end to end
  - Commit: resolve with `git log -1 --grep "feat(projects): add registration and mapping UI"`

## Phase 8 - Context packs

- [x] P8-CTX-001 Build deterministic reviewed context packs
  - Depends on: P7-PROJ-001
  - Done when: diff, results, relevant files, secret safety, budgets, hashes, preview, and deterministic selection pass tests
  - Commit: resolve with `git log -1 --grep "feat(context-builder): build safe deterministic context packs"`

## Phase 9 - Long-term memory

- [x] P9-MEM-001 Add approved scoped memories and chat bootstrap
  - Depends on: P8-CTX-001
  - Done when: candidate, approval, rejection, supersession, retrieval, budgets, provenance, and bootstrap tests pass
  - Commit: resolve with `git log -1 --grep "feat(memory): add approved scoped long-term memory"`

## Phase 10 - Persistent workflows

- [x] P10-WF-001 Persist recoverable idempotent workflows
  - Depends on: P8-CTX-001, P9-MEM-001
  - Done when: transactional transitions, approvals, duplicate prevention, loop limits, and crash recovery pass
  - Commit: resolve with `git log -1 --grep "feat(workflow): persist recoverable handoff workflows"`

## Phase 11 - Assisted ChatGPT sending

- [x] P11-CHAT-001 Add reviewed conversation handoff
  - Depends on: P5-EXT-001, P10-WF-001
  - Done when: existing/new destinations, preview, single-use approval, streaming, capture, cancellation, and clipboard fallback pass
  - Commit: resolve with `git log -1 --grep "feat(chatgpt): add reviewed assisted handoffs"`

## Phase 12 - ChatGPT response routing

- [x] P12-HANDOFF-001 Route validated prompts to Codex
  - Depends on: P3-CODEX-001, P11-CHAT-001
  - Done when: schema, handoff, correlation, project, duplicate, approval, and iteration checks guard all destinations
  - Commit: resolve with `git log -1 --grep "feat(routing): route validated prompts to codex"`

## Phase 13 - Desktop workflow UI

- [x] P13-UI-001 Add guided accessible workflow interface
  - Depends on: P7-PROJ-001, P8-CTX-001, P10-WF-001, P12-HANDOFF-001
  - Done when: projects, timeline, review, approvals, audit, diagnostics, recovery, keyboard, and Electron smoke tests pass
  - Commit: resolve with `git log -1 --grep "feat(desktop): add guided workflow timeline"`

## Phase 14 - End-to-end workflow

- [x] P14-E2E-001 Cover the complete recoverable handoff loop
  - Depends on: P13-UI-001
  - Done when: golden path, negative paths, restart, and no-duplicate fixture E2E pass before live smoke
  - Commit: resolve with `git log -1 --grep "test(e2e): cover recoverable handoff loop"`

## Phase 15 - Security hardening

- [x] P15-SEC-001 Harden every trust boundary
  - Depends on: P14-E2E-001
  - Done when: threat model and injection, traversal, replay, spoofing, IPC, capability, logging, and corruption tests pass
  - Commit: resolve with `git log -1 --grep "security: harden workflow IPC boundary"`

## Phase 16 - Packaging and release readiness

- [x] P16-REL-001 Add reproducible Windows packaging
  - Depends on: P15-SEC-001
  - Done when: installer, migration backup, extension artifact, redacted diagnostics, checksums, clean-profile smoke, and release gate pass
  - Commit: resolve with `git log -1 --grep "build(release): add reproducible Windows packaging"`
- [x] P16-REL-002 Include and verify the selected Native Messaging host
  - Depends on: P6-IPC-003
  - Done when: installer registration, exact-origin manifest, packaged host smoke, upgrade, and uninstall cleanup pass
  - Commit: resolve with `git log -1 --grep "feat(transport): install authenticated native host relay"`
