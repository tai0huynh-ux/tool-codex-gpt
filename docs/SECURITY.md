# Security

## Trust boundaries

The browser page, repository files, Codex responses, ChatGPT responses, and imported handoff envelopes are
untrusted inputs. Validate them before persistence or transfer. Assisted mode requires preview and a
single-use approval before any send operation; automatic send is not implemented in this milestone.

## Browser extension

The extension has only `storage`, `activeTab`, and `scripting`, with host access limited to
`https://chatgpt.com/*`. It reads rendered DOM only after the user opens the tab. It must never read or store
cookies, tokens, authorization headers, browser history, passwords, or unpublished endpoints. DOM selectors
are isolated because they are inherently unstable.

Assisted composer actions require an effect ID and approved payload hash. They fill but never submit, validate the active conversation destination, and clear text only when the current composer hash still matches. Clipboard fallback is explicit rather than automatic. A manual send is acknowledged only from rendered conversation capture after streaming stops.

ChatGPT responses are schema-validated and persisted as unique receipts before routing. Handoff, correlation, project, prompt, repository, worktree provider, and persisted Codex thread identity must all match. Mock adapter results remain labeled mock-only and ambiguous external failures stay confirmation-required.

## Files

Ingestion resolves both repository roots and candidate files to canonical paths, verifies the allowlist after
symlink resolution, blocks traversal, applies exclusions and size limits, scans content for secrets, hashes
with SHA-256, deduplicates, then writes an audit event. `.env`, keys, credentials, generated output, Git
metadata, and dependencies are excluded by default.

## Handoffs and routing

Every handoff uses protocol `1.0` and is validated at input and output. Routing must bind project ID,
repository fingerprint, destination ID, correlation ID, and idempotency key. Confidence below `0.60` blocks
sending. The persistent workflow engine enforces bounded iterations/retries, single-use hashed approvals,
durable response receipts, and idempotent effect keys before either destination can be dispatched.

## Local transport and Electron IPC

ADR-0001 selects Native Messaging without activating new extension permissions in the current manifest. The installed native host uses one exact extension origin and authenticates the desktop side over a per-user named pipe with an ephemeral capability, then strips that capability before forwarding commands into the browser. The dormant extension service worker independently validates version, operation, request ID, nonce, short expiry, replay, and the 256 KiB application limit before DOM execution. Capability files are restricted to the current user where the platform supports it; capabilities and payload content never enter extension messages or logs.

Electron keeps context isolation and sandboxing enabled. Preload exposes one typed method per allowlisted IPC channel and validates responses before returning them. The renderer never receives raw `ipcRenderer`, filesystem, shell, child-process, database, or native-port access. Main-process handlers validate the exact renderer identity, request schema, timeout, and transport failure code.

Workflow IPC additionally caps identifiers and diagnostic fields, rejects unknown properties, returns only
approval scope/expiry metadata, and projects audit type/outcome/time without `details_json`. Approval token
hashes, capability tokens, file content, and audit detail payloads remain main-process-only.

## Codex runtime

The production Codex adapter launches only the SDK-bundled binary with structured JSONL stdio. Every turn is
forced to the requested repository working directory with read-only sandboxing, approval policy `never`, and
network/web search disabled. A bundled model catalog is copied to a mode-restricted temporary directory and
selected through a per-process override, so external Codex configuration and credentials are not edited.
The adapter owns stdin/stdout/stderr, aborts the exact child process on cancellation, waits for child work
before runtime cleanup, bounds captured stderr, maps failures to stable redacted codes, and removes temporary
runtime files on disposal.

## Threat model highlights

- Cross-project disclosure: mitigated by multi-signal identity and confirmation thresholds.
- Symlink/path escape: mitigated by canonical containment checks.
- Credential exfiltration: mitigated by exclusions and content scanning before copy.
- Browser account theft: mitigated by prohibiting cookie/token/header access.
- Infinite handoff loops: mitigated by persisted state-machine iteration, retry, correlation, idempotency, and approval limits.
- Local peer spoofing or replay: mitigated by exact native-host origin, capability comparison, expiry, nonce/request caches, rate limits, and bounded framing.
- Renderer compromise: constrained by context isolation, sandboxing, exact sender validation, and narrow preload methods.
- Crash inconsistency: mitigated by transactional workflow events/projections and a prepared/dispatching/acknowledged effect journal in SQLite.

## Verification coverage

- File tests cover traversal, escaping symlinks, binary input, secrets, exclusions, size budgets, and deterministic deduplication.
- Transport tests cover origin/capability rejection, expiry, replay, oversized framing, rate limits, timeouts, reconnect, and correlation.
- Workflow tests cover approval scope/hash/expiry/consumption, iteration/retry limits, fault rollback, restart recovery, duplicate effects, and ambiguous dispatch.
- Response tests cover malformed schema, wrong handoff/correlation/project, wrong repository/thread/worktree, prompt mutation, duplicate receipts, and mock lifecycle failure/cancellation.
- Electron tests cover exact sender identity, strict schemas, bounded workflow identifiers, unknown properties, timeout mapping, audit redaction, and absence of approval or audit secrets from renderer responses.
