import {
  localTransportResultSchema,
  projectEvidenceSchema,
  workflowEventSchema,
  workflowRecoveryItemSchema,
  workflowRunSchema,
} from '@codex-context-bridge/contracts';
import { z } from 'zod';

export const desktopIpcChannels = {
  getTransportStatus: 'bridge:get-transport-status',
  executeTransportOperation: 'bridge:execute-transport-operation',
} as const;

export const projectIpcChannels = {
  list: 'projects:list',
  create: 'projects:create',
  archive: 'projects:archive',
  addAlias: 'projects:add-alias',
  chooseRepositoryRoot: 'projects:choose-repository-root',
  previewRepository: 'projects:preview-repository',
  confirmRepository: 'projects:confirm-repository',
} as const;

export const workflowIpcChannels = {
  list: 'workflows:list',
  start: 'workflows:start',
  run: 'workflows:run',
  rerun: 'workflows:rerun',
  cancel: 'workflows:cancel',
  updateNotes: 'workflows:update-notes',
  delete: 'workflows:delete',
  logs: 'workflows:logs',
} as const;

const ipcErrorCode = z.enum([
  'IPC_SENDER_REJECTED',
  'IPC_SCHEMA_INVALID',
  'IPC_TIMEOUT',
  'TRANSPORT_DISCONNECTED',
  'PROJECT_NOT_FOUND',
  'REPOSITORY_ROOT_INVALID',
  'REPOSITORY_ALREADY_REGISTERED',
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_NOT_RUNNABLE',
  'WORKFLOW_NOT_RERUNNABLE',
  'WORKFLOW_NOT_CANCELLABLE',
  'WORKFLOW_NOT_DELETABLE',
  'INTERNAL_ERROR',
]);
const ipcError = z.object({ code: ipcErrorCode, message: z.string().min(1) }).strict();
const failure = z.object({ ok: z.literal(false), error: ipcError }).strict();
const success = <T extends z.ZodType>(schema: T) =>
  z.object({ ok: z.literal(true), value: schema }).strict();

const transportStatusSchema = z
  .object({
    transport: z.literal('native_messaging'),
    state: z.enum(['disconnected', 'pairing', 'connected', 'degraded']),
    permissionActive: z.boolean(),
    lastErrorCode: z.string().min(1).optional(),
  })
  .strict();

export const transportStatusResponseSchema = z.discriminatedUnion('ok', [
  success(transportStatusSchema),
  failure,
]);
export const transportOperationResponseSchema = z.discriminatedUnion('ok', [
  success(localTransportResultSchema),
  failure,
]);

const projectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().optional(),
  })
  .strict();
const repositorySchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    canonicalRoot: z.string().min(1),
    normalizedRemote: z.string().min(1).optional(),
    projectName: z.string().min(1).optional(),
    repositoryMarker: z.string().min(1).optional(),
    agentsHash: z.string().min(1).optional(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    branch: z.string().min(1).optional(),
    worktreeRoot: z.string().min(1).optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().optional(),
  })
  .strict();
const projectViewSchema = z
  .object({
    project: projectSchema,
    aliases: z.array(z.string().min(1)),
    repositories: z.array(repositorySchema),
  })
  .strict();
export const repositoryInputSchema = z
  .object({
    repoRoot: z.string().min(1),
    gitRemote: z.string().min(1).optional(),
    projectName: z.string().min(1).optional(),
    repositoryMarker: z.string().min(1).optional(),
    agentsHash: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    worktreeRoot: z.string().min(1).optional(),
  })
  .strict();
const repositoryPreviewSchema = z
  .object({
    detection: z
      .object({
        projectId: z.string().min(1).optional(),
        ambiguousProjectIds: z.array(z.string().min(1)).optional(),
        confidence: z.number().min(0).max(1),
        evidence: z.array(projectEvidenceSchema),
        requiresConfirmation: z.boolean(),
      })
      .strict(),
    candidateProjects: z.array(
      z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
    ),
  })
  .strict();

export const projectListResponseSchema = z.discriminatedUnion('ok', [
  success(z.array(projectViewSchema)),
  failure,
]);
export const projectViewResponseSchema = z.discriminatedUnion('ok', [
  success(projectViewSchema),
  failure,
]);
export const repositoryPreviewResponseSchema = z.discriminatedUnion('ok', [
  success(repositoryPreviewSchema),
  failure,
]);
export const chooseRootResponseSchema = z.discriminatedUnion('ok', [
  success(z.string().min(1).nullable()),
  failure,
]);

