import { z } from 'zod';

export const NATIVE_MESSAGING_HOST_NAME = 'com.codex_context_bridge.host';
export const NATIVE_MESSAGING_EXTENSION_ID = 'ccchffnkidpolmnnlonbnakjjmphfdjp';
export const CHATGPT_CONTENT_VERSION = '1.0';

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

const CHATGPT_ORIGIN = 'https://chatgpt.com';

export function chatGptConversationIdFromPath(path: string): string | undefined {
  try {
    if (!path.startsWith('/')) return undefined;
    const parsed = new URL(path, CHATGPT_ORIGIN);
    if (
      parsed.origin !== CHATGPT_ORIGIN ||
      parsed.pathname !== path ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const conversationMarker = segments.lastIndexOf('c');
    return conversationMarker >= 0 && conversationMarker === segments.length - 2
      ? segments[conversationMarker + 1]
      : undefined;
  } catch {
    return undefined;
  }
}

export const chatGptConversationPathSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine((value) => chatGptConversationIdFromPath(value) !== undefined, {
    message: 'Invalid ChatGPT conversation path.',
  });

export const chatGptDestinationSchema = z
  .discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('existing'),
        conversationId: z.string().min(1),
        conversationPath: chatGptConversationPathSchema.optional(),
      })
      .strict(),
    z.object({ mode: z.literal('new') }).strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.mode === 'existing' &&
      value.conversationPath &&
      chatGptConversationIdFromPath(value.conversationPath) !== value.conversationId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['conversationPath'],
        message: 'ChatGPT conversation path does not match the conversation ID.',
      });
    }
  });

export const chatGptPageIdentitySchema = z
  .discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('existing'),
        conversationId: z.string().min(1),
        conversationPath: chatGptConversationPathSchema.optional(),
      })
      .strict(),
    z.object({ mode: z.literal('new') }).strict(),
    z.object({ mode: z.literal('unsupported') }).strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.mode === 'existing' &&
      value.conversationPath &&
      chatGptConversationIdFromPath(value.conversationPath) !== value.conversationId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['conversationPath'],
        message: 'ChatGPT page path does not match the conversation ID.',
      });
    }
  });

