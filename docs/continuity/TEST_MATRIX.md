# Test Matrix

| Area              | Test type                    | Command                         | Environment                   | Status                  | Last commit        |
| ----------------- | ---------------------------- | ------------------------------- | ----------------------------- | ----------------------- | ------------------ |
| Formatting        | automated                    | `pnpm.cmd run format:check`     | local Windows                 | pass                    | `87bd00f` baseline |
| Lint              | automated                    | `pnpm.cmd run lint`             | local Windows                 | pass                    | `87bd00f` baseline |
| TypeScript        | automated                    | `pnpm.cmd run typecheck`        | local Windows                 | pass                    | `87bd00f` baseline |
| Domain packages   | unit                         | `pnpm.cmd run test`             | local Windows                 | 24 pass                 | `b091234`          |
| Extension capture | fixture E2E                  | `pnpm.cmd run test:e2e`         | Chromium                      | 1 pass                  | `87bd00f` baseline |
| Workspace build   | automated                    | `pnpm.cmd run build`            | local Windows                 | pass                    | `87bd00f` baseline |
| State recovery    | unit                         | `pnpm.cmd run test`             | local/CI                      | 3 continuity tests pass | checkpoint         |
| Status helper     | integration                  | `pnpm.cmd status -- --json`     | local/CI                      | pass                    | checkpoint         |
| Portable scripts  | unit                         | `pnpm.cmd run test`             | local/CI                      | 2 pass                  | checkpoint         |
| GitHub Actions    | full verification            | workflow `Verify`               | Ubuntu, Node.js 24            | pass, no annotations    | `b091234`          |
| Codex SDK         | live authenticated read-only | `pnpm.cmd run test:codex-spike` | local Codex config            | blocked                 | `CODEX-SDK-001`    |
| ChatGPT selectors | live manual                  | documented manual smoke         | user-opened authenticated tab | not run                 | not implemented    |

Fixture and mock results never count as live integration evidence.
