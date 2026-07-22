# Codex Context Bridge

Codex Context Bridge is a local-first desktop project for coordinating repository-scoped context between ChatGPT and Codex. The repository currently provides a strict TypeScript foundation, project identity, SQLite persistence, validated handoffs, file safety, an MV3 capture extension, an Electron shell, and a mock-only Codex adapter.

## Safety boundary

- The extension is limited to user-opened `https://chatgpt.com/*` tabs.
- It does not read cookies, session tokens, authorization headers, browser history, or private ChatGPT APIs.
- Assisted mode requires review and approval before sending.
- Repository files pass canonical path, symlink, exclusion, size, secret, hash, and audit checks before ingestion.
- Fixture and mock tests are never reported as live integration evidence.

See `docs/SECURITY.md` and `docs/continuity/STATUS.md` for the current verified state.

Vietnamese visual walkthrough: `docs/user/VISUAL_GUIDE_CHAT_PROJECT.md`.

## Requirements

- Node.js `>=20.19` (CI uses Node.js 24).
- pnpm `11.13.1` from the root `packageManager` field.
- Git.
- Chromium installed through Playwright for browser fixture tests.

## Setup

Windows PowerShell:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd exec playwright install chromium
pnpm.cmd run verify
```

Linux or macOS:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run verify
```

Package scripts are cross-platform. `pnpm.cmd` is used only at the interactive Windows PowerShell boundary because local execution policy can block `pnpm.ps1`.

## Useful commands

```text
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:e2e
pnpm run build
pnpm migrations:check
pnpm migrations:generate
pnpm status -- --json
```

On Windows PowerShell, invoke the same commands with `pnpm.cmd`.

The initial SQLite migration in `packages/database/migrations/0001_initial.sql` is canonical. After editing it, regenerate the bundled runtime module before verification.

## Live integration

Live tests are intentionally separate from CI:

```text
pnpm run test:codex-spike
```

The current Codex SDK spike is blocked by an incompatible external model catalog. See `docs/FEASIBILITY.md` and `docs/continuity/BLOCKERS.md`. Do not edit user credentials or external Codex configuration to bypass this blocker.

## Repository layout

- `apps/desktop`: Electron, React, and Vite desktop shell.
- `apps/chatgpt-extension`: MV3 rendered-conversation capture spike.
- `packages`: contracts, database, project identity, file safety, secret scanning, and Codex adapter boundary.
- `docs/continuity`: current status, roadmap, recovery, blockers, worklog, and test matrix.
- `.agent-state`: validated machine-readable recovery state.
- `.agents/skills`: repeatable checkpoint and debugging procedures.

Start a new maintenance session by reading `AGENTS.md` and `docs/continuity/RECOVERY.md`, then verify repository state with `pnpm status`.
