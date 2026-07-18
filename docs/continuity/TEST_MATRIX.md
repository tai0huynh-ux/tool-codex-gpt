# Test Matrix

| Area               | Test type                     | Command                         | Environment                   | Status                  | Last commit        |
| ------------------ | ----------------------------- | ------------------------------- | ----------------------------- | ----------------------- | ------------------ |
| Formatting         | automated                     | `pnpm.cmd run format:check`     | local Windows                 | pass                    | `87bd00f` baseline |
| Lint               | automated                     | `pnpm.cmd run lint`             | local Windows                 | pass                    | `87bd00f` baseline |
| TypeScript         | automated                     | `pnpm.cmd run typecheck`        | local Windows                 | pass                    | `87bd00f` baseline |
| Domain packages    | unit                          | `pnpm.cmd run test`             | local Windows                 | 124 pass                | checkpoint         |
| Extension capture  | virtualized fixture E2E       | `pnpm.cmd run test:e2e`         | Chromium                      | 1 pass                  | checkpoint         |
| Assisted composer  | no-submit/clear fixture E2E   | `pnpm.cmd run test:e2e`         | Chromium                      | 1 pass                  | checkpoint         |
| Workspace build    | automated                     | `pnpm.cmd run build`            | local Windows                 | pass                    | `87bd00f` baseline |
| State recovery     | unit                          | `pnpm.cmd run test`             | local/CI                      | 3 continuity tests pass | checkpoint         |
| Status helper      | integration                   | `pnpm.cmd status -- --json`     | local/CI                      | pass                    | checkpoint         |
| Portable scripts   | unit                          | `pnpm.cmd run test`             | local/CI                      | 2 pass                  | checkpoint         |
| GitHub Actions     | full verification             | workflow `Verify`               | Ubuntu, Node.js 24            | pass, no annotations    | `8f98ad3`          |
| Migration parity   | generation and runtime        | `pnpm.cmd migrations:check`     | local/CI/package entry points | 6 migration tests pass  | checkpoint         |
| Project registry   | persistence and lifecycle     | `pnpm.cmd run test`             | SQLite memory database        | 3 tests pass            | checkpoint         |
| Project detection  | identity and ambiguity        | `pnpm.cmd run test`             | local/CI                      | 5 tests pass            | checkpoint         |
| Codex lifecycle    | mock contract                 | `pnpm.cmd run test`             | local/CI                      | 6 lifecycle tests pass  | checkpoint         |
| Composer editing   | controlled DOM unit           | `pnpm.cmd run test`             | jsdom                         | 4 tests pass            | checkpoint         |
| Response parsing   | schema and boundary unit      | `pnpm.cmd run test`             | jsdom/contracts               | 8 tests pass            | checkpoint         |
| Native transport   | auth/framing/replay/rate unit | `pnpm.cmd run test`             | local Windows                 | 6 tests pass            | checkpoint         |
| Extension client   | reconnect/timeout unit        | `pnpm.cmd run test`             | local Windows                 | 3 tests pass            | checkpoint         |
| Electron IPC       | sender/schema/timeout unit    | `pnpm.cmd run test`             | local Windows                 | 3 tests pass            | checkpoint         |
| Project IPC        | sender/schema/persistence     | `pnpm.cmd run test`             | SQLite memory and file        | 4 tests pass            | checkpoint         |
| Project renderer   | ambiguity and exact inputs    | `pnpm.cmd run test`             | jsdom                         | 2 tests pass            | checkpoint         |
| Desktop layout     | responsive visual smoke       | local Playwright screenshot     | Chromium 1440px and 390px     | inspected               | checkpoint         |
| Context contract   | Zod and JSON Schema parity    | `pnpm.cmd run test`             | local/CI                      | 1 contract test pass    | checkpoint         |
| Context builder    | safety/ranking/budget preview | `pnpm.cmd run test`             | local/CI and temporary files  | 6 tests pass            | checkpoint         |
| Memory migration   | v2 to v3 preservation         | `pnpm.cmd run test`             | SQLite memory database        | 1 upgrade test pass     | checkpoint         |
| Memory contract    | Zod and JSON Schema           | `pnpm.cmd run test`             | local/CI                      | 2 contract tests pass   | checkpoint         |
| Memory engine      | lifecycle/retrieval/bootstrap | `pnpm.cmd run test`             | SQLite memory and file        | 8 tests pass            | checkpoint         |
| Workflow migration | v3 to v4 preservation         | `pnpm.cmd run test`             | SQLite memory database        | 1 upgrade test passes   | checkpoint         |
| Workflow contract  | Zod and JSON Schema           | `pnpm.cmd run test`             | local/CI                      | 2 contract tests pass   | checkpoint         |
| Workflow engine    | transition/approval/recovery  | `pnpm.cmd run test`             | SQLite memory and file        | 19 tests pass           | checkpoint         |
| Assisted contract  | preview/page operation schema | `pnpm.cmd run test`             | local/CI                      | 4 tests pass            | checkpoint         |
| Assisted handoff   | destination/send/confirmation | `pnpm.cmd run test`             | SQLite and browser adapters   | 10 tests pass           | checkpoint         |
| Codex SDK          | live authenticated read-only  | `pnpm.cmd run test:codex-spike` | local Codex config            | blocked                 | `CODEX-SDK-001`    |
| ChatGPT selectors  | live manual                   | documented manual smoke         | user-opened authenticated tab | not run                 | not implemented    |

Fixture and mock results never count as live integration evidence.
