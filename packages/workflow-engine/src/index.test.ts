import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, type SqliteDatabase } from '@codex-context-bridge/database';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkflowEngine, type WorkflowEngineOptions } from './index';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const START = '2026-07-18T10:00:00.000Z';

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) {
    if (database.open) database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function setup(options: WorkflowEngineOptions = {}): {
  database: SqliteDatabase;
  engine: WorkflowEngine;
} {
  const database = openDatabase(':memory:');
  databases.push(database);
  insertProject(database, 'project-1');
  insertProject(database, 'project-2');
  return { database, engine: new WorkflowEngine(database, { now: () => START, ...options }) };
}

function insertProject(database: SqliteDatabase, id: string): void {
  database
    .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, id, START, START);
}

function createWorkflow(
  engine: WorkflowEngine,
  suffix = '1',
  limits: { maxIterations?: number; maxFailureRetries?: number } = {},
) {
  return engine.create({
    id: `workflow-${suffix}`,
    correlationId: `correlation-${suffix}`,
    projectId: `project-${suffix}`,
    idempotencyKey: `workflow-key-${suffix}`,
    ...limits,
  });
}

function transition(
  engine: WorkflowEngine,
  workflowRunId: string,
  toState: Parameters<WorkflowEngine['transition']>[1]['toState'],
  eventType = `workflow.${toState}`,
) {
  return engine.transition(workflowRunId, { toState, eventType, actor: 'test' });
}

function reachContextApproved(engine: WorkflowEngine, suffix = '1') {
  const run = createWorkflow(engine, suffix);
  transition(engine, run.id, 'project_resolving');
  transition(engine, run.id, 'codex_running');
  transition(engine, run.id, 'codex_completed');
  transition(engine, run.id, 'building_context');
  transition(engine, run.id, 'context_review_required');
  return transition(engine, run.id, 'context_approved');
}

function issueChatGptApproval(
  engine: WorkflowEngine,
  workflowRunId: string,
  overrides: Partial<Parameters<WorkflowEngine['issueApproval']>[0]> = {},
) {
  return engine.issueApproval({
    id: `approval-${workflowRunId}`,
    workflowRunId,
    operation: 'send_chatgpt',
    destinationType: 'conversation',
    destinationId: 'chat-1',
    payloadHash: HASH_A,
    ttlMs: 60_000,
    ...overrides,
  });
}

function prepareChatGpt(
  engine: WorkflowEngine,
  workflowRunId: string,
  approval: ReturnType<typeof issueChatGptApproval>,
  overrides: Partial<Parameters<WorkflowEngine['prepareSend']>[0]> = {},
) {
  return engine.prepareSend({
    effectId: `effect-${workflowRunId}`,
    workflowRunId,
    operation: 'send_chatgpt',
    idempotencyKey: `effect-key-${workflowRunId}`,
    handoffHash: HASH_B,
    payloadHash: HASH_A,
    destinationType: 'conversation',
    destinationId: 'chat-1',
    approvalId: approval.approval.id,
    approvalToken: approval.token,
    ...overrides,
  });
}

