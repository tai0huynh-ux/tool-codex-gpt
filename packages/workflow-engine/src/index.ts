import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  workflowApprovalSchema,
  workflowEffectSchema,
  workflowEventSchema,
  workflowOperationSchema,
  workflowRecoveryItemSchema,
  workflowRunSchema,
  workflowStateSchema,
  type WorkflowApproval,
  type WorkflowEffect,
  type WorkflowEvent,
  type WorkflowRecoveryItem,
  type WorkflowOperation,
  type WorkflowRun,
  type WorkflowState,
} from '@codex-context-bridge/contracts';
import { appendAuditEvent, type SqliteDatabase } from '@codex-context-bridge/database';

type FaultPoint =
  | 'after_event_insert'
  | 'before_projection_update'
  | 'after_effect_insert'
  | 'after_approval_consume'
  | 'after_dispatch_mark'
  | 'after_ack_mark';

interface WorkflowRow {
  id: string;
  correlation_id: string;
  project_id: string;
  state: WorkflowState;
  idempotency_key: string;
  iteration_count: number;
  failure_retries: number;
  max_iterations: number;
  max_failure_retries: number;
  recovery_status: WorkflowRun['recoveryStatus'];
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  workflow_run_id: string;
  sequence: number;
  from_state: WorkflowState | null;
  to_state: WorkflowState;
  event_type: string;
  actor: string;
  payload_json: string;
  occurred_at: string;
}

interface ApprovalRow {
  id: string;
  workflow_run_id: string;
  project_id: string | null;
  action: WorkflowOperation;
  scope: string | null;
  destination_type: string | null;
  destination_id: string | null;
  payload_hash: string | null;
  approval_token_hash: string;
  approved_at: string;
  expires_at: string;
  consumed_at: string | null;
}

interface EffectRow {
  id: string;
  workflow_run_id: string;
  operation: WorkflowOperation;
  idempotency_key: string;
  handoff_hash: string;
  payload_hash: string;
  destination_type: string;
  destination_id: string;
  approval_id: string;
  status: WorkflowEffect['status'];
  result_json: string | null;
  prepared_at: string;
  dispatch_started_at: string | null;
  acknowledged_at: string | null;
  failed_at: string | null;
}

export interface WorkflowEngineOptions {
  now?: () => string;
  fault?: (point: FaultPoint) => void;
}

export interface CreateWorkflowInput {
  id?: string;
  correlationId: string;
  projectId: string;
  idempotencyKey: string;
  maxIterations?: number;
  maxFailureRetries?: number;
}

export interface TransitionInput {
  toState: WorkflowState;
  eventType: string;
  actor: string;
  payload?: Record<string, unknown>;
  errorCode?: string;
}

export interface IssueApprovalInput {
  workflowRunId: string;
  operation: WorkflowOperation;
  destinationType: string;
  destinationId: string;
  payloadHash: string;
  ttlMs: number;
  id?: string;
}

export interface PrepareSendInput {
  workflowRunId: string;
  operation: WorkflowOperation;
  idempotencyKey: string;
  handoffHash: string;
  payloadHash: string;
  destinationType: string;
  destinationId: string;
  approvalId: string;
  approvalToken: string;
  effectId?: string;
}

const transitions: Record<WorkflowState, readonly WorkflowState[]> = {
  idle: ['project_resolving', 'cancelled'],
  project_resolving: [
    'project_confirmation_required',
    'codex_running',
    'building_context',
    'failed',
    'cancelled',
  ],
  project_confirmation_required: ['codex_running', 'cancelled'],
  codex_running: ['codex_completed', 'codex_failed', 'cancelled'],
  codex_failed: ['codex_running', 'failed', 'cancelled'],
  codex_completed: ['building_context', 'finished'],
  building_context: ['context_review_required', 'failed', 'cancelled'],
  context_review_required: ['context_approved', 'cancelled'],
  context_approved: ['sent_to_chatgpt', 'cancelled'],
  sent_to_chatgpt: ['waiting_chatgpt', 'failed', 'cancelled'],
  waiting_chatgpt: ['chatgpt_response_captured', 'failed', 'cancelled'],
  chatgpt_response_captured: ['validating_chatgpt_response', 'cancelled'],
  validating_chatgpt_response: [
    'chatgpt_response_invalid',
    'codex_prompt_review_required',
    'finished',
    'failed',
  ],
  chatgpt_response_invalid: ['waiting_chatgpt', 'failed', 'cancelled'],
  codex_prompt_review_required: ['codex_prompt_approved', 'cancelled'],
  codex_prompt_approved: ['sent_to_codex', 'cancelled'],
  sent_to_codex: ['codex_running', 'finished', 'failed', 'cancelled'],
  finished: [],
  failed: [],
  cancelled: [],
};

