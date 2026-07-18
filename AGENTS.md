# Codex Context Bridge Agent Guide

## Scope

- Preserve the product safety constraints in `docs/SECURITY.md`.
- Keep Phase 0-1 work separate from later workflow and automation features.
- Do not claim a live integration passed unless the command ran successfully in the current environment.

## Required checks

Use `pnpm.cmd` on Windows PowerShell:

```text
pnpm.cmd run format:check
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run test:e2e
pnpm.cmd run build
```

## Engineering rules

- TypeScript strict mode stays enabled.
- Validate handoffs at every trust boundary.
- Never read browser cookies, tokens, authorization headers, history, or credentials.
- Never ingest a file until path, symlink, exclusion, size, and secret checks pass.
- Every automatic or assisted data transfer requires an audit event.
- Low-confidence project matches must not be sent automatically.
