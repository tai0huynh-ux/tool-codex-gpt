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

Version 1.0 requests `analysis-and-codex-prompt`. A future ChatGPT adapter must locate the structured marker,
parse the response schema, reject invalid output, and require review before forwarding a prompt to Codex.