function requireText(value: string, code: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(code);
  return trimmed;
}

function requireHash(value: string, code: string): string {
  const normalized = value.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeTokenEqual(expectedHash: string, token: string): boolean {
  const actual = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class WorkflowEngine {
  private readonly now: () => string;

  public constructor(
    private readonly database: SqliteDatabase,
    private readonly options: WorkflowEngineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private fault(point: FaultPoint): void {
    this.options.fault?.(point);
  }

  private mapRun(row: WorkflowRow): WorkflowRun {
    return workflowRunSchema.parse({
      id: row.id,
      correlationId: row.correlation_id,
      projectId: row.project_id,
      state: row.state,
      idempotencyKey: row.idempotency_key,
      iterationCount: row.iteration_count,
      failureRetries: row.failure_retries,
      maxIterations: row.max_iterations,
      maxFailureRetries: row.max_failure_retries,
      recoveryStatus: row.recovery_status,
      ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private mapEvent(row: EventRow): WorkflowEvent {
    return workflowEventSchema.parse({
      id: row.id,
      workflowRunId: row.workflow_run_id,
      sequence: row.sequence,
      ...(row.from_state ? { fromState: row.from_state } : {}),
      toState: row.to_state,
      eventType: row.event_type,
      actor: row.actor,
      payload: JSON.parse(row.payload_json) as unknown,
      occurredAt: row.occurred_at,
    });
  }

  private mapApproval(row: ApprovalRow): WorkflowApproval {
    if (
      !row.project_id ||
      row.scope !== 'single_send' ||
      !row.destination_type ||
      !row.destination_id ||
      !row.payload_hash
    ) {
      throw new Error('APPROVAL_RECORD_INCOMPLETE');
    }
    return workflowApprovalSchema.parse({
      id: row.id,
      workflowRunId: row.workflow_run_id,
      projectId: row.project_id,
      action: row.action,
      scope: row.scope,
      destinationType: row.destination_type,
      destinationId: row.destination_id,
      payloadHash: row.payload_hash,
      approvedAt: row.approved_at,
      expiresAt: row.expires_at,
      ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
    });
  }

  private mapEffect(row: EffectRow): WorkflowEffect {
    return workflowEffectSchema.parse({
      id: row.id,
      workflowRunId: row.workflow_run_id,
      operation: row.operation,
      idempotencyKey: row.idempotency_key,
      handoffHash: row.handoff_hash,
      payloadHash: row.payload_hash,
      destinationType: row.destination_type,
      destinationId: row.destination_id,
      approvalId: row.approval_id,
      status: row.status,
      ...(row.result_json ? { result: JSON.parse(row.result_json) as unknown } : {}),
      preparedAt: row.prepared_at,
      ...(row.dispatch_started_at ? { dispatchStartedAt: row.dispatch_started_at } : {}),
      ...(row.acknowledged_at ? { acknowledgedAt: row.acknowledged_at } : {}),
      ...(row.failed_at ? { failedAt: row.failed_at } : {}),
    });
  }

  public getRun(id: string): WorkflowRun | undefined {
    const row = this.database.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id) as
      WorkflowRow | undefined;
    return row ? this.mapRun(row) : undefined;
  }

  public getEffect(id: string): WorkflowEffect | undefined {
    const row = this.database.prepare('SELECT * FROM workflow_effects WHERE id = ?').get(id) as
      EffectRow | undefined;
    return row ? this.mapEffect(row) : undefined;
  }

  public listEvents(workflowRunId: string): WorkflowEvent[] {
    return (
      this.database
        .prepare('SELECT * FROM workflow_events WHERE workflow_run_id = ? ORDER BY sequence')
        .all(workflowRunId) as EventRow[]
    ).map((row) => this.mapEvent(row));
  }

  public create(input: CreateWorkflowInput): WorkflowRun {
    const correlationId = requireText(input.correlationId, 'WORKFLOW_CORRELATION_REQUIRED');
    const projectId = requireText(input.projectId, 'WORKFLOW_PROJECT_REQUIRED');
    const idempotencyKey = requireText(input.idempotencyKey, 'WORKFLOW_IDEMPOTENCY_REQUIRED');
    const existing = this.database
      .prepare('SELECT * FROM workflow_runs WHERE idempotency_key = ?')
      .get(idempotencyKey) as WorkflowRow | undefined;
    if (existing) {
      if (existing.correlation_id !== correlationId || existing.project_id !== projectId) {
        throw new Error('WORKFLOW_IDEMPOTENCY_CONFLICT');
      }
      return this.mapRun(existing);
    }
    const correlationOwner = this.database
      .prepare('SELECT id FROM workflow_runs WHERE correlation_id = ?')
      .get(correlationId) as { id: string } | undefined;
    if (correlationOwner) throw new Error('WORKFLOW_CORRELATION_CONFLICT');
    const maxIterations = input.maxIterations ?? 5;
    const maxFailureRetries = input.maxFailureRetries ?? 2;
    if (maxIterations <= 0 || maxFailureRetries < 0) throw new Error('WORKFLOW_LIMIT_INVALID');
    const id = input.id ?? randomUUID();
    const now = this.now();
    return this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO workflow_runs (
            id, correlation_id, project_id, state, idempotency_key,
            iteration_count, failure_retries, max_iterations, max_failure_retries,
            recovery_status, created_at, updated_at
          ) VALUES (?, ?, ?, 'idle', ?, 0, 0, ?, ?, 'none', ?, ?)`,
        )
        .run(
          id,
          correlationId,
          projectId,
          idempotencyKey,
          maxIterations,
          maxFailureRetries,
          now,
          now,
        );
      this.insertEvent(id, undefined, 'idle', 'workflow.created', 'system', {}, now);
      const created = this.getRun(id);
      if (!created) throw new Error('WORKFLOW_CREATE_FAILED');
      return created;
    })();
  }

  private insertEvent(
    workflowRunId: string,
    fromState: WorkflowState | undefined,
    toState: WorkflowState,
    eventType: string,
    actor: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): void {
    const sequence = (
      this.database
        .prepare(
          'SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM workflow_events WHERE workflow_run_id = ?',
        )
        .get(workflowRunId) as { sequence: number }
    ).sequence;
    this.database
      .prepare(
        `INSERT INTO workflow_events (
          id, workflow_run_id, sequence, from_state, to_state, event_type,
          actor, payload_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        workflowRunId,
        sequence,
        fromState ?? null,
        toState,
        requireText(eventType, 'WORKFLOW_EVENT_TYPE_REQUIRED'),
        requireText(actor, 'WORKFLOW_ACTOR_REQUIRED'),
        JSON.stringify(payload),
        occurredAt,
      );
  }

  private transitionInTransaction(run: WorkflowRun, input: TransitionInput): WorkflowRun {
    const toState = workflowStateSchema.parse(input.toState);
    if (!transitions[run.state].includes(toState)) {
      throw new Error(`WORKFLOW_INVALID_TRANSITION:${run.state}:${toState}`);
    }
    let iterationCount = run.iterationCount;
    let failureRetries = run.failureRetries;
    if (toState === 'sent_to_codex') {
      if (iterationCount >= run.maxIterations) throw new Error('WORKFLOW_ITERATION_LIMIT');
      iterationCount += 1;
    }
    if (input.eventType === 'workflow.retry') {
      if (failureRetries >= run.maxFailureRetries) throw new Error('WORKFLOW_RETRY_LIMIT');
      failureRetries += 1;
    }
    const now = this.now();
    this.insertEvent(
      run.id,
      run.state,
      toState,
      input.eventType,
      input.actor,
      input.payload ?? {},
      now,
    );
    this.fault('after_event_insert');
    this.fault('before_projection_update');
    this.database
      .prepare(
        `UPDATE workflow_runs SET state = ?, iteration_count = ?, failure_retries = ?,
          last_error_code = ?, updated_at = ? WHERE id = ?`,
      )
      .run(toState, iterationCount, failureRetries, input.errorCode ?? null, now, run.id);
    appendAuditEvent(this.database, {
      id: randomUUID(),
      eventType: input.eventType,
      actor: input.actor,
      projectId: run.projectId,
      correlationId: run.correlationId,
      resourceType: 'workflow_run',
      resourceId: run.id,
      outcome: toState === 'failed' ? 'failed' : 'allowed',
      details: { fromState: run.state, toState },
      createdAt: now,
    });
    const updated = this.getRun(run.id);
    if (!updated) throw new Error('WORKFLOW_TRANSITION_FAILED');
    return updated;
  }

  public transition(id: string, input: TransitionInput): WorkflowRun {
    return this.database.transaction(() => {
      const run = this.getRun(id);
      if (!run) throw new Error('WORKFLOW_NOT_FOUND');
      return this.transitionInTransaction(run, input);
    })();
  }

  public rebuildProjection(id: string): WorkflowRun {
    const event = this.database
      .prepare(
        'SELECT * FROM workflow_events WHERE workflow_run_id = ? ORDER BY sequence DESC LIMIT 1',
      )
      .get(id) as EventRow | undefined;
    if (!event) throw new Error('WORKFLOW_EVENT_HISTORY_MISSING');
    this.database
      .prepare('UPDATE workflow_runs SET state = ?, updated_at = ? WHERE id = ?')
      .run(event.to_state, event.occurred_at, id);
    const rebuilt = this.getRun(id);
    if (!rebuilt) throw new Error('WORKFLOW_NOT_FOUND');
    return rebuilt;
  }

  public issueApproval(input: IssueApprovalInput): { approval: WorkflowApproval; token: string } {
    if (input.ttlMs <= 0 || input.ttlMs > 15 * 60_000) throw new Error('APPROVAL_TTL_INVALID');
    const operation = workflowOperationSchema.parse(input.operation);
    const run = this.getRun(input.workflowRunId);
    if (!run) throw new Error('WORKFLOW_NOT_FOUND');
    const expectedState =
      operation === 'send_chatgpt' ? 'context_approved' : 'codex_prompt_approved';
    if (run.state !== expectedState) throw new Error('APPROVAL_STATE_INVALID');
    const token = randomBytes(32).toString('base64url');
    const approvedAt = this.now();
    const expiresAt = new Date(Date.parse(approvedAt) + input.ttlMs).toISOString();
    const id = input.id ?? randomUUID();
    const destinationType = requireText(
      input.destinationType,
      'APPROVAL_DESTINATION_TYPE_REQUIRED',
    );
    const destinationId = requireText(input.destinationId, 'APPROVAL_DESTINATION_ID_REQUIRED');
    const payloadHash = requireHash(input.payloadHash, 'APPROVAL_PAYLOAD_HASH_INVALID');
    return this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO user_approvals (
            id, workflow_run_id, action, approval_token_hash, approved_at, expires_at,
            project_id, scope, destination_type, destination_id, payload_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'single_send', ?, ?, ?)`,
        )
        .run(
          id,
          run.id,
          operation,
          tokenHash(token),
          approvedAt,
          expiresAt,
          run.projectId,
          destinationType,
          destinationId,
          payloadHash,
        );
      appendAuditEvent(this.database, {
        id: randomUUID(),
        eventType: 'workflow.approval.issued',
        actor: 'user',
        projectId: run.projectId,
        correlationId: run.correlationId,
        resourceType: 'user_approval',
        resourceId: id,
        outcome: 'allowed',
        details: { action: operation, destinationType },
        createdAt: approvedAt,
      });
      const row = this.database.prepare('SELECT * FROM user_approvals WHERE id = ?').get(id) as
        ApprovalRow | undefined;
      if (!row) throw new Error('APPROVAL_CREATE_FAILED');
      return { approval: this.mapApproval(row), token };
    })();
  }

  private equivalentEffect(effect: WorkflowEffect, input: PrepareSendInput): boolean {
    return (
      effect.workflowRunId === input.workflowRunId &&
      effect.operation === input.operation &&
      effect.handoffHash === input.handoffHash &&
      effect.payloadHash === input.payloadHash &&
      effect.destinationType === input.destinationType &&
      effect.destinationId === input.destinationId
    );
  }

  public prepareSend(input: PrepareSendInput): { effect: WorkflowEffect; duplicate: boolean } {
    return this.database.transaction(() => {
      const operation = workflowOperationSchema.parse(input.operation);
      const idempotencyKey = requireText(input.idempotencyKey, 'EFFECT_IDEMPOTENCY_REQUIRED');
      const handoffHash = requireHash(input.handoffHash, 'EFFECT_HANDOFF_HASH_INVALID');
      const payloadHash = requireHash(input.payloadHash, 'EFFECT_PAYLOAD_HASH_INVALID');
      const destinationType = requireText(
        input.destinationType,
        'EFFECT_DESTINATION_TYPE_REQUIRED',
      );
      const destinationId = requireText(input.destinationId, 'EFFECT_DESTINATION_ID_REQUIRED');
      const normalizedInput = {
        ...input,
        operation,
        idempotencyKey,
        handoffHash,
        payloadHash,
        destinationType,
        destinationId,
      };
      const byKey = this.database
        .prepare('SELECT * FROM workflow_effects WHERE idempotency_key = ?')
        .get(idempotencyKey) as EffectRow | undefined;
      if (byKey) {
        const effect = this.mapEffect(byKey);
        if (!this.equivalentEffect(effect, normalizedInput)) {
          throw new Error('EFFECT_IDEMPOTENCY_CONFLICT');
        }
        return { effect, duplicate: true };
      }
      const byHandoff = this.database
        .prepare(
          `SELECT * FROM workflow_effects
           WHERE workflow_run_id = ? AND operation = ? AND handoff_hash = ?
             AND destination_type = ? AND destination_id = ?`,
        )
        .get(input.workflowRunId, operation, handoffHash, destinationType, destinationId) as
        EffectRow | undefined;
      if (byHandoff) {
        const effect = this.mapEffect(byHandoff);
        if (!this.equivalentEffect(effect, normalizedInput)) {
          throw new Error('EFFECT_HANDOFF_CONFLICT');
        }
        return { effect, duplicate: true };
      }

      const run = this.getRun(input.workflowRunId);
      if (!run) throw new Error('WORKFLOW_NOT_FOUND');
      const expectedState =
        operation === 'send_chatgpt' ? 'context_approved' : 'codex_prompt_approved';
      if (run.state !== expectedState) throw new Error('EFFECT_STATE_INVALID');
      const approvalRow = this.database
        .prepare('SELECT * FROM user_approvals WHERE id = ?')
        .get(input.approvalId) as ApprovalRow | undefined;
      if (!approvalRow) throw new Error('APPROVAL_NOT_FOUND');
      const approval = this.mapApproval(approvalRow);
      const now = this.now();
      if (approval.workflowRunId !== run.id || approval.projectId !== run.projectId) {
        throw new Error('APPROVAL_PROJECT_MISMATCH');
      }
      if (
        approval.action !== operation ||
        approval.destinationType !== destinationType ||
        approval.destinationId !== destinationId
      ) {
        throw new Error('APPROVAL_SCOPE_MISMATCH');
      }
      if (approval.payloadHash !== payloadHash) {
        throw new Error('APPROVAL_PAYLOAD_MISMATCH');
      }
      if (approval.consumedAt) throw new Error('APPROVAL_ALREADY_CONSUMED');
      if (Date.parse(approval.expiresAt) <= Date.parse(now)) throw new Error('APPROVAL_EXPIRED');
      if (!safeTokenEqual(approvalRow.approval_token_hash, input.approvalToken)) {
        throw new Error('APPROVAL_TOKEN_INVALID');
      }

      const effectId = input.effectId ?? randomUUID();
      this.database
        .prepare(
          `INSERT INTO workflow_effects (
            id, workflow_run_id, operation, idempotency_key, handoff_hash, payload_hash,
            destination_type, destination_id, approval_id, status, prepared_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?)`,
        )
        .run(
          effectId,
          run.id,
          operation,
          idempotencyKey,
          handoffHash,
          payloadHash,
          destinationType,
          destinationId,
          approval.id,
          now,
        );
      this.fault('after_effect_insert');
      this.database
        .prepare('UPDATE user_approvals SET consumed_at = ? WHERE id = ?')
        .run(now, approval.id);
      this.fault('after_approval_consume');
      this.database
        .prepare(
          "UPDATE workflow_runs SET recovery_status = 'pending', updated_at = ? WHERE id = ?",
        )
        .run(now, run.id);
      appendAuditEvent(this.database, {
        id: randomUUID(),
        eventType: `${operation}.prepared`,
        actor: 'workflow.engine',
        projectId: run.projectId,
        correlationId: run.correlationId,
        resourceType: 'workflow_effect',
        resourceId: effectId,
        outcome: 'allowed',
        details: { destinationType },
        createdAt: now,
      });
      const effect = this.getEffect(effectId);
      if (!effect) throw new Error('EFFECT_CREATE_FAILED');
      return { effect, duplicate: false };
    })();
  }

  public beginDispatch(effectId: string): WorkflowEffect {
    return this.database.transaction(() => {
      const effect = this.getEffect(effectId);
      if (!effect) throw new Error('EFFECT_NOT_FOUND');
      if (effect.status === 'dispatching' || effect.status === 'acknowledged') return effect;
      if (effect.status !== 'prepared') throw new Error('EFFECT_NOT_DISPATCHABLE');
      const now = this.now();
      this.database
        .prepare(
          "UPDATE workflow_effects SET status = 'dispatching', dispatch_started_at = ? WHERE id = ?",
        )
        .run(now, effect.id);
      this.database
        .prepare(
          "UPDATE workflow_runs SET recovery_status = 'confirmation_required', updated_at = ? WHERE id = ?",
        )
        .run(now, effect.workflowRunId);
      this.fault('after_dispatch_mark');
      const updated = this.getEffect(effect.id);
      if (!updated) throw new Error('EFFECT_DISPATCH_FAILED');
      return updated;
    })();
  }

  public acknowledge(effectId: string, result: Record<string, unknown>): WorkflowEffect {
    return this.database.transaction(() => {
      const effect = this.getEffect(effectId);
      if (!effect) throw new Error('EFFECT_NOT_FOUND');
      if (effect.status === 'acknowledged') return effect;
      if (effect.status !== 'dispatching') throw new Error('EFFECT_NOT_DISPATCHING');
      const run = this.getRun(effect.workflowRunId);
      if (!run) throw new Error('WORKFLOW_NOT_FOUND');
      const now = this.now();
      this.database
        .prepare(
          `UPDATE workflow_effects SET status = 'acknowledged', result_json = ?,
            acknowledged_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(result), now, effect.id);
      this.fault('after_ack_mark');
      this.database
        .prepare("UPDATE workflow_runs SET recovery_status = 'none', updated_at = ? WHERE id = ?")
        .run(now, run.id);
      this.transitionInTransaction(run, {
        toState: effect.operation === 'send_chatgpt' ? 'sent_to_chatgpt' : 'sent_to_codex',
        eventType: `${effect.operation}.acknowledged`,
        actor: 'workflow.engine',
        payload: { effectId: effect.id },
      });
      const acknowledged = this.getEffect(effect.id);
      if (!acknowledged) throw new Error('EFFECT_ACKNOWLEDGE_FAILED');
      return acknowledged;
    })();
  }

  public failEffect(effectId: string, errorCode: string): WorkflowEffect {
    return this.database.transaction(() => {
      const effect = this.getEffect(effectId);
      if (!effect) throw new Error('EFFECT_NOT_FOUND');
      if (effect.status === 'acknowledged') throw new Error('EFFECT_ALREADY_ACKNOWLEDGED');
      if (effect.status === 'failed') return effect;
      const now = this.now();
      this.database
        .prepare("UPDATE workflow_effects SET status = 'failed', failed_at = ? WHERE id = ?")
        .run(now, effect.id);
      this.database
        .prepare(
          "UPDATE workflow_runs SET recovery_status = 'none', last_error_code = ?, updated_at = ? WHERE id = ?",
        )
        .run(requireText(errorCode, 'EFFECT_ERROR_CODE_REQUIRED'), now, effect.workflowRunId);
      const failed = this.getEffect(effect.id);
      if (!failed) throw new Error('EFFECT_FAIL_FAILED');
      return failed;
    })();
  }

  public recover(workflowRunId: string): WorkflowRecoveryItem[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM workflow_effects
         WHERE workflow_run_id = ? AND status IN ('prepared', 'dispatching', 'acknowledged')
         ORDER BY prepared_at, id`,
      )
      .all(workflowRunId) as EffectRow[];
    return rows.map((row) => {
      const effect = this.mapEffect(row);
      return workflowRecoveryItemSchema.parse({
        effect,
        action:
          effect.status === 'prepared'
            ? 'safe_to_dispatch'
            : effect.status === 'dispatching'
              ? 'confirmation_required'
              : 'none',
      });
    });
  }
}
