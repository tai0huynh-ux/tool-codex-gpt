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
  cancel: 'workflows:cancel',
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
  'WORKFLOW_NOT_CANCELLABLE',
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
  })
  .strict();

export const workflowListResponseSchema = z.discriminatedUnion('ok', [
  success(z.array(workflowDashboardSchema)),
  failure,
]);
export const workflowViewResponseSchema = z.discriminatedUnion('ok', [
  success(workflowDashboardSchema),
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
export {
  pilotIpcChannels,
  pilotListResponseSchema,
  pilotViewResponseSchema,
  type PilotCreateInput,
  type PilotListResponse,
  type PilotView,
  type PilotViewResponse,
} from './pilot-contracts';
