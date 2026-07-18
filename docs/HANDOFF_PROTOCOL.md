# Handoff Protocol 1.0

The canonical runtime schema is `packages/contracts/src/index.ts`; the interoperable JSON Schema is
`schemas/handoff-envelope.v1.json`. Producers validate before persistence or preview. Consumers validate
again before acting. Unknown fields are rejected.

## Identity and lineage

`handoffId` identifies one envelope. `parentHandoffId` links revisions. `correlationId` groups a workflow
without permitting duplicate execution. Source and target are explicit and never inferred from prose.

## Destination safety

`existing-thread` requires a ChatGPT conversation ID or Codex thread ID. `new-thread` deliberately omits an
existing identifier. A destination selection is valid only when the mapped project and repository fingerprint
also pass confidence policy.

## Attachments

Each attachment records SHA-256, size, name, and inclusion reason. A path is local metadata, not authority to
read a file. The file-store security pipeline must independently approve it.

## Response contract

Version 1.0 requests `analysis-and-codex-prompt`. ChatGPT responses use the paired markers
`<CONTEXT_BRIDGE_RESPONSE>` and `</CONTEXT_BRIDGE_RESPONSE>`. The canonical runtime schema is
`contextBridgeResponseSchema`; the interoperable schema is `schemas/context-bridge-response.v1.json`.
Consumers select the latest opening marker and require its matching closing marker, enforce a payload bound,
validate identity and duplicate state, and require review before forwarding `codexPrompt` to Codex.

## Assisted ChatGPT delivery

The reviewed request preview uses `schemas/assisted-chatgpt-preview.v1.json` and wraps the validated handoff plus context pack between `<CONTEXT_BRIDGE_HANDOFF>` markers. Its workflow, project, handoff, correlation, destination, text hash, and lineage hash are fixed before a single-use approval is issued. Composer insertion reports `sent: false`; only a later rendered capture of the matching user message after streaming stops acknowledges the workflow send effect.
