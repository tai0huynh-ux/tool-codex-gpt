---
name: context-bridge-checkpoint
description: Safely close and publish a Codex Context Bridge checkpoint. Use after an independently valuable code, test, documentation, migration, integration, or blocker checkpoint is ready for verification, continuity updates, commit, push, and remote hash confirmation.
---

# Context Bridge Checkpoint

## Recover first

1. Read `AGENTS.md`, `docs/continuity/STATUS.md`, `docs/continuity/RECOVERY.md`, and `.agent-state/state.json`.
2. Verify repository root, clean/expected changes, branch, remote, HEAD, and `origin/main`.
3. Fetch `origin` and stop publication if local `main` is behind or diverged.

## Close the checkpoint

1. Review the complete diff and security impact.
2. Run targeted tests, then the full relevant gate from `AGENTS.md`.
3. Update STATUS, ROADMAP, RECOVERY, TEST_MATRIX, BLOCKERS, WORKLOG, and state when affected.
4. Keep the exact next action concrete and restartable.
5. Run `pnpm status` and validate `.agent-state/state.json` through the test suite.

## Publish safely

1. Run `git status --short`, `git diff --check`, and review `git diff`.
2. Stage only intended files and inspect the cached diff and statistics.
3. Commit with an atomic Conventional Commit message.
4. Fetch again and confirm local is not behind or diverged.
5. Push to `origin main` without force.
6. Fetch and verify `HEAD` equals `origin/main`.
7. Report verification, commit hash, push result, blockers, and exact next action.

Never publish failing code, secrets, unrelated changes, generated noise, or an unverified live-integration claim.