describe('workflow transitions', () => {
  it('persists monotonic events and rejects invalid or terminal transitions', () => {
    const { engine } = setup();
    const run = createWorkflow(engine);

    transition(engine, run.id, 'project_resolving');
    transition(engine, run.id, 'cancelled');

    expect(engine.listEvents(run.id).map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(() => transition(engine, run.id, 'codex_running')).toThrow(
      'WORKFLOW_INVALID_TRANSITION:cancelled:codex_running',
    );
  });

  it.each(['after_event_insert', 'before_projection_update'] as const)(
    'rolls back event and projection at %s',
    (faultPoint) => {
      let activeFault: string | undefined = faultPoint;
      const { engine } = setup({
        fault: (point) => {
          if (point === activeFault) throw new Error(`FAULT:${point}`);
        },
      });
      const run = createWorkflow(engine);

      expect(() => transition(engine, run.id, 'project_resolving')).toThrow(`FAULT:${faultPoint}`);
      expect(engine.getRun(run.id)?.state).toBe('idle');
      expect(engine.listEvents(run.id)).toHaveLength(1);

      activeFault = undefined;
      expect(transition(engine, run.id, 'project_resolving').state).toBe('project_resolving');
    },
  );

  it('enforces retry limits transactionally', () => {
    const { engine } = setup();
    const run = createWorkflow(engine, '1', { maxFailureRetries: 1 });
    transition(engine, run.id, 'project_resolving');
    transition(engine, run.id, 'codex_running');
    transition(engine, run.id, 'codex_failed');
    transition(engine, run.id, 'codex_running', 'workflow.retry');
    transition(engine, run.id, 'codex_failed');

    expect(() => transition(engine, run.id, 'codex_running', 'workflow.retry')).toThrow(
      'WORKFLOW_RETRY_LIMIT',
    );
    expect(engine.getRun(run.id)?.failureRetries).toBe(1);
    expect(engine.getRun(run.id)?.state).toBe('codex_failed');
  });

  it('rebuilds a corrupted state projection from event history', () => {
    const { database, engine } = setup();
    const run = createWorkflow(engine);
    transition(engine, run.id, 'project_resolving');
    database.prepare("UPDATE workflow_runs SET state = 'failed' WHERE id = ?").run(run.id);

    expect(engine.rebuildProjection(run.id).state).toBe('project_resolving');
  });

  it('returns an idempotent workflow and stable correlation conflicts', () => {
    const { engine } = setup();
    const first = createWorkflow(engine);

    expect(
      engine.create({
        correlationId: ' correlation-1 ',
        projectId: ' project-1 ',
        idempotencyKey: ' workflow-key-1 ',
      }).id,
    ).toBe(first.id);
    expect(() =>
      engine.create({
        correlationId: 'correlation-1',
        projectId: 'project-1',
        idempotencyKey: 'different-key',
      }),
    ).toThrow('WORKFLOW_CORRELATION_CONFLICT');
  });
});

describe('single-use approvals and effect preparation', () => {
  it('binds approval to workflow, project, operation, destination, and payload', () => {
    const { engine } = setup();
    const first = reachContextApproved(engine, '1');
    const second = reachContextApproved(engine, '2');
    const firstApproval = issueChatGptApproval(engine, first.id);
    const secondApproval = issueChatGptApproval(engine, second.id);

    expect(() =>
      prepareChatGpt(engine, first.id, secondApproval, { effectId: 'wrong-project' }),
    ).toThrow('APPROVAL_PROJECT_MISMATCH');
    expect(() =>
      prepareChatGpt(engine, first.id, firstApproval, {
        effectId: 'wrong-operation',
        operation: 'send_codex',
      }),
    ).toThrow('EFFECT_STATE_INVALID');
    expect(() =>
      prepareChatGpt(engine, first.id, firstApproval, {
        effectId: 'wrong-destination',
        destinationId: 'chat-2',
      }),
    ).toThrow('APPROVAL_SCOPE_MISMATCH');
    expect(() =>
      prepareChatGpt(engine, first.id, firstApproval, {
        effectId: 'mutated-payload',
        payloadHash: HASH_C,
      }),
    ).toThrow('APPROVAL_PAYLOAD_MISMATCH');
  });

  it('rejects an unknown operation before persistence', () => {
    const { database, engine } = setup();
    const run = reachContextApproved(engine);

    expect(() =>
      engine.issueApproval({
        workflowRunId: run.id,
        operation: 'unknown' as 'send_chatgpt',
        destinationType: 'conversation',
        destinationId: 'chat-1',
        payloadHash: HASH_A,
        ttlMs: 60_000,
      }),
    ).toThrow();
    expect(database.prepare('SELECT COUNT(*) AS count FROM user_approvals').get()).toEqual({
      count: 0,
    });
  });

  it('rejects invalid, expired, and consumed approval tokens', () => {
    let now = START;
    const { engine } = setup({ now: () => now });
    const run = reachContextApproved(engine);
    const approval = issueChatGptApproval(engine, run.id, { ttlMs: 1_000 });

    expect(() =>
      prepareChatGpt(engine, run.id, approval, {
        effectId: 'invalid-token',
        approvalToken: 'invalid',
      }),
    ).toThrow('APPROVAL_TOKEN_INVALID');

    now = '2026-07-18T10:00:01.000Z';
    expect(() => prepareChatGpt(engine, run.id, approval, { effectId: 'expired' })).toThrow(
      'APPROVAL_EXPIRED',
    );

    now = '2026-07-18T10:00:00.500Z';
    prepareChatGpt(engine, run.id, approval);
    expect(() =>
      engine.prepareSend({
        workflowRunId: run.id,
        operation: 'send_chatgpt',
        idempotencyKey: 'new-key',
        handoffHash: HASH_C,
        payloadHash: HASH_A,
        destinationType: 'conversation',
        destinationId: 'chat-1',
        approvalId: approval.approval.id,
        approvalToken: approval.token,
      }),
    ).toThrow('APPROVAL_ALREADY_CONSUMED');
  });

  it('normalizes hashes and returns the existing effect for an identical idempotent retry', () => {
    const { engine } = setup();
    const run = reachContextApproved(engine);
    const approval = issueChatGptApproval(engine, run.id, { payloadHash: HASH_A.toUpperCase() });
    const prepared = prepareChatGpt(engine, run.id, approval, {
      idempotencyKey: ' effect-key ',
      handoffHash: HASH_B.toUpperCase(),
      payloadHash: HASH_A.toUpperCase(),
      destinationType: ' conversation ',
      destinationId: ' chat-1 ',
    });

    expect(prepared.effect).toMatchObject({
      idempotencyKey: 'effect-key',
      handoffHash: HASH_B,
      payloadHash: HASH_A,
      destinationType: 'conversation',
      destinationId: 'chat-1',
    });
    const duplicate = prepareChatGpt(engine, run.id, approval, {
      effectId: 'ignored-on-retry',
      idempotencyKey: 'effect-key',
    });
    expect(duplicate).toEqual({ effect: prepared.effect, duplicate: true });
  });

  it('rejects conflicting idempotency and handoff reuse', () => {
    const { engine } = setup();
    const run = reachContextApproved(engine);
    const approval = issueChatGptApproval(engine, run.id);
    prepareChatGpt(engine, run.id, approval);

    expect(() =>
      prepareChatGpt(engine, run.id, approval, {
        handoffHash: HASH_C,
      }),
    ).toThrow('EFFECT_IDEMPOTENCY_CONFLICT');
    expect(() =>
      prepareChatGpt(engine, run.id, approval, {
        idempotencyKey: 'different-key',
        payloadHash: HASH_C,
      }),
    ).toThrow('EFFECT_HANDOFF_CONFLICT');
  });

  it.each(['after_effect_insert', 'after_approval_consume'] as const)(
    'rolls back the effect and approval consumption at %s',
    (faultPoint) => {
      let activeFault: string | undefined = faultPoint;
      const { database, engine } = setup({
        fault: (point) => {
          if (point === activeFault) throw new Error(`FAULT:${point}`);
        },
      });
      const run = reachContextApproved(engine);
      const approval = issueChatGptApproval(engine, run.id);

      expect(() => prepareChatGpt(engine, run.id, approval)).toThrow(`FAULT:${faultPoint}`);
      expect(database.prepare('SELECT COUNT(*) AS count FROM workflow_effects').get()).toEqual({
        count: 0,
      });
      expect(
        database
          .prepare('SELECT consumed_at FROM user_approvals WHERE id = ?')
          .get(approval.approval.id),
      ).toEqual({ consumed_at: null });
      expect(engine.getRun(run.id)?.recoveryStatus).toBe('none');

      activeFault = undefined;
      expect(prepareChatGpt(engine, run.id, approval).duplicate).toBe(false);
    },
  );

  it('stores only the token hash and audits approval plus preparation', () => {
    const { database, engine } = setup();
    const run = reachContextApproved(engine);
    const approval = issueChatGptApproval(engine, run.id);
    prepareChatGpt(engine, run.id, approval);

    const stored = database
      .prepare('SELECT approval_token_hash FROM user_approvals WHERE id = ?')
      .get(approval.approval.id) as { approval_token_hash: string };
    expect(stored.approval_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.approval_token_hash).not.toBe(approval.token);
    expect(
      database
        .prepare(
          "SELECT event_type FROM audit_events WHERE resource_type IN ('user_approval', 'workflow_effect') ORDER BY created_at, rowid",
        )
        .all(),
    ).toEqual([
      { event_type: 'workflow.approval.issued' },
      { event_type: 'send_chatgpt.prepared' },
    ]);
  });
});

describe('dispatch acknowledgement and crash recovery', () => {
  it('never auto-resends a dispatching effect after a crash', () => {
    let activeFault: string | undefined = 'after_dispatch_mark';
    const { engine } = setup({
      fault: (point) => {
        if (point === activeFault) throw new Error(`FAULT:${point}`);
      },
    });
    const run = reachContextApproved(engine);
    const approval = issueChatGptApproval(engine, run.id);
    const prepared = prepareChatGpt(engine, run.id, approval).effect;

    expect(() => engine.beginDispatch(prepared.id)).toThrow('FAULT:after_dispatch_mark');
    expect(engine.getEffect(prepared.id)?.status).toBe('prepared');
    expect(engine.recover(run.id)[0]?.action).toBe('safe_to_dispatch');

    activeFault = undefined;
    engine.beginDispatch(prepared.id);
    expect(engine.recover(run.id)[0]?.action).toBe('confirmation_required');
    expect(engine.beginDispatch(prepared.id).status).toBe('dispatching');
  });

  it('rolls back a partial acknowledgement and retries without duplicate transfer', () => {
    let activeFault: string | undefined = 'after_ack_mark';
    const { engine } = setup({
      fault: (point) => {
        if (point === activeFault) throw new Error(`FAULT:${point}`);
      },
    });
    const run = reachContextApproved(engine);
    const approval = issueChatGptApproval(engine, run.id);
    const effect = prepareChatGpt(engine, run.id, approval).effect;
    engine.beginDispatch(effect.id);

    expect(() => engine.acknowledge(effect.id, { messageId: 'message-1' })).toThrow(
      'FAULT:after_ack_mark',
    );
    expect(engine.getEffect(effect.id)?.status).toBe('dispatching');
    expect(engine.getRun(run.id)).toMatchObject({
      state: 'context_approved',
      recoveryStatus: 'confirmation_required',
    });

    activeFault = undefined;
    expect(engine.acknowledge(effect.id, { messageId: 'message-1' })).toMatchObject({
      status: 'acknowledged',
      result: { messageId: 'message-1' },
    });
    expect(engine.getRun(run.id)).toMatchObject({
      state: 'sent_to_chatgpt',
      recoveryStatus: 'none',
    });
    expect(engine.acknowledge(effect.id, { ignored: true }).result).toEqual({
      messageId: 'message-1',
    });
  });

  it('increments the iteration limit only after an acknowledged Codex send', () => {
    const { database, engine } = setup();
    const run = createWorkflow(engine, '1', { maxIterations: 1 });
    database
      .prepare("UPDATE workflow_runs SET state = 'codex_prompt_approved' WHERE id = ?")
      .run(run.id);
    const approval = engine.issueApproval({
      workflowRunId: run.id,
      operation: 'send_codex',
      destinationType: 'thread',
      destinationId: 'codex-1',
      payloadHash: HASH_A,
      ttlMs: 60_000,
    });
    const effect = engine.prepareSend({
      workflowRunId: run.id,
      operation: 'send_codex',
      idempotencyKey: 'codex-effect-1',
      handoffHash: HASH_B,
      payloadHash: HASH_A,
      destinationType: 'thread',
      destinationId: 'codex-1',
      approvalId: approval.approval.id,
      approvalToken: approval.token,
    }).effect;

    expect(engine.getRun(run.id)?.iterationCount).toBe(0);
    engine.beginDispatch(effect.id);
    engine.acknowledge(effect.id, { threadId: 'codex-1' });
    expect(engine.getRun(run.id)?.iterationCount).toBe(1);

    database
      .prepare("UPDATE workflow_runs SET state = 'codex_prompt_approved' WHERE id = ?")
      .run(run.id);
    const secondApproval = engine.issueApproval({
      workflowRunId: run.id,
      operation: 'send_codex',
      destinationType: 'thread',
      destinationId: 'codex-1',
      payloadHash: HASH_C,
      ttlMs: 60_000,
    });
    const secondEffect = engine.prepareSend({
      workflowRunId: run.id,
      operation: 'send_codex',
      idempotencyKey: 'codex-effect-2',
      handoffHash: HASH_C,
      payloadHash: HASH_C,
      destinationType: 'thread',
      destinationId: 'codex-1',
      approvalId: secondApproval.approval.id,
      approvalToken: secondApproval.token,
    }).effect;
    engine.beginDispatch(secondEffect.id);
    expect(() => engine.acknowledge(secondEffect.id, {})).toThrow('WORKFLOW_ITERATION_LIMIT');
    expect(engine.getEffect(secondEffect.id)?.status).toBe('dispatching');
  });

  it('recovers a prepared effect after reopening SQLite', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-workflow-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'workflow.sqlite');
    const firstDatabase = openDatabase(databasePath);
    databases.push(firstDatabase);
    insertProject(firstDatabase, 'project-1');
    const firstEngine = new WorkflowEngine(firstDatabase, { now: () => START });
    const run = reachContextApproved(firstEngine);
    const approval = issueChatGptApproval(firstEngine, run.id);
    const effect = prepareChatGpt(firstEngine, run.id, approval).effect;
    firstDatabase.close();

    const reopenedDatabase = openDatabase(databasePath);
    databases.push(reopenedDatabase);
    const reopenedEngine = new WorkflowEngine(reopenedDatabase, { now: () => START });
    expect(reopenedEngine.recover(run.id)).toEqual([
      { effect: reopenedEngine.getEffect(effect.id), action: 'safe_to_dispatch' },
    ]);
  });

  it('marks a failed dispatch without making it recoverable or resendable', () => {
    const { engine } = setup();
    const run = reachContextApproved(engine);
    const approval = issueChatGptApproval(engine, run.id);
    const effect = prepareChatGpt(engine, run.id, approval).effect;
    engine.beginDispatch(effect.id);

    expect(engine.failEffect(effect.id, 'CHATGPT_SEND_FAILED')).toMatchObject({ status: 'failed' });
    expect(engine.getRun(run.id)).toMatchObject({
      state: 'context_approved',
      recoveryStatus: 'none',
      lastErrorCode: 'CHATGPT_SEND_FAILED',
    });
    expect(engine.recover(run.id)).toEqual([]);
    expect(() => engine.beginDispatch(effect.id)).toThrow('EFFECT_NOT_DISPATCHABLE');
  });
});
