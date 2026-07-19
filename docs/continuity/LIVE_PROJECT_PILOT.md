# Live Project Pilot

## Current status

`IMPLEMENTED — LIVE EXECUTION NOT CLAIMED`

The desktop orchestration, explicit approval controls, repository-bound Codex profile, local website verifier, and sandboxed preview boundary are published in `13ddbd4`. This file becomes the redacted acceptance record when a packaged fixture or authenticated live run is performed.

## Current evidence

- Tested commit: `13ddbd4a5e438a0dd59dd4cef94b1527235c4fe6`
- Project ID: not run yet
- Temporary repository: not run yet
- ChatGPT destination type: contract supports new or exact existing conversation
- ChatGPT message acknowledgement: not run yet
- Structured response validation: covered by existing response-router tests; live receipt not run
- Codex adapter: production `SdkCodexAdapter`, `workspace_write_no_network` profile
- Codex run ID: not run yet
- Changed files: not run yet
- Website verification: local verifier implemented and tested; generated artifact not run yet
- Preview result: sandboxed BrowserWindow implemented; packaged preview not run yet
- Restart recovery: not run yet
- Duplicate prevention: existing workflow/effect/receipt guards plus pilot IPC tests
- No-outside-app interaction: implementation keeps sends behind in-app explicit approvals; acceptance not run yet

## Safe limits

No cookies, tokens, authorization headers, browser history, browser profiles, credentials, private APIs, manual clipboard, manual ChatGPT/Codex typing, or real user repository writes are permitted. A live run must use a temporary Git repository registered through the app UI.

## Next gate

Add the CI fixture counterpart and packaged restart evidence. If no safe authenticated ChatGPT destination or production Codex availability exists, report `LIVE PROJECT PILOT IMPLEMENTED — LIVE EXECUTION BLOCKED` and record the exact condition instead of using fixture evidence as a live claim.