export const chatGptPageInspectionSchema = z
  .object({
    page: chatGptPageIdentitySchema,
    composer: z
      .object({
        available: z.boolean(),
        readOnly: z.boolean(),
        textHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict(),
  })
  .strict();

export const chatGptRenderedConversationSchema = z
  .object({
    conversationId: z.string().min(1).max(512),
    conversationPath: chatGptConversationPathSchema,
    title: z.string().min(1).max(300),
    projectId: z.string().min(1).max(512).optional(),
    projectName: z.string().min(1).max(300).optional(),
    current: z.boolean(),
  })
  .strict();

export const chatGptRenderedCatalogSchema = z
  .object({
    conversations: z.array(chatGptRenderedConversationSchema).max(200),
    capturedAt: z.iso.datetime(),
    truncated: z.boolean(),
  })
  .strict();

export const localTransportOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('bridge.health'),
      // Omitted only for compatibility with extension builds published before
      // the rendered-content version handshake was introduced.
      contentVersion: z.literal(CHATGPT_CONTENT_VERSION).optional(),
    })
    .strict(),
  z.object({ type: z.literal('conversation.discover') }).strict(),
  z
    .object({
      type: z.literal('conversation.capture'),
      destination: chatGptDestinationSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('composer.insert'),
      text: z.string().min(1).max(100_000),
      effectId: z.string().min(1),
      payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
      destination: chatGptDestinationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('composer.submit'),
      effectId: z.string().min(1).max(256),
      expectedTextHash: z.string().regex(/^[a-f0-9]{64}$/),
      destination: chatGptDestinationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('page.inspect'),
      destination: chatGptDestinationSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('page.reload'),
      destination: chatGptDestinationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('composer.clear'),
      effectId: z.string().min(1),
      expectedTextHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('page.status'),
      destination: chatGptDestinationSchema.optional(),
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

// The native host authenticates desktop requests before forwarding an operation to the
// exact extension origin. Capabilities must never cross into the browser process.
export const extensionTransportRequestSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    requestId: z.string().min(16).max(128),
    nonce: z.string().min(16).max(128),
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
      type: z.literal('conversation.discover.result'),
      catalog: chatGptRenderedCatalogSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('bridge.health.result'),
      status: z.enum(['ready', 'degraded']),
      contentVersion: z.literal(CHATGPT_CONTENT_VERSION).optional(),
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
      textHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('composer.submit.result'),
      submitted: z.boolean(),
      textHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      code: z
        .enum([
          'COMPOSER_UNAVAILABLE',
          'COMPOSER_READ_ONLY',
          'DESTINATION_MISMATCH',
          'STREAMING',
          'HASH_MISMATCH',
          'SUBMIT_DISABLED',
          'DUPLICATE_EFFECT',
        ])
        .optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.submitted && !value.textHash) {
        context.addIssue({ code: 'custom', message: 'Submitted composer requires textHash.' });
      }
      if (!value.submitted && !value.code) {
        context.addIssue({ code: 'custom', message: 'Rejected composer submit requires code.' });
      }
    }),
  z
    .object({
      type: z.literal('page.inspect.result'),
      inspection: chatGptPageInspectionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('page.reload.result'),
      reloaded: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('composer.clear.result'),
      cleared: z.boolean(),
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
export type ChatGptDestination = z.infer<typeof chatGptDestinationSchema>;
export type ChatGptPageIdentity = z.infer<typeof chatGptPageIdentitySchema>;
export type ChatGptPageInspection = z.infer<typeof chatGptPageInspectionSchema>;
export type ChatGptRenderedConversation = z.infer<typeof chatGptRenderedConversationSchema>;
export type ChatGptRenderedCatalog = z.infer<typeof chatGptRenderedCatalogSchema>;
export type LocalTransportOperation = z.infer<typeof localTransportOperationSchema>;
export type LocalTransportRequest = z.infer<typeof localTransportRequestSchema>;
export type ExtensionTransportRequest = z.infer<typeof extensionTransportRequestSchema>;
export type LocalTransportResult = z.infer<typeof localTransportResultSchema>;
export type LocalTransportErrorCode = z.infer<typeof localTransportErrorCodeSchema>;
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

export const contextPackBudgetProfileSchema = z
  .object({
    maxFiles: z.number().int().positive(),
    maxTotalBytes: z.number().int().positive(),
    maxSingleFileBytes: z.number().int().positive(),
    maxEstimatedTokens: z.number().int().positive(),
    preferFullFilesBelow: z.number().int().nonnegative(),
    excerptLineWindow: z.number().int().positive(),
  })
  .strict();

export const contextPackAttachmentSchema = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceSize: z.number().int().nonnegative(),
    attachedBytes: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
    mode: z.enum(['full', 'excerpt', 'diff']),
    content: z.string(),
    inclusionReason: z.string().min(1),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
  })
  .strict();

export const contextPackManifestEntrySchema = z
  .object({
    path: z.string().min(1),
    previousPath: z.string().min(1).optional(),
    change: z.enum(['added', 'modified', 'renamed', 'deleted', 'unchanged']),
    status: z.enum(['attached', 'manifest-only', 'blocked', 'deleted', 'deduplicated']),
    score: z.number(),
    reason: z.string().min(1),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    size: z.number().int().nonnegative().optional(),
  })
  .strict();

