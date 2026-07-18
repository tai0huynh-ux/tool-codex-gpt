# Blockers

## CODEX-SDK-001

- Status: resolved
- First observed: 2026-07-18
- Last verified: 2026-07-18
- Affected phase: Phase 3 production Codex integration
- Reproduction: run `pnpm.cmd run test:codex-spike`
- Expected: structured `thread.started`, read-only final response, and resumed second turn
- Actual: the original SDK path exited before `thread.started`; the isolated production adapter now passes the full live lifecycle gate
- Root cause: external `model_catalog_json` is missing the SDK-required `supports_reasoning_summaries` field
- Evidence: `docs/FEASIBILITY.md` and the live command failure from SDK `0.144.5`
- Attempts: verified the current SDK shape, reproduced inherited config resolution, proved the bundled catalog, and moved execution ownership to a structured per-process runner
- Unsafe actions avoided: did not edit external catalog, credentials, Codex home, or user authentication
- Workarounds: `MockCodexAdapter` remains fixture-only; the live production gate stays separate from CI
- Independent work available: P6-IPC-004 remains authorization-gated independently
- Resolution condition: resolved by P3-CODEX-001; resolve the commit with `git log -1 --grep "feat(codex): isolate production runtime lifecycle"`

## EXT-PERM-001

- Status: resolved
- First observed: 2026-07-18
- Last verified: 2026-07-18
- Affected phase: P6-IPC-005 installed Native Messaging browser acceptance
- Expected: explicitly authorized `nativeMessaging` permission followed by a user-opened authenticated ChatGPT smoke
- Actual: the user explicitly authorized the permission; the manifest, desktop status, and release metadata now activate it
- Root cause: extension privilege expansion requires explicit user authorization under repository safety policy
- Evidence: production manifest tests require `nativeMessaging`; full verification, packaging, packaged smoke, and installed host relay smoke pass
- Unsafe actions avoided: did not broaden extension permissions or claim fixture/host evidence as live ChatGPT integration
- Independent work available: live browser acceptance remains under `BROWSER-LIVE-001`
- Resolution condition: resolved by explicit user authorization and the activation checkpoint; resolve with `git log -1 --grep "feat(transport): activate authorized native messaging"`

## BROWSER-LIVE-001

- Status: active
- First observed: 2026-07-18
- Last verified: 2026-07-18
- Affected phase: P6-IPC-004 installed Native Messaging acceptance
- Reproduction: select the running Edge window through Computer Use, then request its accessibility state before installing the built extension
- Expected: load the built extension, open an authenticated ChatGPT tab with an empty composer, and run `pnpm.cmd run smoke:installed-chatgpt:win`
- Actual: Computer Use stopped before any browser action because it could not determine the current Edge URL with enough confidence to enforce policy
- Root cause: Windows browser URL-confidence policy stop, not repository code or native-host transport
- Evidence: full verification passed with 162 tests; packaging, packaged smoke, and installed native-host smoke passed; no browser-owned port claim was made
- Attempts: enumerated one running Edge window, then stopped immediately when Computer Use rejected state capture
- Unsafe actions avoided: did not bypass browser policy, inspect profile storage, read cookies/tokens, install the extension without action-time confirmation, or claim host fixtures as live browser evidence
- Workarounds: the user can manually load `apps/chatgpt-extension/dist` from `edge://extensions`, open a user-selected authenticated ChatGPT tab with an empty composer, and then run the redacted no-submit smoke
- Independent work available: continuity publication of P6-IPC-004 permission activation
- Resolution condition: the built extension is loaded with user confirmation and the installed health/capture/insert/clear smoke exits successfully
