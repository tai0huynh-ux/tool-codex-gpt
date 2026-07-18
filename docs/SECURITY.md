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

## Files

Ingestion resolves both repository roots and candidate files to canonical paths, verifies the allowlist after
symlink resolution, blocks traversal, applies exclusions and size limits, scans content for secrets, hashes
with SHA-256, deduplicates, then writes an audit event. `.env`, keys, credentials, generated output, Git
metadata, and dependencies are excluded by default.

## Handoffs and routing

Every handoff uses protocol `1.0` and is validated at input and output. Routing must bind project ID,
repository fingerprint, destination ID, correlation ID, and idempotency key. Confidence below `0.60` blocks
sending. Duplicate/iteration controls belong to the deferred persistent workflow engine.

## Threat model highlights

- Cross-project disclosure: mitigated by multi-signal identity and confirmation thresholds.
- Symlink/path escape: mitigated by canonical containment checks.
- Credential exfiltration: mitigated by exclusions and content scanning before copy.
- Browser account theft: mitigated by prohibiting cookie/token/header access.
- Infinite handoff loops: planned state-machine iteration, retry, correlation, and approval limits.
- Crash inconsistency: planned event-sourced workflow transitions in SQLite.
