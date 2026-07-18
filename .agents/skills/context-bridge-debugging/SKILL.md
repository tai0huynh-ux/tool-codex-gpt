---
name: context-bridge-debugging
description: Reproduce, isolate, fix, and verify Codex Context Bridge defects. Use for failing tests, runtime regressions, security findings, lifecycle event loss, database or migration failures, extension DOM issues, IPC errors, and integration blockers that need evidence-based root-cause analysis.
---

# Context Bridge Debugging

## Establish evidence

1. Recover repository state from Git and continuity files.
2. Record expected behavior, actual behavior, exact reproduction, environment, and affected boundary.
3. Classify severity using `docs/continuity/BLOCKERS.md` and the project security model.
4. Reduce the failure to the smallest targeted command or fixture.

## Fix the cause

1. Trace data and state across the failing boundary; do not infer control state from message text.
2. Write a regression test that fails for the demonstrated defect.
3. Implement the smallest compatible fix without weakening types, lint, tests, permissions, or validation.
4. Preserve user changes and avoid destructive Git operations.
5. After two failed approaches, stop varying code blindly and revisit the root-cause hypothesis.

## Verify and record

1. Run the regression test, adjacent package tests, and full relevant gates.
2. Review security, persistence, cancellation, idempotency, and error-code effects where applicable.
3. Update continuity docs with the failure, root cause, fix, remaining risk, and exact next action.
4. Close the work with `$context-bridge-checkpoint` when the fix is independently valid.

Never delete a valid failing test, hide an error with a mock in a production path, or claim a live integration passed from fixture evidence.
