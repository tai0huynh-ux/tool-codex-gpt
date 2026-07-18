# Blockers

## CODEX-SDK-001

- Status: active
- First observed: 2026-07-18
- Last verified: 2026-07-18
- Affected phase: Phase 3 production Codex integration
- Reproduction: run `pnpm.cmd run test:codex-spike`
- Expected: structured `thread.started`, read-only final response, and resumed second turn
- Actual: SDK process exits before `thread.started`
- Root cause: external `model_catalog_json` is missing the SDK-required `supports_reasoning_summaries` field
- Evidence: `docs/FEASIBILITY.md` and the live command failure from SDK `0.144.5`
- Attempts: verified current official SDK shape and inspected supported SDK config overrides
- Unsafe actions avoided: did not edit external catalog, credentials, Codex home, or user authentication
- Workarounds: keep `MockCodexAdapter` explicitly mock-only; separate live tests from CI
- Independent work available: all phases through contract, capture, persistence, UI, fixture E2E, security, and packaging preparation
- Resolution condition: a safe isolated Codex configuration starts and resumes a read-only SDK thread with structured lifecycle evidence
