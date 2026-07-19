# Research Log

## Structured Codex and ChatGPT control surfaces

- Decision status: accepted in ADR-0002.
- Official Codex sources: `https://learn.chatgpt.com/guides/best-practices.md` and `https://learn.chatgpt.com/docs/developer-commands?surface=cli`.
- Official findings: `codex exec` is the stable non-interactive surface, `codex mcp-server` is stable when another agent consumes Codex, and `codex app-server` remains experimental. The Codex guidance recommends MCP for external systems, skills for repeatable workflows, `AGENTS.md` for durable repository rules, and test-backed review gates.
- Project decision: retain the verified structured JSONL Codex adapter and keep `codex mcp-server` as a future adapter-compatible option. Do not move production orchestration onto the experimental app server.
- ChatGPT decision: keep exact-origin Native Messaging and rendered-DOM inspection. Windows Computer Use and screenshots are diagnostic/manual-acceptance tools only because they cannot always prove the active tab URL, account, workspace, or conversation.
- Recovery finding: storing only a conversation ID loses ChatGPT Project routes, while unscoped `page.inspect` can observe an unrelated active ChatGPT tab. Persist the canonical conversation pathname, bind inspect/status/capture to the exact destination, and fail closed when ChatGPT redirects the requested conversation to home.

## Codex SDK TypeScript integration

- Decision status: blocked live proof, interface retained.
- Official source: `https://learn.chatgpt.com/docs/codex-sdk.md`.
- Verified SDK version: `@openai/codex-sdk@0.144.5`.
- Stable documented flow: `new Codex()`, `startThread()`, `thread.run()`, `thread.id`, and `resumeThread()`.
- Local finding: the SDK launches its bundled Codex runtime, which still reads the user's Codex configuration unless isolated safely.
- Open question for Phase 3: whether isolated `CODEX_HOME` can retain authorized execution without copying, reading, or committing credentials.

## Extension transport

- Decision status: Native Messaging selected in ADR-0001; permission, exact-origin host registration, MV3 wake recovery, and installed Edge acceptance are complete.
- Constraints: no private ChatGPT API, no cookie/token access, runtime validation, authenticated local peer, replay resistance, and reconnect support.
- Official Chrome source: `https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging`.
- Official Chrome findings: exact non-wildcard `allowed_origins`, separate stdio host process, long-lived `connectNative()`, 1 MB host-to-extension messages, and 64 MiB extension-to-host messages.
- Official MV3 WebSocket source: `https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets`.
- WebSocket finding: Chrome 116+ supports service-worker WebSockets, but keepalive traffic is required inside the 30-second activity window.
- Official network source: `https://developer.chrome.com/docs/extensions/develop/concepts/network-requests`.
- Network finding: cross-origin extension network requests require host permission, so localhost HTTP/WebSocket would also broaden the manifest and add an open loopback listener.
- Official Electron sources: `https://www.electronjs.org/docs/latest/tutorial/ipc` and `https://www.electronjs.org/docs/latest/tutorial/context-isolation`.
- Electron finding: expose one filtered method per IPC message through preload; never expose raw `ipcRenderer`.
