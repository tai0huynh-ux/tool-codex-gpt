# Live Project Pilot

## Current status

`PACKAGED RESTART ACCEPTED - LIVE EXECUTION NOT CLAIMED`

The desktop orchestration, explicit approval controls, repository-bound Codex profile, local website verifier, and sandboxed preview boundary are published. A fixture-only packaged restart now proves that a terminal Codex report survives a full application close/reopen without relying on an adapter-local run handle. Authenticated ChatGPT and writable Codex execution remain separately gated.

## Current evidence

- Tested commit: current packaged restart checkpoint; resolve after publication with `git log -1 --grep "fix(pilot): complete packaged restart recovery"`
- Project ID: `09b7dc55` in the redacted screenshot; full temporary ID is not published
- Temporary repository: isolated temporary Git repository removed after acceptance
- ChatGPT destination type: contract supports new or exact existing conversation
- ChatGPT message acknowledgement: not run yet
- Structured response validation: covered by existing response-router tests; live receipt not run
- Codex adapter: production `SdkCodexAdapter`, `workspace_write_no_network` profile
- Codex run ID: fixture-only persisted missing-handle marker; no production Codex turn was executed
- Changed files: none in the temporary repository during restart acceptance
- Website verification: local verifier implemented and tested; generated artifact not run yet
- Preview result: sandboxed BrowserWindow implemented; packaged preview not run yet
- Restart recovery: passed in packaged Electron; terminal status and final response restored from SQLite after close/reopen with zero renderer runtime errors
- Duplicate prevention: existing workflow/effect/receipt guards plus pilot IPC tests
- No-outside-app interaction: implementation keeps sends behind in-app explicit approvals; acceptance not run yet

## Safe limits

No cookies, tokens, authorization headers, browser history, browser profiles, credentials, private APIs, manual clipboard, manual ChatGPT/Codex typing, or real user repository writes are permitted. A live run must use a temporary Git repository registered through the app UI.

## Next gate

Attempt one bounded authenticated live run only if the user has a safe open ChatGPT destination with an empty composer. If that external condition is unavailable, report `LIVE PROJECT PILOT PACKAGED RESTART ACCEPTED - LIVE EXECUTION BLOCKED` and record the exact condition instead of using fixture evidence as a live claim.
