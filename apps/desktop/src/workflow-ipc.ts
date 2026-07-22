import { randomUUID } from 'node:crypto';
import {
  workflowEventSchema,
  workflowRecoveryItemSchema,
  workflowRunSchema,
  type WorkflowRun,
} from '@codex-context-bridge/contracts';
import { appendAuditEvent, type SqliteDatabase } from '@codex-context-bridge/database';
import type { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { z } from 'zod';
import type { IpcInvokeEventLike, IpcMainLike } from './ipc';

export const workflowIpcChannels = {
  list: 'workflows:list',
  start: 'workflows:start',
  run: 'workflows:run',
  cancel: 'workflows:cancel',
  delete: 'workflows:delete',
  logs: 'workflows:logs',
} as const;

const ipcIdSchema = z.string().min(1).max(256);
const terminalStates = new Set<WorkflowRun['state']>(['finished', 'failed', 'cancelled']);
const safeErrorCodeSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Z0-9][A-Z0-9_.:-]*$/);

const approvalSummarySchema = z
  .object({
    id: ipcIdSchema,
    action: z.enum(['send_chatgpt', 'send_codex']),
    scope: z.literal('single_send'),
    destinationType: z.string().min(1).max(128),
    destinationId: z.string().min(1).max(512),
    approvedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    consumedAt: z.iso.datetime().optional(),
  })
  .strict();

