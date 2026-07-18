# Codex Handoff

1. Confirm the project and repository fingerprint.
2. Build and review the context pack, omitted files, blocked files, and budgets.
3. Choose an existing mapped thread, a new thread, or an explicitly configured worktree provider.
4. Review the exact prompt and destination.
5. Grant the scoped single-use approval only when the preview is correct.

The approval binds workflow, project, operation, destination, and payload hash. Existing threads must already be mapped to the same project and repository. New threads are persisted after acknowledgement. Ambiguous external failures remain `confirmation_required` and are not retried automatically.
