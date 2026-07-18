# Research Log

## Codex SDK TypeScript integration

- Decision status: blocked live proof, interface retained.
- Official source: `https://learn.chatgpt.com/docs/codex-sdk.md`.
- Verified SDK version: `@openai/codex-sdk@0.144.5`.
- Stable documented flow: `new Codex()`, `startThread()`, `thread.run()`, `thread.id`, and `resumeThread()`.
- Local finding: the SDK launches its bundled Codex runtime, which still reads the user's Codex configuration unless isolated safely.
- Open question for Phase 3: whether isolated `CODEX_HOME` can retain authorized execution without copying, reading, or committing credentials.

## Extension transport

- Decision status: not selected.
- Constraints: no private ChatGPT API, no cookie/token access, runtime validation, authenticated local peer, replay resistance, and reconnect support.
- Candidate decision must be recorded as an ADR before production transport work.