const diagnosticSchema = z
  .object({
    eventType: z.string().min(1).max(256),
    outcome: z.string().min(1).max(64),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const workflowLogSchema = z
  .object({
    id: ipcIdSchema,
    createdAt: z.iso.datetime(),
    eventType: z.string().min(1).max(256),
    outcome: z.enum(['allowed', 'blocked', 'failed']),
    actor: z.string().min(1).max(256),
    projectId: ipcIdSchema.optional(),
    resourceType: z.string().min(1).max(128).optional(),
    resourceId: z.string().min(1).max(512).optional(),
    workflowRunId: ipcIdSchema.optional(),
    errorCode: safeErrorCodeSchema.optional(),
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
          'WORKFLOW_NOT_RUNNABLE',
          'WORKFLOW_NOT_CANCELLABLE',
          'WORKFLOW_NOT_DELETABLE',
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
export const workflowDeleteResponseSchema = z.discriminatedUnion('ok', [
  success(z.object({ workflowRunId: ipcIdSchema }).strict()),
  workflowErrorSchema,
]);
export const workflowLogsResponseSchema = z.discriminatedUnion('ok', [
  success(z.array(workflowLogSchema)),
  workflowErrorSchema,
]);

export type WorkflowDashboard = z.infer<typeof workflowDashboardSchema>;
export type WorkflowLog = z.infer<typeof workflowLogSchema>;
export type WorkflowListResponse = z.infer<typeof workflowListResponseSchema>;
export type WorkflowViewResponse = z.infer<typeof workflowViewResponseSchema>;
export type WorkflowDeleteResponse = z.infer<typeof workflowDeleteResponseSchema>;
export type WorkflowLogsResponse = z.infer<typeof workflowLogsResponseSchema>;

export interface WorkflowDesktopService {
  list(projectId?: string): WorkflowDashboard[] | Promise<WorkflowDashboard[]>;
  start(projectId: string): WorkflowDashboard | Promise<WorkflowDashboard>;
  run(workflowRunId: string): WorkflowDashboard | Promise<WorkflowDashboard>;
  cancel(workflowRunId: string): WorkflowDashboard | Promise<WorkflowDashboard>;
  delete(workflowRunId: string): { workflowRunId: string } | Promise<{ workflowRunId: string }>;
  logs(projectId?: string, limit?: number): WorkflowLog[] | Promise<WorkflowLog[]>;
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

interface AuditRow {
  id: string;
  event_type: string;
  actor: string;
  project_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  outcome: 'allowed' | 'blocked' | 'failed';
  details_json: string;
  created_at: string;
  workflow_run_id: string | null;
  run_error_code: string | null;
}

const pilotWorkflowReferenceSchema = z.looseObject({
  workflowRunId: ipcIdSchema,
  accountTransfer: z.object({ workflowRunId: ipcIdSchema.optional() }).loose().optional(),
});

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

function errorCodeFromAudit(row: AuditRow): string | undefined {
  let details: unknown;
  try {
    details = JSON.parse(row.details_json) as unknown;
  } catch {
    details = undefined;
  }
  const detailCode =
    details && typeof details === 'object'
      ? ((details as { errorCode?: unknown; code?: unknown }).errorCode ??
        (details as { errorCode?: unknown; code?: unknown }).code)
      : undefined;
  const candidate =
    typeof detailCode === 'string'
      ? detailCode
      : row.outcome === 'allowed'
        ? undefined
        : row.run_error_code;
  const parsed = safeErrorCodeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function referencesPilot(database: SqliteDatabase, workflowRunId: string): boolean {
  const rows = database
    .prepare("SELECT value_json FROM settings WHERE key LIKE 'live-project-pilot:%'")
    .all() as { value_json: string }[];
  return rows.some((row) => {
    try {
      const parsed = pilotWorkflowReferenceSchema.safeParse(JSON.parse(row.value_json) as unknown);
      return (
        parsed.success &&
        (parsed.data.workflowRunId === workflowRunId ||
          parsed.data.accountTransfer?.workflowRunId === workflowRunId)
      );
    } catch {
      return false;
    }
  });
}

export function createWorkflowDesktopService(
  database: SqliteDatabase,
  workflows: WorkflowEngine,
): WorkflowDesktopService {
  const auditBlocked = (run: WorkflowRun, eventType: string, errorCode: string): void => {
    appendAuditEvent(database, {
      id: randomUUID(),
      eventType,
      actor: 'user',
      projectId: run.projectId,
      correlationId: run.correlationId,
      resourceType: 'workflow_run',
      resourceId: run.id,
      outcome: 'blocked',
      details: { errorCode },
    });
  };

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
    run: (workflowRunId) => {
      const run = workflows.getRun(workflowRunId);
      if (!run) throw new Error('WORKFLOW_NOT_FOUND');
      if (run.state !== 'idle') {
        auditBlocked(run, 'workflow.start.blocked', 'WORKFLOW_NOT_RUNNABLE');
        throw new Error('WORKFLOW_NOT_RUNNABLE');
      }
      const started = workflows.transition(run.id, {
        toState: 'project_resolving',
        eventType: 'workflow.started_by_user',
        actor: 'user',
      });
      return dashboard(database, workflows, started);
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
          auditBlocked(run, 'workflow.stop.blocked', 'WORKFLOW_NOT_CANCELLABLE');
          throw new Error('WORKFLOW_NOT_CANCELLABLE');
        }
        throw error;
      }
      return dashboard(database, workflows, cancelled);
    },
    delete: (workflowRunId) => {
      const run = workflows.getRun(workflowRunId);
      if (!run) throw new Error('WORKFLOW_NOT_FOUND');
      const outstandingEffect = database
        .prepare(
          "SELECT id FROM workflow_effects WHERE workflow_run_id = ? AND status IN ('prepared', 'dispatching') LIMIT 1",
        )
        .get(run.id) as { id: string } | undefined;
      if (
        !terminalStates.has(run.state) ||
        referencesPilot(database, run.id) ||
        outstandingEffect
      ) {
        auditBlocked(run, 'workflow.delete.blocked', 'WORKFLOW_NOT_DELETABLE');
        throw new Error('WORKFLOW_NOT_DELETABLE');
      }
      return database.transaction(() => {
        appendAuditEvent(database, {
          id: randomUUID(),
          eventType: 'workflow.deleted',
          actor: 'user',
          projectId: run.projectId,
          correlationId: run.correlationId,
          resourceType: 'workflow_run',
          resourceId: run.id,
          outcome: 'allowed',
          details: { finalState: run.state },
        });
        database.prepare('DELETE FROM workflow_effects WHERE workflow_run_id = ?').run(run.id);
        database.prepare('DELETE FROM user_approvals WHERE workflow_run_id = ?').run(run.id);
        database
          .prepare('DELETE FROM chatgpt_response_receipts WHERE workflow_run_id = ?')
          .run(run.id);
        database.prepare('DELETE FROM workflow_runs WHERE id = ?').run(run.id);
        return { workflowRunId: run.id };
      })();
    },
    logs: (projectId, limit = 100) => {
      const boundedLimit = Math.min(Math.max(limit, 1), 200);
      const rows = database
        .prepare(
          `SELECT audit.id, audit.event_type, audit.actor, audit.project_id,
                  audit.resource_type, audit.resource_id, audit.outcome,
                  audit.details_json, audit.created_at,
                  runs.id AS workflow_run_id, runs.last_error_code AS run_error_code
           FROM audit_events AS audit
           LEFT JOIN workflow_runs AS runs ON runs.correlation_id = audit.correlation_id
           WHERE (? IS NULL OR audit.project_id = ?)
           ORDER BY audit.created_at DESC, audit.rowid DESC
           LIMIT ?`,
        )
        .all(projectId ?? null, projectId ?? null, boundedLimit) as AuditRow[];
      return rows.map((row) => {
        const errorCode = errorCodeFromAudit(row);
        return workflowLogSchema.parse({
          id: row.id,
          createdAt: row.created_at,
          eventType: row.event_type,
          outcome: row.outcome,
          actor: row.actor,
          ...(row.project_id ? { projectId: row.project_id } : {}),
          ...(row.resource_type ? { resourceType: row.resource_type } : {}),
          ...(row.resource_id ? { resourceId: row.resource_id } : {}),
          ...(row.workflow_run_id ? { workflowRunId: row.workflow_run_id } : {}),
          ...(errorCode ? { errorCode } : {}),
        });
      });
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
  if (error.message === 'WORKFLOW_NOT_RUNNABLE') return 'WORKFLOW_NOT_RUNNABLE';
  if (error.message === 'WORKFLOW_NOT_CANCELLABLE') return 'WORKFLOW_NOT_CANCELLABLE';
  if (error.message === 'WORKFLOW_NOT_DELETABLE') return 'WORKFLOW_NOT_DELETABLE';
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
    z.object({ projectId: ipcIdSchema.optional() }).strict(),
    workflowListResponseSchema,
    (input) => service.list((input as { projectId?: string }).projectId),
  );
  register(
    workflowIpcChannels.start,
    z.object({ projectId: ipcIdSchema }).strict(),
    workflowViewResponseSchema,
    (input) => service.start((input as { projectId: string }).projectId),
  );
  register(
    workflowIpcChannels.run,
    z.object({ workflowRunId: ipcIdSchema }).strict(),
    workflowViewResponseSchema,
    (input) => service.run((input as { workflowRunId: string }).workflowRunId),
  );
  register(
    workflowIpcChannels.cancel,
    z.object({ workflowRunId: ipcIdSchema }).strict(),
    workflowViewResponseSchema,
    (input) => service.cancel((input as { workflowRunId: string }).workflowRunId),
  );
  register(
    workflowIpcChannels.delete,
    z.object({ workflowRunId: ipcIdSchema }).strict(),
    workflowDeleteResponseSchema,
    (input) => service.delete((input as { workflowRunId: string }).workflowRunId),
  );
  register(
    workflowIpcChannels.logs,
    z
      .object({
        projectId: ipcIdSchema.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict(),
    workflowLogsResponseSchema,
    (input) => {
      const value = input as { projectId?: string; limit?: number };
      return service.logs(value.projectId, value.limit);
    },
  );
}
