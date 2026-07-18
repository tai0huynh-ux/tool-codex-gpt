import {
  workflowEventSchema,
  workflowRecoveryItemSchema,
  workflowRunSchema,
  type WorkflowRun,
} from '@codex-context-bridge/contracts';
import type { SqliteDatabase } from '@codex-context-bridge/database';
import type { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { z } from 'zod';
import type { IpcInvokeEventLike, IpcMainLike } from './ipc';

export const workflowIpcChannels = {
  list: 'workflows:list',
  start: 'workflows:start',
  cancel: 'workflows:cancel',
} as const;

const approvalSummarySchema = z
  .object({
    id: z.string().min(1),
    action: z.enum(['send_chatgpt', 'send_codex']),
    scope: z.literal('single_send'),
    destinationType: z.string().min(1),
    destinationId: z.string().min(1),
    approvedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    consumedAt: z.iso.datetime().optional(),
  })
  .strict();

const diagnosticSchema = z
  .object({
    eventType: z.string().min(1),
    outcome: z.string().min(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const workflowDashboardSchema = z
  .object({
    run: workflowRunSchema,
    events: z.array(workflowEventSchema),
    recovery: z.array(workflowRecoveryItemSchema),
    approvals: z.array(approvalSummarySchema),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

const workflowErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum([
          'IPC_SENDER_REJECTED',
          'IPC_SCHEMA_INVALID',
          'IPC_TIMEOUT',
          'PROJECT_NOT_FOUND',
          'WORKFLOW_NOT_FOUND',
          'WORKFLOW_NOT_CANCELLABLE',
          'INTERNAL_ERROR',
        ]),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const success = <T extends z.ZodType>(schema: T) =>
  z.object({ ok: z.literal(true), value: schema }).strict();

export const workflowListResponseSchema = z.discriminatedUnion('ok', [
  success(z.array(workflowDashboardSchema)),
  workflowErrorSchema,
]);
export const workflowViewResponseSchema = z.discriminatedUnion('ok', [
  success(workflowDashboardSchema),
  workflowErrorSchema,
]);

export type WorkflowDashboard = z.infer<typeof workflowDashboardSchema>;
export type WorkflowListResponse = z.infer<typeof workflowListResponseSchema>;
export type WorkflowViewResponse = z.infer<typeof workflowViewResponseSchema>;

export interface WorkflowDesktopService {
  list(projectId?: string): WorkflowDashboard[] | Promise<WorkflowDashboard[]>;
  start(projectId: string): WorkflowDashboard | Promise<WorkflowDashboard>;
  cancel(workflowRunId: string): WorkflowDashboard | Promise<WorkflowDashboard>;
}

interface ApprovalRow {
  id: string;
  action: 'send_chatgpt' | 'send_codex';
  scope: string | null;
  destination_type: string | null;
  destination_id: string | null;
  approved_at: string;
  expires_at: string;
  consumed_at: string | null;
}

function dashboard(
  database: SqliteDatabase,
  workflows: WorkflowEngine,
  run: WorkflowRun,
): WorkflowDashboard {
  const approvals = database
    .prepare(
      `SELECT id, action, scope, destination_type, destination_id, approved_at, expires_at, consumed_at
       FROM user_approvals WHERE workflow_run_id = ? ORDER BY approved_at DESC`,
    )
    .all(run.id) as ApprovalRow[];
  const diagnostics = database
    .prepare(
      `SELECT event_type AS eventType, outcome, created_at AS createdAt
       FROM audit_events WHERE correlation_id = ? ORDER BY created_at DESC LIMIT 12`,
    )
    .all(run.correlationId) as {
    eventType: string;
    outcome: string;
    createdAt: string;
  }[];
  return workflowDashboardSchema.parse({
    run,
    events: workflows.listEvents(run.id),
    recovery: workflows.recover(run.id),
    approvals: approvals.flatMap((item) =>
      item.scope && item.destination_type && item.destination_id
        ? [
            {
              id: item.id,
              action: item.action,
              scope: item.scope,
              destinationType: item.destination_type,
              destinationId: item.destination_id,
              approvedAt: item.approved_at,
              expiresAt: item.expires_at,
              ...(item.consumed_at ? { consumedAt: item.consumed_at } : {}),
            },
          ]
        : [],
    ),
    diagnostics,
  });
}

export function createWorkflowDesktopService(
  database: SqliteDatabase,
  workflows: WorkflowEngine,
): WorkflowDesktopService {
  return {
    list: (projectId) => {
      const rows = database
        .prepare(
          `SELECT id FROM workflow_runs
           WHERE (? IS NULL OR project_id = ?)
           ORDER BY updated_at DESC, id DESC LIMIT 30`,
        )
        .all(projectId ?? null, projectId ?? null) as { id: string }[];
      return rows.flatMap((item) => {
        const run = workflows.getRun(item.id);
        return run ? [dashboard(database, workflows, run)] : [];
      });
    },
    start: (projectId) => {
      const project = database
        .prepare('SELECT id FROM projects WHERE id = ? AND archived_at IS NULL')
        .get(projectId) as { id: string } | undefined;
      if (!project) throw new Error('PROJECT_NOT_FOUND');
      const nonce = randomUUID();
      const run = workflows.create({
        projectId,
        correlationId: `desktop:${nonce}`,
        idempotencyKey: `desktop:${nonce}`,
      });
      return dashboard(database, workflows, run);
    },
    cancel: (workflowRunId) => {
      const run = workflows.getRun(workflowRunId);
      if (!run) throw new Error('WORKFLOW_NOT_FOUND');
      let cancelled: WorkflowRun;
      try {
        cancelled = workflows.transition(run.id, {
          toState: 'cancelled',
          eventType: 'workflow.cancelled_by_user',
          actor: 'user',
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('WORKFLOW_INVALID_TRANSITION')) {
          throw new Error('WORKFLOW_NOT_CANCELLABLE');
        }
        throw error;
      }
      return dashboard(database, workflows, cancelled);
    },
  };
}

interface WorkflowIpcOptions {
  validateSender: (event: IpcInvokeEventLike) => boolean;
  timeoutMs?: number;
}

function failure(code: z.infer<typeof workflowErrorSchema>['error']['code'], message: string) {
  return { ok: false as const, error: { code, message } };
}

function codeFor(error: unknown): z.infer<typeof workflowErrorSchema>['error']['code'] {
  if (!(error instanceof Error)) return 'INTERNAL_ERROR';
  if (error.message === 'IPC_TIMEOUT') return 'IPC_TIMEOUT';
  if (error.message === 'PROJECT_NOT_FOUND') return 'PROJECT_NOT_FOUND';
  if (error.message === 'WORKFLOW_NOT_FOUND') return 'WORKFLOW_NOT_FOUND';
  if (error.message === 'WORKFLOW_NOT_CANCELLABLE') return 'WORKFLOW_NOT_CANCELLABLE';
  return 'INTERNAL_ERROR';
}

export function registerWorkflowIpc(
  ipcMain: IpcMainLike,
  service: WorkflowDesktopService,
  options: WorkflowIpcOptions,
): void {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const register = (
    channel: string,
    inputSchema: z.ZodType,
    responseSchema: z.ZodType,
    handler: (input: unknown) => unknown,
  ): void => {
    ipcMain.handle(channel, async (event, input) => {
      if (!options.validateSender(event)) {
        return failure('IPC_SENDER_REJECTED', 'IPC sender is not trusted.');
      }
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return failure('IPC_SCHEMA_INVALID', 'Workflow request is invalid.');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await Promise.race([
          Promise.resolve(handler(parsed.data)),
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('IPC_TIMEOUT')), timeoutMs);
          }),
        ]);
        return responseSchema.parse({ ok: true, value });
      } catch (error) {
        const code = codeFor(error);
        return failure(code, code === 'INTERNAL_ERROR' ? 'Workflow operation failed.' : code);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
  };

  register(
    workflowIpcChannels.list,
    z.object({ projectId: z.string().min(1).optional() }).strict(),
    workflowListResponseSchema,
    (input) => service.list((input as { projectId?: string }).projectId),
  );
  register(
    workflowIpcChannels.start,
    z.object({ projectId: z.string().min(1) }).strict(),
    workflowViewResponseSchema,
    (input) => service.start((input as { projectId: string }).projectId),
  );
  register(
    workflowIpcChannels.cancel,
    z.object({ workflowRunId: z.string().min(1) }).strict(),
    workflowViewResponseSchema,
    (input) => service.cancel((input as { workflowRunId: string }).workflowRunId),
  );
}
import { randomUUID } from 'node:crypto';