export const contextPackSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    id: z.string().min(1),
    createdAt: z.iso.datetime(),
    objective: z.string().min(1),
    project: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        repositoryRoot: z.string().min(1),
        confidence: z.number().min(0).max(1),
      })
      .strict(),
    repositoryEvidence: z.array(projectEvidenceSchema),
    codexThreadId: z.string().min(1).optional(),
    codexFinalResponse: z.string(),
    completedWork: z.array(z.string()),
    changedFiles: z.array(z.string().min(1)),
    gitDiffSummary: z.string(),
    verificationResults: z.array(
      z
        .object({
          command: z.string().min(1),
          status: z.enum(['passed', 'failed', 'blocked', 'not-run']),
          summary: z.string(),
        })
        .strict(),
    ),
    knownFailures: z.array(z.string()),
    openQuestions: z.array(z.string()),
    relevantMemories: z.array(z.string()),
    attachments: z.array(contextPackAttachmentSchema),
    attachmentManifest: z.array(contextPackManifestEntrySchema),
    budget: z
      .object({
        profile: contextPackBudgetProfileSchema,
        usedFiles: z.number().int().nonnegative(),
        totalBytes: z.number().int().nonnegative(),
        estimatedTokens: z.number().int().nonnegative(),
      })
      .strict(),
    expectedChatGptResponse: z
      .object({
        type: z.literal('analysis-and-codex-prompt'),
        schemaVersion: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ContextPackBudgetProfile = z.infer<typeof contextPackBudgetProfileSchema>;
export type ContextPack = z.infer<typeof contextPackSchema>;

export function validateContextPack(input: unknown): ContextPack {
  return contextPackSchema.parse(input);
}

export const assistedChatGptPreviewSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    workflowRunId: z.string().min(1),
    projectId: z.string().min(1),
    handoffId: z.string().min(1),
    correlationId: z.string().min(1),
    destination: chatGptDestinationSchema,
    text: z.string().min(1).max(100_000),
    textHash: z.string().regex(/^[a-f0-9]{64}$/),
    handoffHash: z.string().regex(/^[a-f0-9]{64}$/),
    characterCount: z.number().int().positive().max(100_000),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.characterCount !== value.text.length) {
      context.addIssue({ code: 'custom', message: 'Preview character count must match text.' });
    }
  });

export type AssistedChatGptPreview = z.infer<typeof assistedChatGptPreviewSchema>;

export const codexDestinationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing-thread'), threadMappingId: z.string().min(1) }).strict(),
  z.object({ mode: z.literal('new-thread'), repositoryId: z.string().min(1) }).strict(),
  z
    .object({
      mode: z.literal('new-worktree'),
      repositoryId: z.string().min(1),
      worktreeName: z.string().min(1).max(128),
    })
    .strict(),
]);

export const codexRoutePreviewSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    receiptId: z.string().min(1),
    workflowRunId: z.string().min(1),
    handoffId: z.string().min(1),
    correlationId: z.string().min(1),
    projectId: z.string().min(1),
    codexPrompt: z.string().min(1).max(100_000),
    promptHash: z.string().regex(/^[a-f0-9]{64}$/),
    responseHash: z.string().regex(/^[a-f0-9]{64}$/),
    destination: codexDestinationSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export type CodexDestination = z.infer<typeof codexDestinationSchema>;
export type CodexRoutePreview = z.infer<typeof codexRoutePreviewSchema>;

export const memoryScopeSchema = z.enum(['global', 'team', 'project', 'conversation', 'workflow']);
export const memoryStatusSchema = z.enum(['candidate', 'approved', 'superseded', 'deleted']);
export const memoryCategorySchema = z.enum([
  'preference',
  'rule',
  'architecture',
  'decision',
  'known_issue',
  'workflow',
  'fact',
]);
export const memorySourceSchema = z
  .object({
    type: z.enum(['user', 'conversation', 'codex', 'file', 'workflow', 'system']),
    id: z.string().min(1),
  })
  .strict();

export const memoryRecordSchema = z
  .object({
    id: z.string().min(1),
    scope: memoryScopeSchema,
    scopeId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    category: memoryCategorySchema,
    content: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    confidence: z.number().min(0).max(1),
    status: memoryStatusSchema,
    sources: z.array(memorySourceSchema).min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    supersededBy: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === 'global' && value.scopeId !== undefined) {
      context.addIssue({ code: 'custom', message: 'Global memory cannot have scopeId.' });
    }
    if (value.scope !== 'global' && value.scopeId === undefined) {
      context.addIssue({ code: 'custom', message: 'Scoped memory requires scopeId.' });
    }
    if (['global', 'team'].includes(value.scope) && value.projectId !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Global and team memory cannot have projectId.',
      });
    }
    if (
      ['project', 'conversation', 'workflow'].includes(value.scope) &&
      value.projectId === undefined
    ) {
      context.addIssue({ code: 'custom', message: 'Project-bound memory requires projectId.' });
    }
    if (value.scope === 'project' && value.scopeId !== value.projectId) {
      context.addIssue({ code: 'custom', message: 'Project memory scopeId must match projectId.' });
    }
  });

export const memoryRetrievalResultSchema = z
  .object({
    items: z.array(memoryRecordSchema),
    omittedCount: z.number().int().nonnegative(),
    totalCharacters: z.number().int().nonnegative(),
  })
  .strict();

