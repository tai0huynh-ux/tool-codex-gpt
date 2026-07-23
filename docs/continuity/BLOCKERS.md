# Blockers

## Internal beta summary

- Active P0/P1 blockers: none.
- Accepted limitations: unsigned Windows artifacts, unpacked internal extension distribution, no automatic local-file upload into ChatGPT, no public GitHub Release, and no store publication.
- Environment-limited reruns: destructive clean-install and live Edge smoke were not rerun because the installed app, native host, and user browser session are active; prior acceptance remains recorded separately.
- Desktop UI acceptance: resolved in P17-BETA-002. The packaged renderer was non-blank and all seven available non-destructive acceptance checks passed against isolated fixtures.
- Live Project Pilot: implementation, fixture, and packaged restart checkpoints are published through `849812b`. Installed ChatGPT no-submit readiness passes and the current existing conversation is resolved through Native Messaging. The workflow is paused at the mandatory action-time approval for reviewed payload `75cae5042832…428bae39`; no authenticated submit or writable Codex run is claimed.

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

## Chat archive MVP limitations

- Status: implemented and locally verified.
- The archive remains limited to exact conversations explicitly bound to a project/pilot and rendered DOM capture. The selector catalog may enumerate at most 200 conversation links currently rendered in the open sidebar, but it does not query account history, private APIs, browser profiles, storage, cookies, tokens, or authorization headers.
- Codex changed-file ZIPs are created locally after baseline comparison and safety scanning. The app reveals the file for explicit review/attachment; automatic browser upload is intentionally not claimed because no safe, size-bounded, production file-input boundary has been accepted.
- A capture is rejected when the bounded Native Messaging payload, message count, role, or character budget is exceeded; this preserves the 256 KiB transport safety limit rather than truncating silently.

## CHATGPT-ROUTE-001

- Status: resolved in the canonical destination checkpoint
- First observed: 2026-07-20
- Last verified: 2026-07-20
- Affected phase: P18-PILOT-001 startup recovery and chat archive sync
- Reproduction: persist an existing ChatGPT destination, let the exact URL resolve or redirect away from its conversation, and start recovery while another ChatGPT tab may be active
- Expected: inspect and reopen only the persisted conversation, preserve a ChatGPT Project route, and report an actionable error when the conversation is unavailable
- Actual before fix: `page.inspect` could observe an unrelated active ChatGPT tab, recovery reconstructed only `/c/<conversationId>`, and failure ended as generic `CHATGPT_NOT_READY`
- Root cause: destination-less inspection plus persistence of the conversation ID without its canonical rendered pathname
- Resolution: validate and retain canonical `/c/...` or `/g/.../c/...` paths, route inspect/status/capture through the exact destination, and fail closed as `CHATGPT_CONVERSATION_UNAVAILABLE`
- Evidence: 70 targeted regression cases, 219 full Vitest tests, two workflow fixture E2E tests, two Chromium fixture tests, internal-beta UAT, build, package, packaged/native-host smoke, and packaged restart acceptance passed
- Unsafe actions avoided: no browser profile, cookie, token, authorization header, history, storage, private endpoint, or screen-derived routing identity was used
- Remaining limitation: the specific user conversation was not live-inspected because Computer Use could not verify the active Edge URL; account/workspace availability remains external state

## CHATGPT-RECOVERY-002

- Status: resolved locally; regression-covered
- First observed: 2026-07-20
- Reproduction: leave a saved conversation redirected to `chatgpt.com` while the 30-second archive timer continues running
- Expected: inspect/reload the exact destination without creating another browser tab
- Actual before fix: every failed background recovery called `shell.openExternal`, producing an unbounded sequence of new tabs
- Resolution: background sync passes `allowOpenExternal: false`; only explicit startup recovery may open an allowlisted destination and it is capped to one unique destination
- Evidence: targeted recovery/pilot/catalog suite passed 30 tests; full verification and packaged smoke remain the publication gates
- Remaining limitation: an unavailable or redirected conversation still requires the user to reopen the exact conversation manually; the app will not guess a replacement tab

