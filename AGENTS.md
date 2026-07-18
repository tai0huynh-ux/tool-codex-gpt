# Codex Context Bridge Agent Guide

## Scope

- Preserve the product safety constraints in `docs/SECURITY.md`.
- Do not claim a live integration passed unless the command ran successfully in the current environment.
- At session start, read `docs/continuity/RECOVERY.md`, `docs/continuity/STATUS.md`, `.agent-state/state.json`, and verify them against Git.
- Follow `docs/continuity/ROADMAP.md`; do not rely on chat history as project state.

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

## Repository publication

- The canonical GitHub repository is `https://github.com/tai0huynh-ux/tool-codex-gpt.git`.
- `main` is the publication branch and must track `origin/main`.
- After every completed task that changes repository files, run the relevant verification checks, commit the intended changes with a descriptive message, and push them to `origin/main`.
- Before pushing, fetch the remote and stop if local `main` is behind or has diverged from `origin/main`.
- Never use force push, destructive reset, or history rewriting unless the user explicitly authorizes it.
- Report the commit hash, verification result, and push result at task completion.

## Project skills

- Use `.agents/skills/context-bridge-checkpoint/SKILL.md` when closing and publishing a checkpoint.
- Use `.agents/skills/context-bridge-debugging/SKILL.md` when reproducing or fixing a defect.
