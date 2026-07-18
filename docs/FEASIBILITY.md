# Phase 0 Feasibility

## Environment

- Windows PowerShell in a local Git repository.
- Node.js 24.14.1 and pnpm 11.13.1 are available.
- PowerShell blocks `pnpm.ps1`; commands use `pnpm.cmd`.

## Codex SDK spike

`tests/spikes/codex-sdk-spike.ts` uses `@openai/codex-sdk` server-side in read-only sandbox mode. It starts a
thread, runs a turn that reads only `package.json`, checks the final response, resumes by structured thread ID,
and runs a second turn. The result section below must be updated only from an executed command.

Executed result: `BLOCKED_BY_LOCAL_CODEX_CONFIG`.

The SDK process exited before `thread.started` because the configured catalog at
`C:\Users\a\.codex\9router-models.json` is incompatible with the bundled Codex runtime and lacks the required
`supports_reasoning_summaries` field. No file outside the repository was modified. The production integration
is therefore not claimed as working. `packages/codex-adapter` contains an explicitly named mock for domain and
consumer development until the local catalog is upgraded and this spike is rerun.

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