const workflowDashboardSchema = z
  .object({
    run: workflowRunSchema,
    events: z.array(workflowEventSchema),
    recovery: z.array(workflowRecoveryItemSchema),
    approvals: z.array(
      z
        .object({
          id: z.string().min(1).max(256),
          action: z.enum(['send_chatgpt', 'send_codex']),
          scope: z.literal('single_send'),
          destinationType: z.string().min(1).max(128),
          destinationId: z.string().min(1).max(512),
          approvedAt: z.iso.datetime(),
          expiresAt: z.iso.datetime(),
          consumedAt: z.iso.datetime().optional(),
        })
        .strict(),
    ),
    diagnostics: z.array(
      z
        .object({
          eventType: z.string().min(1).max(256),
          outcome: z.string().min(1).max(64),
          createdAt: z.iso.datetime(),
        })
        .strict(),
    ),
    operatorNotes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
            target: z.enum(['chatgpt', 'codex']),
            mode: z.enum(['once', 'repeat']),
            text: z.string().min(1).max(10_000),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export const workflowNotesUpdateInputSchema = z
  .object({
    workflowRunId: z.string().min(1).max(256),
    notes: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^[a-zA-Z0-9_-]{1,128}$/)
              .optional(),
            target: z.enum(['chatgpt', 'codex']),
            mode: z.enum(['once', 'repeat']),
            text: z.string().trim().min(1).max(10_000),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.notes.flatMap((note) => (note.id ? [note.id] : []));
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['notes'], message: 'Duplicate note ID.' });
    }
  });

export const workflowListResponseSchema = z.discriminatedUnion('ok', [
  success(z.array(workflowDashboardSchema)),
  failure,
]);
export const workflowViewResponseSchema = z.discriminatedUnion('ok', [
  success(workflowDashboardSchema),
  failure,
]);
const workflowLogSchema = z
  .object({
    id: z.string().min(1).max(256),
    createdAt: z.iso.datetime(),
    eventType: z.string().min(1).max(256),
    outcome: z.enum(['allowed', 'blocked', 'failed']),
    actor: z.string().min(1).max(256),
    projectId: z.string().min(1).max(256).optional(),
    resourceType: z.string().min(1).max(128).optional(),
    resourceId: z.string().min(1).max(512).optional(),
    workflowRunId: z.string().min(1).max(256).optional(),
    errorCode: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Z0-9][A-Z0-9_.:-]*$/)
      .optional(),
  })
  .strict();
export const workflowDeleteResponseSchema = z.discriminatedUnion('ok', [
  success(z.object({ workflowRunId: z.string().min(1).max(256) }).strict()),
  failure,
]);
export const workflowLogsResponseSchema = z.discriminatedUnion('ok', [
  success(z.array(workflowLogSchema)),
  failure,
]);

export type TransportStatusResponse = z.infer<typeof transportStatusResponseSchema>;
export type TransportOperationResponse = z.infer<typeof transportOperationResponseSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type ProjectViewResponse = z.infer<typeof projectViewResponseSchema>;
export type RepositoryInput = z.infer<typeof repositoryInputSchema>;
export type RepositoryPreviewResponse = z.infer<typeof repositoryPreviewResponseSchema>;
export type ChooseRootResponse = z.infer<typeof chooseRootResponseSchema>;
export type WorkflowListResponse = z.infer<typeof workflowListResponseSchema>;
export type WorkflowViewResponse = z.infer<typeof workflowViewResponseSchema>;
export type WorkflowNotesUpdateInput = z.infer<typeof workflowNotesUpdateInputSchema>;
export type WorkflowDeleteResponse = z.infer<typeof workflowDeleteResponseSchema>;
export type WorkflowLogsResponse = z.infer<typeof workflowLogsResponseSchema>;
export {
  pilotIpcChannels,
  chatGptDiscoveryResponseSchema,
  codexTargetCatalogResponseSchema,
  chatHistoryExportResponseSchema,
  pilotDeleteResponseSchema,
  pilotListResponseSchema,
  pilotViewResponseSchema,
  type PilotCreateInput,
  type PilotNotesUpdateInput,
  type PilotChatSelectionInput,
  type PilotDiscoverChatGptInput,
  type ChatGptDiscoveryResponse,
  type CodexTargetCatalogResponse,
  type ChatHistoryExportResponse,
  type PilotListResponse,
  type PilotDeleteResponse,
  type PilotView,
  type PilotViewResponse,
} from './pilot-contracts';
