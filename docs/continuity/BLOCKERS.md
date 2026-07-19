# Blockers

## Internal beta summary

- Active P0/P1 blockers: none.
- Accepted limitations: unsigned Windows artifacts, unpacked internal extension distribution, no automatic ChatGPT submission, no public GitHub Release, and no store publication.
- Environment-limited reruns: destructive clean-install and live Edge smoke were not rerun because the installed app, native host, and user browser session are active; prior acceptance remains recorded separately.
- Desktop UI acceptance: resolved in P17-BETA-002. The packaged renderer was non-blank and all seven available non-destructive acceptance checks passed against isolated fixtures.
- Live Project Pilot: implementation and fixture checkpoints `13ddbd4` and `960e566` are published and local verification is green; no authenticated live ChatGPT -> Codex run has been attempted or claimed. Remaining gate is safe packaged/live evidence.

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

- Status: resolved
- First observed: 2026-07-18
- Last verified: 2026-07-19
- Affected phase: P6-IPC-005 installed Native Messaging acceptance
- Reproduction: select the running Edge window through Computer Use, then request its accessibility state before installing the built extension
- Expected: load the built extension, open an authenticated ChatGPT tab with an empty composer, and run `pnpm.cmd run smoke:installed-chatgpt:win`
- Actual: the extension was loaded with user confirmation and the live smoke passed health, redacted capture, no-submit insert, and exact clear
- Root cause: the original external blocker was compounded by three real runtime defects: the packaged Electron main bundle/native SQLite dependency path, MV3 service-worker wake recovery, and inconsistent ChatGPT Project conversation URL parsing
- Evidence: live `pnpm.cmd run smoke:installed-chatgpt:win` returned `status: passed`, `health: ready`, `capturedMessages: 0`, a SHA-256 snapshot hash, `composerSent: false`, and `composerCleared: true`
- Attempts: stopped on Computer Use URL policy, used the confirmed manual load once, rejected remote-debugging/profile manipulation, added a data-free content-ready wake event, and ran the final smoke through the installed exact-origin native host
- Unsafe actions avoided: did not bypass browser policy, inspect profile storage, read cookies/tokens, install the extension without action-time confirmation, or claim host fixtures as live browser evidence
- Workarounds: no workaround remains necessary for the accepted path; opening an allowlisted ChatGPT tab now wakes the service worker and native host without browser-profile inspection
- Independent work available: post-MVP maintenance only
- Resolution condition: satisfied on 2026-07-19 by the installed Edge health/capture/insert/clear smoke
