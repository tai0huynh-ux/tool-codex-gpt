import {
  assistedChatGptPreviewSchema,
  chatGptRenderedCatalogSchema,
  chatGptConversationIdFromPath,
  chatGptConversationPathSchema,
  codexRoutePreviewSchema,
  contextBridgeResponseSchema,
} from '@codex-context-bridge/contracts';
import { z } from 'zod';

const websiteVerificationSchema = z
  .object({
    status: z.enum(['passed', 'failed']),
    root: z.string().min(1).max(32_768),
    files: z.array(z.string().min(1).max(512)).max(32),
    checks: z
      .array(
        z
          .object({
            name: z.string().min(1).max(128),
            passed: z.boolean(),
            detail: z.string().min(1).max(2_000),
          })
          .strict(),
      )
      .max(64),
    verifiedAt: z.iso.datetime(),
  })
  .strict();

export const pilotIpcChannels = {
  list: 'pilot:list',
  discoverChatGpt: 'pilot:discover-chatgpt',
  listCodexTargets: 'pilot:list-codex-targets',
  create: 'pilot:create',
  refresh: 'pilot:refresh',
  inspectChatGpt: 'pilot:inspect-chatgpt',
  prepareChatGpt: 'pilot:prepare-chatgpt',
  approveChatGpt: 'pilot:approve-chatgpt',
  captureChatGpt: 'pilot:capture-chatgpt',
  syncChatHistory: 'pilot:sync-chat-history',
  exportChatHistory: 'pilot:export-chat-history',
  approveCodex: 'pilot:approve-codex',
  revealCodexBundle: 'pilot:reveal-codex-bundle',
  verifyWebsite: 'pilot:verify-website',
  openPreview: 'pilot:open-preview',
} as const;

export const pilotIdSchema = z.string().min(1).max(256);

export const pilotDestinationSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('new') }).strict(),
    z
      .object({
        mode: z.literal('existing'),
        conversationId: pilotIdSchema,
        conversationPath: chatGptConversationPathSchema.optional(),
      })
      .strict(),
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

export const pilotCreateDestinationSchema = z.union([
  z.object({ mode: z.literal('current') }).strict(),
  pilotDestinationSchema,
]);

export const pilotListInputSchema = z.object({ projectId: pilotIdSchema.optional() }).strict();
export const pilotCreateInputSchema = z
  .object({
    projectId: pilotIdSchema,
    repositoryId: pilotIdSchema,
    objective: z.string().trim().min(1).max(20_000),
    destination: pilotCreateDestinationSchema,
    codexDestination: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('new-thread'), repositoryId: pilotIdSchema }).strict(),
        z.object({ mode: z.literal('existing-thread'), threadMappingId: pilotIdSchema }).strict(),
      ])
      .optional(),
  })
  .strict();
export const pilotIdInputSchema = z.object({ pilotId: pilotIdSchema }).strict();

export const pilotStatusSchema = z.enum([
  'draft',
  'chatgpt_ready',
  'chatgpt_dispatched',
  'chatgpt_confirmation_required',
  'codex_ready',
  'codex_running',
  'codex_completed',
  'failed',
]);

export const chatArchiveSummarySchema = z
  .object({
    sourceId: pilotIdSchema,
    conversationId: pilotIdSchema,
    revisionCount: z.number().int().positive(),
    latestMessageCount: z.number().int().positive().max(5_000),
    latestContentHash: z.string().regex(/^[a-f0-9]{64}$/),
    lastSyncedAt: z.iso.datetime(),
  })
  .strict();

