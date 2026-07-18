# Research Log

## Codex SDK TypeScript integration

- Decision status: blocked live proof, interface retained.
- Official source: `https://learn.chatgpt.com/docs/codex-sdk.md`.
- Verified SDK version: `@openai/codex-sdk@0.144.5`.
- Stable documented flow: `new Codex()`, `startThread()`, `thread.run()`, `thread.id`, and `resumeThread()`.
- Local finding: the SDK launches its bundled Codex runtime, which still reads the user's Codex configuration unless isolated safely.
- Open question for Phase 3: whether isolated `CODEX_HOME` can retain authorized execution without copying, reading, or committing credentials.

## Extension transport

- Decision status: Native Messaging selected in ADR-0001; live permission and host registration are deferred.
- Constraints: no private ChatGPT API, no cookie/token access, runtime validation, authenticated local peer, replay resistance, and reconnect support.
- Official Chrome source: `https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging`.
- Official Chrome findings: exact non-wildcard `allowed_origins`, separate stdio host process, long-lived `connectNative()`, 1 MB host-to-extension messages, and 64 MiB extension-to-host messages.
- Official MV3 WebSocket source: `https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets`.
- WebSocket finding: Chrome 116+ supports service-worker WebSockets, but keepalive traffic is required inside the 30-second activity window.
- Official network source: `https://developer.chrome.com/docs/extensions/develop/concepts/network-requests`.
- Network finding: cross-origin extension network requests require host permission, so localhost HTTP/WebSocket would also broaden the manifest and add an open loopback listener.
- Official Electron sources: `https://www.electronjs.org/docs/latest/tutorial/ipc` and `https://www.electronjs.org/docs/latest/tutorial/context-isolation`.
- Electron finding: expose one filtered method per IPC message through preload; never expose raw `ipcRenderer`.
