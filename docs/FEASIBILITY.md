# Phase 0 Feasibility

## Environment

- Windows PowerShell in a local Git repository.
- Node.js 24.14.1 and pnpm 11.13.1 are available.
- PowerShell blocks `pnpm.ps1`; commands use `pnpm.cmd`.

## Codex SDK spike

`tests/spikes/codex-sdk-spike.ts` exercises the production adapter in read-only sandbox mode. It starts a
thread in the repository working directory, checks ordered structured lifecycle events and the final response,
proves a write is blocked, resumes the same structured thread ID, cancels a separate live turn, and verifies a
startup failure maps to `CODEX_START_FAILED` without exposing the external path.

Executed result on 2026-07-18: `PASSED`.

The original SDK call failed before `thread.started` because an inherited external model catalog was missing
`supports_reasoning_summaries`. The adapter now resolves the SDK-bundled Codex binary, exports its bundled model
catalog into a mode-restricted temporary directory, and passes that catalog as a per-process config override.
It does not modify external Codex configuration, credentials, or authentication. The runtime owns structured
JSONL stdio, exact child cancellation, bounded redacted errors, and temporary cleanup while forcing read-only
sandboxing, approval policy `never`, and disabled network/web search. `MockCodexAdapter` remains fixture-only.

## ChatGPT extension spike

The Manifest V3 extension is restricted to `https://chatgpt.com/*`. It captures visible title, optional project
label, and rendered messages; hashes normalized captured content; can scroll upward for a long chat; fills but
never submits composer text; reports streaming state; and locates a structured response marker.

Vitest proves the domain capture against jsdom, and Playwright opens a representative fixture in Chromium and
runs the real capture module. These tests do not prove current live ChatGPT selectors because that requires an
explicitly user-opened and selected authenticated tab.

Executed fixture result: `PASSED` on 2026-07-18. The full verification gate completed with 16 Vitest tests,
one Chromium Playwright test, strict type checking, ESLint, formatting, and all workspace builds passing.

## Stable versus DOM-dependent

Stable boundaries are the manifest permission scope, message protocol, hashing, no-send behavior, and data
shape. Conversation title, project label, message, composer, and streaming selectors are DOM-dependent and
isolated in `selectors.ts`. Selector drift must fail visibly rather than broaden permissions or inspect private
network/session data.