export const pilotViewSchema = z
  .object({
    id: pilotIdSchema,
    projectId: pilotIdSchema,
    repositoryId: pilotIdSchema,
    repositoryRoot: z.string().min(1).max(32_768),
    repositoryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    objective: z.string().min(1).max(20_000),
    destination: pilotDestinationSchema,
    codexDestination: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('new-thread'), repositoryId: pilotIdSchema }).strict(),
        z.object({ mode: z.literal('existing-thread'), threadMappingId: pilotIdSchema }).strict(),
      ])
      .optional(),
    workflowRunId: pilotIdSchema,
    status: pilotStatusSchema,
    chatGptInspection: z
      .object({
        pageMode: z.enum(['new', 'existing', 'unsupported']),
        conversationId: pilotIdSchema.optional(),
        conversationPath: chatGptConversationPathSchema.optional(),
        composerAvailable: z.boolean(),
        composerReadOnly: z.boolean(),
        hasDraft: z.boolean(),
        streaming: z.boolean(),
      })
      .strict()
      .optional(),
    chatGptPreview: assistedChatGptPreviewSchema.optional(),
    chatGptEffectId: pilotIdSchema.optional(),
    chatArchive: chatArchiveSummarySchema.optional(),
    response: contextBridgeResponseSchema.optional(),
    codexPreview: codexRoutePreviewSchema.optional(),
    codexEffectId: pilotIdSchema.optional(),
    codexThreadId: pilotIdSchema.optional(),
    codexRunId: pilotIdSchema.optional(),
    finalResponse: z.string().max(100_000).optional(),
    codexBundle: z
      .object({
        zipPath: z.string().min(1).max(32_768),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        size: z.number().int().nonnegative(),
        changedFiles: z.array(z.string().min(1).max(2_048)).max(5_000),
        includedFiles: z.array(z.string().min(1).max(2_048)).max(100),
        blockedFiles: z
          .array(
            z
              .object({
                path: z.string().min(1).max(2_048),
                reason: z.string().min(1).max(512),
              })
              .strict(),
          )
          .max(5_000),
        createdAt: z.iso.datetime(),
      })
      .strict()
      .optional(),
    codexBundleErrorCode: z.string().min(1).max(256).optional(),
    errorCode: z.string().min(1).max(256).optional(),
    websiteVerification: websiteVerificationSchema.optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const pilotErrorCodeSchema = z.enum([
  'IPC_SENDER_REJECTED',
  'IPC_SCHEMA_INVALID',
  'IPC_TIMEOUT',
  'PILOT_NOT_FOUND',
  'PILOT_STATE_INVALID',
  'PROJECT_NOT_FOUND',
  'REPOSITORY_NOT_FOUND',
  'TRANSPORT_DISCONNECTED',
  'CHATGPT_NOT_READY',
  'CHATGPT_CONVERSATION_UNAVAILABLE',
  'CHATGPT_CONFIRMATION_REQUIRED',
  'CHAT_ARCHIVE_DESTINATION_REQUIRED',
  'CHAT_ARCHIVE_EMPTY',
  'CHAT_ARCHIVE_TOO_LARGE',
  'CHAT_ARCHIVE_INVALID',
  'CHAT_ARCHIVE_WRITE_FAILED',
  'CHAT_ARCHIVE_EXPORT_FAILED',
  'CODEX_CONFIRMATION_REQUIRED',
  'CODEX_BASELINE_FAILED',
  'CODEX_BUNDLE_FAILED',
  'CODEX_BUNDLE_NOT_READY',
  'INTERNAL_ERROR',
]);

const pilotFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({ code: pilotErrorCodeSchema, message: z.string().min(1) }).strict(),
  })
  .strict();
const pilotSuccessSchema = z.object({ ok: z.literal(true), value: pilotViewSchema }).strict();

export const pilotViewResponseSchema = z.discriminatedUnion('ok', [
  pilotSuccessSchema,
  pilotFailureSchema,
]);
export const pilotListResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.array(pilotViewSchema) }).strict(),
  pilotFailureSchema,
]);

export const chatGptDiscoveryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: chatGptRenderedCatalogSchema }).strict(),
  pilotFailureSchema,
]);

export const codexTargetCatalogSchema = z
  .object({
    projects: z.array(
      z
        .object({
          projectId: pilotIdSchema,
          projectName: z.string().min(1).max(512),
          repositories: z.array(
            z
              .object({
                id: pilotIdSchema,
                canonicalRoot: z.string().min(1).max(32_768),
                fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                branch: z.string().min(1).max(512).optional(),
              })
              .strict(),
          ),
          threads: z.array(
            z
              .object({
                mappingId: pilotIdSchema,
                externalThreadId: pilotIdSchema,
                repositoryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                updatedAt: z.iso.datetime(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export const codexTargetCatalogResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: codexTargetCatalogSchema }).strict(),
  pilotFailureSchema,
]);

export const chatHistoryExportResultSchema = z
  .object({
    canceled: z.boolean(),
    filePath: z.string().min(1).max(32_768).optional(),
    conversationCount: z.number().int().nonnegative(),
    revisionCount: z.number().int().nonnegative(),
    exportedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.canceled === Boolean(value.filePath)) {
      context.addIssue({ code: 'custom', message: 'Saved exports require exactly one file path.' });
    }
  });
export const chatHistoryExportResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: chatHistoryExportResultSchema }).strict(),
  pilotFailureSchema,
]);

export type PilotCreateInput = z.infer<typeof pilotCreateInputSchema>;
export type PilotView = z.infer<typeof pilotViewSchema>;
export type PilotViewResponse = z.infer<typeof pilotViewResponseSchema>;
export type PilotListResponse = z.infer<typeof pilotListResponseSchema>;
export type ChatGptDiscoveryResponse = z.infer<typeof chatGptDiscoveryResponseSchema>;
export type CodexTargetCatalog = z.infer<typeof codexTargetCatalogSchema>;
export type CodexTargetCatalogResponse = z.infer<typeof codexTargetCatalogResponseSchema>;
export type ChatHistoryExportResult = z.infer<typeof chatHistoryExportResultSchema>;
export type ChatHistoryExportResponse = z.infer<typeof chatHistoryExportResponseSchema>;
