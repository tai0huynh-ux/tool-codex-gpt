# Recovery and Retry

- Restart the desktop app; persisted workflows, events, approvals, effects, receipts, and mappings are reconstructed from SQLite.
- Reload the Edge extension, then reload the selected ChatGPT tab if the service worker is unavailable.
- Retry only a step reported as safe. A prepared effect may dispatch once; a `dispatching` effect requires confirmation and is never resent automatically.
- Cancellation preserves recovery state. Exact composer cleanup occurs only when the inserted text hash still matches.
- Review the workflow timeline, audit summary, and redacted diagnostics before deciding whether an external action happened.

Never repeat a ChatGPT or Codex send solely because the UI was interrupted. Confirm downstream state first.
