import { z } from 'zod';

export const handoffEnvelopeSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    handoffId: z.string().min(1),
    parentHandoffId: z.string().min(1).optional(),
    correlationId: z.string().min(1),
    source: z.enum(['user', 'chatgpt', 'codex']),
    target: z.enum(['chatgpt', 'codex']),
    project: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      repoRoot: z.string().min(1).optional(),
      gitRemote: z.string().min(1).optional(),
      branch: z.string().min(1).optional(),
      confidence: z.number().min(0).max(1),
    }),
    destination: z
      .object({
        mode: z.enum(['existing-thread', 'new-thread']),
        conversationId: z.string().min(1).optional(),
        codexThreadId: z.string().min(1).optional(),
      })
      .superRefine((value, context) => {
        if (
          value.mode === 'existing-thread' &&
          value.conversationId === undefined &&
          value.codexThreadId === undefined
        ) {
          context.addIssue({
            code: 'custom',
            message: 'An existing destination requires a conversation or Codex thread ID.',
          });
        }
      }),
    objective: z.string().min(1),
    userInstructions: z.array(z.string()),
    constraints: z.array(z.string()),
    currentState: z.string(),
    completedWork: z.array(z.string()),
    unresolvedIssues: z.array(z.string()),
    attachments: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        path: z.string().min(1).optional(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        size: z.number().int().nonnegative(),
        mediaType: z.string().min(1).optional(),
        inclusionReason: z.string().min(1),
      }),
    ),
    expectedResponse: z.object({
      type: z.literal('analysis-and-codex-prompt'),
      schemaVersion: z.string().min(1),
    }),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type HandoffEnvelope = z.infer<typeof handoffEnvelopeSchema>;

export function validateHandoff(input: unknown): HandoffEnvelope {
  return handoffEnvelopeSchema.parse(input);
}

export const contextBridgeResponseSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    handoffId: z.string().min(1),
    correlationId: z.string().min(1),
    projectId: z.string().min(1),
    status: z.enum([
      'ready_for_codex',
      'requires_user_decision',
      'needs_more_context',
      'completed',
    ]),
    analysisSummary: z.string().min(1),
    codexPrompt: z.string().min(1).optional(),
    attachmentsRequested: z.array(z.string().min(1)),
    requiresUserDecision: z.boolean(),
    userDecisionQuestion: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'ready_for_codex' && !value.codexPrompt) {
      context.addIssue({ code: 'custom', message: 'A ready response requires codexPrompt.' });
    }
    if (value.status === 'requires_user_decision') {
      if (!value.requiresUserDecision || !value.userDecisionQuestion) {
        context.addIssue({
          code: 'custom',
          message: 'A decision response requires a question and decision flag.',
        });
      }
    } else if (value.requiresUserDecision) {
      context.addIssue({
        code: 'custom',
        message: 'requiresUserDecision must match requires_user_decision status.',
      });
    }
  });

export type ContextBridgeResponse = z.infer<typeof contextBridgeResponseSchema>;

export function validateContextBridgeResponse(input: unknown): ContextBridgeResponse {
  return contextBridgeResponseSchema.parse(input);
}

export const conversationSnapshotSchema = z
  .object({
    title: z.string().min(1),
    projectName: z.string().min(1).optional(),
    messages: z.array(
      z
        .object({
          role: z.string().min(1),
          text: z.string().min(1),
        })
        .strict(),
    ),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.iso.datetime(),
  })
  .strict();

export const structuredResponseErrorCodeSchema = z.enum([
  'MARKER_NOT_FOUND',
  'MARKER_UNCLOSED',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'SCHEMA_INVALID',
  'HANDOFF_ID_MISMATCH',
  'CORRELATION_ID_MISMATCH',
  'PROJECT_ID_MISMATCH',
  'DUPLICATE_RESPONSE',
]);

export const localTransportOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bridge.health') }).strict(),
  z.object({ type: z.literal('conversation.capture') }).strict(),
  z
    .object({
      type: z.literal('composer.insert'),
      text: z.string().min(1).max(100_000),
      approvalId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('page.status'),
      expectedHandoffId: z.string().min(1).optional(),
      expectedCorrelationId: z.string().min(1).optional(),
      expectedProjectId: z.string().min(1).optional(),
    })
    .strict(),
]);

export const localTransportRequestSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    requestId: z.string().min(16).max(128),
    nonce: z.string().min(16).max(128),
    capability: z.string().min(32).max(256),
    sentAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    operation: localTransportOperationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const sentAt = Date.parse(value.sentAt);
    const expiresAt = Date.parse(value.expiresAt);
    if (expiresAt <= sentAt || expiresAt - sentAt > 60_000) {
      context.addIssue({
        code: 'custom',
        message: 'Transport request expiry must be within 60 seconds after sentAt.',
      });
    }
  });

const structuredResponseResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), response: contextBridgeResponseSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({ code: structuredResponseErrorCodeSchema, message: z.string().min(1) })
        .strict(),
    })
    .strict(),
]);

export const localTransportResultSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('bridge.health.result'),
      status: z.enum(['ready', 'degraded']),
    })
    .strict(),
  z
    .object({
      type: z.literal('conversation.capture.result'),
      snapshot: conversationSnapshotSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('composer.insert.result'),
      inserted: z.boolean(),
      sent: z.literal(false),
    })
    .strict(),
  z
    .object({
      type: z.literal('page.status.result'),
      streaming: z.boolean(),
      structuredResponse: structuredResponseResultSchema,
    })
    .strict(),
]);

export const localTransportErrorCodeSchema = z.enum([
  'SCHEMA_INVALID',
  'PAYLOAD_TOO_LARGE',
  'AUTHENTICATION_FAILED',
  'REQUEST_EXPIRED',
  'REQUEST_REPLAYED',
  'RATE_LIMITED',
  'REQUEST_TIMEOUT',
  'TRANSPORT_DISCONNECTED',
  'INTERNAL_ERROR',
]);

export const localTransportResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      protocolVersion: z.literal('1.0'),
      requestId: z.string().min(1),
      ok: z.literal(true),
      result: localTransportResultSchema,
    })
    .strict(),
  z
    .object({
      protocolVersion: z.literal('1.0'),
      requestId: z.string().min(1),
      ok: z.literal(false),
      error: z
        .object({
          code: localTransportErrorCodeSchema,
          message: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
]);

export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>;
export type LocalTransportOperation = z.infer<typeof localTransportOperationSchema>;
export type LocalTransportRequest = z.infer<typeof localTransportRequestSchema>;
export type LocalTransportResult = z.infer<typeof localTransportResultSchema>;
export type LocalTransportResponse = z.infer<typeof localTransportResponseSchema>;

export const projectEvidenceSchema = z
  .object({
    type: z.enum(['git-remote', 'repo-root', 'project-name', 'repository-marker', 'agents-hash']),
    value: z.string().min(1),
    score: z.number().min(0).max(1),
  })
  .strict();

export type ProjectEvidence = z.infer<typeof projectEvidenceSchema>;

export interface ProjectDetectionResult {
  projectId?: string;
  ambiguousProjectIds?: string[];
  confidence: number;
  evidence: ProjectEvidence[];
  requiresConfirmation: boolean;
}

export interface RepositoryFingerprintInput {
  gitRemote?: string;
  repoRoot: string;
  projectName?: string;
  repositoryMarker?: string;
  agentsHash?: string;
}
