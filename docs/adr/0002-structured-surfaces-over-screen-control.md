# ADR-0002: Structured Surfaces Over Screen Control

- Status: Accepted
- Date: 2026-07-20
- Owners: Codex Context Bridge maintainers

## Context

The desktop bridge coordinates a user-selected ChatGPT conversation and a repository-bound Codex run. Windows screen automation can observe a browser window, but it cannot always prove the active tab URL, account, workspace, or exact conversation. Treating pixels, window titles, or focus as routing identity would allow wrong-tab sends and would make recovery dependent on browser layout.

The current Codex manual documents `codex exec` as the stable non-interactive JSONL surface, `codex mcp-server` as the stable surface when another agent consumes Codex, and `codex app-server` as experimental. The manual also recommends MCP for external systems, skills for reusable workflows, `AGENTS.md` for repository rules, and tests for acceptance.

## Decision

- Keep the production Codex adapter on its validated structured JSONL lifecycle. Evaluate `codex mcp-server` as a future adapter only behind the existing `CodexAdapter` contract; do not replace a passing production boundary with the experimental app server.
- Keep ChatGPT runtime access on the exact-origin MV3 extension and Native Messaging boundary selected by ADR-0001. Read rendered DOM only; never read browser profiles, cookies, tokens, headers, history, storage, or private endpoints.
- Never use Computer Use, screenshots, window titles, focus, or coordinates as production routing evidence. They are allowed only for bounded diagnostics and manual acceptance.
- Bind every existing ChatGPT destination to both its conversation ID and, when observed, its canonical pathname. Preserve project routes such as `/g/<project>/c/<conversation>` and validate that the pathname ends in the same conversation ID.
- Pass the destination into inspect, streaming, capture, reload, insert, submit, and response-status operations. An unrelated active ChatGPT tab must never satisfy an exact destination check.
- If an exact conversation cannot be restored while Native Messaging remains connected, fail closed with `CHATGPT_CONVERSATION_UNAVAILABLE`. Do not continue on the home/new-chat page and do not reopen indefinitely.

## Alternatives

| Option                                                  | Result                                                           | Decision          |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ----------------- |
| Windows screen automation as the runtime                | Cannot reliably prove URL/account/workspace; layout dependent    | Rejected          |
| Browser profile or storage inspection                   | Would expose credentials and private browser state               | Forbidden         |
| ChatGPT private endpoints                               | Unsupported and would weaken the security model                  | Forbidden         |
| Codex experimental app server                           | Useful for development, but not the accepted production boundary | Deferred          |
| Codex MCP server behind the adapter contract            | Structured and stable according to the Codex manual              | Future-compatible |
| Existing structured Codex adapter plus Native Messaging | Already isolated, tested, auditable, and repository-bound        | Selected          |

## Security Impact

- Wrong-tab inspection and sends fail closed.
- A ChatGPT Project path cannot be substituted for a different conversation ID.
- Redirects to the ChatGPT home page are reported as unavailable instead of being treated as the selected conversation.
- No new browser permissions, network listeners, credentials, or renderer privileges are added.

## Compatibility Impact

- Existing persisted pilots without a canonical pathname remain valid and use `/c/<conversationId>` until an exact rendered project path is observed.
- New and successfully re-inspected pilots retain the canonical pathname automatically.
- Older extension results without `conversationPath` remain accepted during upgrade.

## Validation

- Contract tests reject mismatched conversation IDs and paths.
- Extension tests prove destination-bound inspection and project-path recognition.
- Desktop recovery tests prove canonical project reopening, bounded retries, and explicit unavailable errors.
- Pilot tests prove legacy destinations acquire the observed canonical path without changing project or conversation identity.

## Consequences

The application remains local-first and deterministic. Screen-control policy failures no longer affect production behavior. Future Codex transport experiments must preserve the existing adapter lifecycle, sandbox, approval, audit, and repository-identity contracts.