## CODEX-CATALOG-001

- Status: resolved locally; regression-covered
- First observed: 2026-07-20
- Reproduction: open the pilot without manually registering a Codex project
- Expected: show selectable Codex projects and threads from the local Codex desktop state
- Resolution: bounded reader imports only `.codex-global-state.json` and `session_index.jsonl`, validates Git roots through the registry, and refreshes the primary picker automatically with a manual `Đồng bộ project Codex` action
- Evidence: three catalog safety/import tests plus renderer and IPC coverage; packaged UI displayed the local Codex project tree
- Remaining limitation: projects not yet recorded by Codex or roots that are no longer valid Git repositories remain intentionally hidden

## CATALOG-CORRECTNESS-001

- Status: resolved locally; regression-covered
- First observed: 2026-07-21
- Reproduction: Codex picker displayed opaque external thread IDs; ChatGPT discovery returned zero while another open tab contained rendered sidebar links
- Root cause: local thread titles were discarded before registry persistence, and discovery selected only the highest-ranked tab
- Resolution: migration v6 persists bounded `thread_name` display titles; discovery sends the rendered-only operation to every eligible ChatGPT tab, bounds each tab to two seconds, and merges canonical paths
- Evidence: 47 focused catalog/timeout tests, 234 full Vitest tests, build, Windows package, and packaged smoke passed
- Live rerun: the installed bridge reported `ready`, but discovery still reached the 15-second desktop timeout before Edge reloaded the rebuilt extension; Computer Use then stopped because it could not verify the current browser URL, so no UI retry or account interaction was attempted
- Remaining limitation: reload the unpacked Edge extension and the open ChatGPT tabs before repeating the count-only live discovery check. ChatGPT still requires an authenticated, user-opened tab with its sidebar rendered; private APIs and account history remain intentionally out of scope

## ACCOUNT-TRANSFER-001

- Status: implemented locally; external send remains action-time gated.
- Safe path: create audited ZIP -> open current-account new chat -> show bounded inline preview -> explicit confirmation -> rendered acknowledgement -> persist the new conversation destination.
- Large archive path: the ZIP is complete and revealable, but automatic browser file upload is intentionally not claimed. The renderer stops at `manual_attachment_required`.
- Secret path: detected private-key, token, authorization, or credential-like text blocks the transfer before any ChatGPT effect is approved.
- Remaining external dependency: the rebuilt unpacked Edge extension and authenticated user-opened ChatGPT tab must be reloaded so the content-version handshake succeeds.

## EXTENSION-RELOAD-002

- Status: resolved by manual Edge reload and live no-submit verification.
- First observed: 2026-07-22
- Reproduction: native health falls back to `EXTENSION_LEGACY_COMPATIBILITY`; count-only `conversation.discover` times out while Edge is running the pre-build service worker.
- Root cause: the user reloaded the unpacked extension before the current compatibility/catalog build completed, so the running MV3 service worker remained stale.
- Resolution in code: versioned health is backward-compatible, legacy catalog responses are normalized and filtered, navigation paths no longer parse as conversation IDs, and packaging can use a separate artifact root when Windows holds the previous unpacked output.
- Evidence: after the user reloaded extension `ccchffnkidpolmnnlonbnakjjmphfdjp`, live health returned connected with no legacy error, count-only discovery returned three canonical conversations with no navigation entries, and the installed no-submit smoke passed insert/clear with `composerSent: false`.
- Remaining boundary: authenticated ChatGPT submit and writable Codex execution still require their separate action-time approvals.

## ASSISTED-RUN-005

