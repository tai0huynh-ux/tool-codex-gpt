# Live Project Pilot

## Current status

`LIVE DESTINATION READY - SUBMIT NOT YET APPROVED`

The desktop now resolves the user-opened existing ChatGPT conversation through connected Native Messaging without requiring manual ID entry. A reviewed payload is persisted for a temporary Git repository, but the representational ChatGPT submit remains blocked until action-time user confirmation.

The local workspace can also discover conversation links currently rendered in the ChatGPT sidebar, list
verified Codex project/thread mappings, and maintain independent connection tabs. Completed approved Codex
runs can create a reviewed ZIP containing the full report, manifest, and only safety-accepted changed files.
This does not authorize sending the existing reviewed payload or automatically uploading the ZIP.

## Current evidence

- Tested baseline: `849812b`; current-conversation changes are awaiting publication
- Project ID: temporary live-pilot project persisted locally; full identifier is not published
- Temporary repository: isolated temporary Git repository under the Windows temporary directory
- ChatGPT destination type: exact existing conversation resolved through Native Messaging
- ChatGPT message acknowledgement: not run; submit has not been approved
- Structured response validation: covered by existing response-router tests; live receipt not run
- Codex adapter: production `SdkCodexAdapter`, `workspace_write_no_network` profile
- Codex run ID: fixture-only persisted missing-handle marker; no production Codex turn was executed
- Changed files: none in the temporary repository during restart acceptance
- Catalog/bundle checkpoint: 228 tests, internal-beta UAT, Windows package, ZIP-runtime packaged smoke, native-host smoke, and fixture-only restart pass
- Website verification: local verifier implemented and tested; generated artifact not run yet
- Preview result: reviewed ChatGPT handoff prepared with hash `75cae5042832…428bae39`; website preview not run yet
- Restart recovery: passed in packaged Electron; terminal status and final response restored from SQLite after close/reopen with zero renderer runtime errors
- Duplicate prevention: existing workflow/effect/receipt guards plus pilot IPC tests
- No-outside-app interaction: implementation keeps sends behind in-app explicit approvals; acceptance not run yet

## Safe limits

No cookies, tokens, authorization headers, browser history, browser profiles, credentials, private APIs, manual clipboard, manual ChatGPT/Codex typing, automatic local-file upload, or real user repository writes are permitted. A live run must use a temporary Git repository registered through the app UI.

## Next gate

Request action-time user confirmation for the reviewed payload hash `75cae5042832…428bae39`. After confirmation, submit exactly once and require rendered acknowledgement plus a valid structured response before preparing the separate Codex approval.