export const memoryBootstrapSchema = z
  .object({
    projectId: z.string().min(1),
    rendered: z.string().min(1),
    memories: z.array(memoryRecordSchema),
    omittedMemoryCount: z.number().int().nonnegative(),
    totalCharacters: z.number().int().positive(),
    maxCharacters: z.number().int().positive(),
  })
  .strict();

export type MemoryScope = z.infer<typeof memoryScopeSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryRetrievalResult = z.infer<typeof memoryRetrievalResultSchema>;
export type MemoryBootstrap = z.infer<typeof memoryBootstrapSchema>;

export function validateMemoryRecord(input: unknown): MemoryRecord {
  return memoryRecordSchema.parse(input);
}

export const workflowStateSchema = z.enum([
  'idle',
  'project_resolving',
  'project_confirmation_required',
  'codex_running',
  'codex_failed',
  'codex_completed',
  'building_context',
  'context_review_required',
  'context_approved',
  'sent_to_chatgpt',
  'waiting_chatgpt',
  'chatgpt_response_captured',
  'validating_chatgpt_response',
  'chatgpt_response_invalid',
  'codex_prompt_review_required',
  'codex_prompt_approved',
  'sent_to_codex',
  'finished',
  'failed',
  'cancelled',
]);

export const workflowOperationSchema = z.enum(['send_chatgpt', 'send_codex']);

export const workflowRunSchema = z
  .object({
    id: z.string().min(1),
    correlationId: z.string().min(1),
    projectId: z.string().min(1),
    state: workflowStateSchema,
    idempotencyKey: z.string().min(1),
    iterationCount: z.number().int().nonnegative(),
    failureRetries: z.number().int().nonnegative(),
    maxIterations: z.number().int().positive(),
    maxFailureRetries: z.number().int().nonnegative(),
    recoveryStatus: z.enum(['none', 'pending', 'confirmation_required']),
    lastErrorCode: z.string().min(1).optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const workflowEventSchema = z
  .object({
    id: z.string().min(1),
    workflowRunId: z.string().min(1),
    sequence: z.number().int().positive(),
    fromState: workflowStateSchema.optional(),
    toState: workflowStateSchema,
    eventType: z.string().min(1),
    actor: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const workflowApprovalSchema = z
  .object({
    id: z.string().min(1),
    workflowRunId: z.string().min(1),
    projectId: z.string().min(1),
    action: workflowOperationSchema,
    scope: z.literal('single_send'),
    destinationType: z.string().min(1),
    destinationId: z.string().min(1),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    approvedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    consumedAt: z.iso.datetime().optional(),
  })
  .strict();

export const workflowEffectSchema = z
  .object({
    id: z.string().min(1),
    workflowRunId: z.string().min(1),
    operation: workflowOperationSchema,
    idempotencyKey: z.string().min(1),
    handoffHash: z.string().regex(/^[a-f0-9]{64}$/),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    destinationType: z.string().min(1),
    destinationId: z.string().min(1),
    approvalId: z.string().min(1),
    status: z.enum(['prepared', 'dispatching', 'acknowledged', 'failed']),
    result: z.record(z.string(), z.unknown()).optional(),
    preparedAt: z.iso.datetime(),
    dispatchStartedAt: z.iso.datetime().optional(),
    acknowledgedAt: z.iso.datetime().optional(),
    failedAt: z.iso.datetime().optional(),
  })
  .strict();

export const workflowRecoveryItemSchema = z
  .object({
    effect: workflowEffectSchema,
    action: z.enum(['safe_to_dispatch', 'confirmation_required', 'none']),
  })
  .strict();

export type WorkflowState = z.infer<typeof workflowStateSchema>;
export type WorkflowOperation = z.infer<typeof workflowOperationSchema>;
export type WorkflowRun = z.infer<typeof workflowRunSchema>;
export type WorkflowEvent = z.infer<typeof workflowEventSchema>;
export type WorkflowApproval = z.infer<typeof workflowApprovalSchema>;
export type WorkflowEffect = z.infer<typeof workflowEffectSchema>;
export type WorkflowRecoveryItem = z.infer<typeof workflowRecoveryItemSchema>;