- Status: resolved in the guided-workflow checkpoint on 2026-07-24.
- Reproduction: click `Chạy` on an idle ASSISTED MODE card and observe a persisted `workflow.started_by_user` event with the run permanently left in `project_resolving`.
- Root cause: the desktop workflow IPC implemented only the first transition; there was no safe progression driver.
- Resolution: the service now performs the bounded internal progression to `context_review_required`, adds explicit rerun and controlled-note IPC, and keeps all external sends behind the existing review/approval boundary.
- Evidence: focused workflow IPC/renderer tests passed 12/12; full verification passed 271 Vitest tests; packaged and installed acceptance each passed 16/16 with 79 controls and zero runtime errors.
- Remaining limitation: the flow intentionally stops at human review and does not claim authenticated ChatGPT/Codex completion.

## UI-ACCEPTANCE-ARCHIVE-001

- Status: resolved locally and reverified on 2026-07-22.
- Reproduction: the packaged UI acceptance harness clicked `Lưu trữ project` without accepting the native confirmation dialog, so Playwright dismissed the dialog and the project remained visible.
- Root cause: the test boundary did not model the user's required confirmation step; the project archive IPC and renderer state update were already correct.
- Resolution: accept the dialog in the harness and add a renderer regression proving the selected project disappears while an unrelated project remains visible.
- Evidence: 40 focused desktop/renderer tests, full verification with 261 Vitest tests, packaged UI acceptance 14/14 with 68 controls, installed UI acceptance 14/14, Windows package/smoke/restart, and installed ChatGPT no-submit smoke all passed.
- Remaining boundary: no authenticated ChatGPT submit, automatic browser ZIP upload, or writable live Codex run was performed.

## INSTALLED-RELAY-WAKE-001

- Status: resolved as an environment wake condition; no product blocker.
- Reproduction: immediately after a silent per-user installer update, `smoke:installed-chatgpt:win` could report `TRANSPORT_DISCONNECTED` because Edge had no active ChatGPT content-script/native-host connection.
- Resolution: opening the allowlisted ChatGPT home in the existing Edge profile woke the current unpacked extension/native relay; the same installed smoke then passed with `health: ready` and exact no-submit cleanup.
- Safety: no cookies, tokens, history, or private endpoints were read; no message was submitted. The app's manual catalog refresh remains the supported user-facing recovery path.

## ASSISTED-CONTROLS-004

- Status: resolved locally and package-verified on 2026-07-22.
- Risk addressed: deleting the wrong reviewed handoff, deleting a running or ambiguity-bearing workflow, or exposing raw audit details in the renderer.
- Resolution: exact typed identifiers, destructive confirmation, state/effect/reference guards, transactional child cleanup, durable audit preservation, and a bounded allowlisted log projection.
- Evidence: focused backend/renderer interaction tests, 255 full Vitest tests, fixture E2E, internal-beta UAT, Windows package, packaged/native-host smoke, and fixture-only packaged restart passed.
- Remaining boundary: no live ChatGPT submission or writable Codex run was needed or claimed.

## CHATGPT-DISCOVERY-OPEN-003

- Status: resolved locally; regression-covered and installed-verified.
- First observed: 2026-07-22
- Reproduction: click the desktop ChatGPT catalog action while no eligible rendered ChatGPT tab exists, or run an older installed desktop build whose renderer does not contain the current catalog flow.
- Expected: a manual refresh opens only the allowlisted ChatGPT home when needed, reads rendered sidebar anchors, and displays the exact title and canonical URL; background refresh must not open tabs.
- Root cause: the installed app was stale, and discovery had no explicit distinction between user-triggered recovery and timer polling. Multiple app launches could also run startup recovery concurrently.
- Resolution: add the typed `openIfNeeded` flag, bounded open/retry behavior, full canonical URL display, and an Electron single-instance lock; update the per-user installer and Desktop shortcut.
- Evidence: 248 Vitest tests, full fixture/build/package gates, installed renderer returned three titled canonical links, exact conversation selection, eight Codex projects, and five expanded thread titles; no ChatGPT submission occurred.
- Remaining boundary: authenticated ChatGPT submit and writable Codex execution still require their separate action-time approvals.
