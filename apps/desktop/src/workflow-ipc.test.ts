import { openDatabase } from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { describe, expect, it } from 'vitest';
import type { IpcInvokeEventLike, IpcMainLike } from './ipc';
import {
  createWorkflowDesktopService,
  registerWorkflowIpc,
  workflowIpcChannels,
} from './workflow-ipc';

class FakeIpcMain implements IpcMainLike {
  public readonly handlers = new Map<
    string,
    (event: IpcInvokeEventLike, input?: unknown) => Promise<unknown>
  >();

  public handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input?: unknown) => Promise<unknown>,
  ): void {
    this.handlers.set(channel, listener);
  }
}

describe('workflow desktop boundary', () => {
  it('lists persisted events and cancels through the workflow engine', async () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => '2026-07-18T11:00:00.000Z');
    registry.create('Bridge', 'project-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-18T11:00:00.000Z' });
    const service = createWorkflowDesktopService(database, workflows);
    const created = await service.start('project-1');

    expect((await service.list('project-1'))[0]).toMatchObject({
      run: { id: created.run.id, state: 'idle' },
      events: [{ eventType: 'workflow.created' }],
      approvals: [],
      recovery: [],
    });

    expect(await service.cancel(created.run.id)).toMatchObject({
      run: { state: 'cancelled' },
      events: [{ eventType: 'workflow.created' }, { eventType: 'workflow.cancelled_by_user' }],
    });
    expect(() => service.cancel(created.run.id)).toThrow('WORKFLOW_NOT_CANCELLABLE');
    database.close();
  });

  it('advances the exact idle workflow to the safe review gate and records rejected repeat starts', async () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => '2026-07-22T09:00:00.000Z');
    registry.create('Bridge', 'project-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-22T09:00:00.000Z' });
    const service = createWorkflowDesktopService(database, workflows);
    const first = await service.start('project-1');
    const second = await service.start('project-1');

    expect(await service.run(first.run.id)).toMatchObject({
      run: { id: first.run.id, state: 'context_review_required' },
      events: [
        { eventType: 'workflow.created' },
        { eventType: 'workflow.started_by_user' },
        { eventType: 'workflow.context.building' },
        { eventType: 'workflow.context.review_required' },
      ],
    });
    expect(
      (await service.list('project-1')).find((item) => item.run.id === second.run.id),
    ).toMatchObject({ run: { state: 'idle' } });
    expect(() => service.run(first.run.id)).toThrow('WORKFLOW_NOT_RUNNABLE');
    expect(
      database
        .prepare(
          "SELECT outcome, details_json FROM audit_events WHERE event_type = 'workflow.start.blocked'",
        )
        .get(),
    ).toMatchObject({
      outcome: 'blocked',
      details_json: JSON.stringify({ errorCode: 'WORKFLOW_NOT_RUNNABLE' }),
    });
    database.close();
  });

  it('persists bounded controlled notes without exposing their text in audit details', async () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => '2026-07-22T09:00:00.000Z');
    registry.create('Bridge', 'project-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-22T09:00:00.000Z' });
    const service = createWorkflowDesktopService(database, workflows, {
      now: () => '2026-07-22T09:00:01.000Z',
    });
    const created = await service.start('project-1');

    const updated = await service.updateNotes({
      workflowRunId: created.run.id,
      notes: [
        { target: 'codex', mode: 'repeat', text: '  Kiểm tra mobile trước.  ' },
        { target: 'chatgpt', mode: 'once', text: 'Tóm tắt ngắn gọn.' },
      ],
    });

    expect(updated.operatorNotes).toEqual([
      expect.objectContaining({
        target: 'codex',
        mode: 'repeat',
        text: 'Kiểm tra mobile trước.',
        createdAt: '2026-07-22T09:00:01.000Z',
      }),
      expect.objectContaining({
        target: 'chatgpt',
        mode: 'once',
        text: 'Tóm tắt ngắn gọn.',
        createdAt: '2026-07-22T09:00:01.000Z',
      }),
    ]);
    expect((await service.list('project-1'))[0]?.operatorNotes).toEqual(updated.operatorNotes);
    const audit = database
      .prepare(
        "SELECT details_json FROM audit_events WHERE event_type = 'workflow.notes.updated' AND resource_id = ?",
      )
      .get(created.run.id) as { details_json: string };
    expect(JSON.parse(audit.details_json)).toEqual({
      noteCount: 2,
      chatgptCount: 1,
      codexCount: 1,
      repeatCount: 1,
    });
    expect(audit.details_json).not.toContain('Kiểm tra mobile trước');
    expect(audit.details_json).not.toContain('Tóm tắt ngắn gọn');
    database.close();
  });

  it('reruns a stopped workflow as a new reviewed run with fresh copied note identities', async () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => '2026-07-22T09:00:00.000Z');
    registry.create('Bridge', 'project-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-22T09:00:00.000Z' });
    const service = createWorkflowDesktopService(database, workflows, {
      now: () => '2026-07-22T09:00:01.000Z',
    });
    const original = await service.start('project-1');
    const withNotes = await service.updateNotes({
      workflowRunId: original.run.id,
      notes: [{ target: 'codex', mode: 'repeat', text: 'Giữ kiểm tra hồi quy.' }],
    });
    await service.cancel(original.run.id);

    const rerun = await service.rerun(original.run.id);

    expect(workflows.getRun(original.run.id)?.state).toBe('cancelled');
    expect(rerun.run).toMatchObject({
      projectId: original.run.projectId,
      state: 'context_review_required',
    });
    expect(rerun.run.id).not.toBe(original.run.id);
    expect(rerun.events).toMatchObject([
      { eventType: 'workflow.created' },
      {
        eventType: 'workflow.rerun_started_by_user',
        payload: { sourceWorkflowRunId: original.run.id },
      },
      { eventType: 'workflow.context.building' },
      { eventType: 'workflow.context.review_required' },
    ]);
    expect(rerun.operatorNotes).toEqual([
      expect.objectContaining({ target: 'codex', mode: 'repeat', text: 'Giữ kiểm tra hồi quy.' }),
    ]);
    expect(rerun.operatorNotes[0]?.id).not.toBe(withNotes.operatorNotes[0]?.id);
    expect(() => service.rerun(rerun.run.id)).toThrow('WORKFLOW_NOT_RERUNNABLE');
    database.close();
  });

  it('deletes only terminal unreferenced workflows and preserves durable audit logs', async () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => '2026-07-22T09:00:00.000Z');
    registry.create('Bridge', 'project-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-22T09:00:00.000Z' });
    const service = createWorkflowDesktopService(database, workflows);
    const active = await service.start('project-1');
    expect(() => service.delete(active.run.id)).toThrow('WORKFLOW_NOT_DELETABLE');

    const terminal = await service.start('project-1');
    await service.updateNotes({
      workflowRunId: terminal.run.id,
      notes: [{ target: 'chatgpt', mode: 'once', text: 'Xóa cùng workflow.' }],
    });
    await service.cancel(terminal.run.id);
    database
      .prepare(
        `INSERT INTO user_approvals (
          id, workflow_run_id, action, approval_token_hash, approved_at, expires_at,
          project_id, scope, destination_type, destination_id, payload_hash
        ) VALUES (?, ?, 'send_chatgpt', ?, ?, ?, ?, 'single_send', ?, ?, ?)`,
      )
      .run(
        'approval-delete',
        terminal.run.id,
        'token-hash',
        '2026-07-22T09:00:00.000Z',
        '2026-07-22T09:05:00.000Z',
        'project-1',
        'chatgpt',
        'conversation-1',
        'a'.repeat(64),
      );
    database
      .prepare(
        `INSERT INTO workflow_effects (
          id, workflow_run_id, operation, idempotency_key, handoff_hash, payload_hash,
          destination_type, destination_id, approval_id, status, prepared_at
        ) VALUES (?, ?, 'send_chatgpt', ?, ?, ?, ?, ?, ?, 'failed', ?)`,
      )
      .run(
        'effect-delete',
        terminal.run.id,
        'effect-delete-key',
        'b'.repeat(64),
        'c'.repeat(64),
        'chatgpt',
        'conversation-1',
        'approval-delete',
        '2026-07-22T09:00:00.000Z',
      );

    expect(await service.delete(terminal.run.id)).toEqual({ workflowRunId: terminal.run.id });
    expect(workflows.getRun(terminal.run.id)).toBeUndefined();
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM workflow_effects WHERE workflow_run_id = ?')
        .get(terminal.run.id),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM user_approvals WHERE workflow_run_id = ?')
        .get(terminal.run.id),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM settings WHERE key = ?')
        .get(`guided-workflow-notes:${terminal.run.id}`),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare(
          "SELECT outcome FROM audit_events WHERE event_type = 'workflow.deleted' AND resource_id = ?",
        )
        .get(terminal.run.id),
    ).toEqual({ outcome: 'allowed' });
    expect(workflows.getRun(active.run.id)).toBeDefined();
    database.close();
  });

  it('rejects untrusted senders and malformed project identifiers', async () => {
    const database = openDatabase(':memory:');
    const workflows = new WorkflowEngine(database);
    const ipc = new FakeIpcMain();
    registerWorkflowIpc(ipc, createWorkflowDesktopService(database, workflows), {
      validateSender: (event) => event.sender.id === 7,
    });

    await expect(
      ipc.handlers.get(workflowIpcChannels.list)?.({ sender: { id: 8 } }, {}),
    ).resolves.toMatchObject({ error: { code: 'IPC_SENDER_REJECTED' } });
    await expect(
      ipc.handlers.get(workflowIpcChannels.start)?.({ sender: { id: 7 } }, { projectId: '' }),
    ).resolves.toMatchObject({ error: { code: 'IPC_SCHEMA_INVALID' } });
    await expect(
      ipc.handlers.get(workflowIpcChannels.start)?.(
        { sender: { id: 7 } },
        { projectId: 'x'.repeat(257) },
      ),
    ).resolves.toMatchObject({ error: { code: 'IPC_SCHEMA_INVALID' } });
    await expect(
      ipc.handlers.get(workflowIpcChannels.list)?.(
        { sender: { id: 7 } },
        { projectId: 'project-1', injected: true },
      ),
    ).resolves.toMatchObject({ error: { code: 'IPC_SCHEMA_INVALID' } });
    await expect(
      ipc.handlers.get(workflowIpcChannels.logs)?.(
        { sender: { id: 7 } },
        { projectId: 'project-1', limit: 201 },
      ),
    ).resolves.toMatchObject({ error: { code: 'IPC_SCHEMA_INVALID' } });
    await expect(
      ipc.handlers.get(workflowIpcChannels.updateNotes)?.(
        { sender: { id: 7 } },
        {
          workflowRunId: 'workflow-1',
          notes: [{ target: 'codex', mode: 'repeat', text: '   ' }],
        },
      ),
    ).resolves.toMatchObject({ error: { code: 'IPC_SCHEMA_INVALID' } });
    database.close();
  });

  it('projects bounded newest-first detailed logs without exposing raw details', async () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => '2026-07-22T09:00:00.000Z');
    registry.create('Bridge', 'project-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-22T09:00:00.000Z' });
    const service = createWorkflowDesktopService(database, workflows);
    for (let index = 0; index < 205; index += 1) {
      database
        .prepare(
          `INSERT INTO audit_events (
            id, event_type, actor, project_id, correlation_id, resource_type,
            resource_id, outcome, details_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `audit-${String(index).padStart(3, '0')}`,
          `fixture.event.${String(index)}`,
          'test',
          'project-1',
          null,
          'fixture',
          `resource-${String(index)}`,
          index === 204 ? 'failed' : 'allowed',
          JSON.stringify(
            index === 204
              ? { errorCode: 'FIXTURE_FAILURE', token: 'must-not-cross-ipc' }
              : { content: 'private file body' },
          ),
          new Date(Date.UTC(2026, 6, 22, 9, 0, index)).toISOString(),
        );
    }

    const logs = await service.logs('project-1', 999);
    expect(logs).toHaveLength(200);
    expect(logs[0]).toMatchObject({
      eventType: 'fixture.event.204',
      outcome: 'failed',
      errorCode: 'FIXTURE_FAILURE',
      createdAt: '2026-07-22T09:03:24.000Z',
    });
    expect(logs.at(-1)?.eventType).toBe('fixture.event.5');
    expect(JSON.stringify(logs)).not.toContain('must-not-cross-ipc');
    expect(JSON.stringify(logs)).not.toContain('private file body');
    expect(JSON.stringify(logs)).not.toContain('details_json');
    database.close();
  });

  it('returns approval and audit summaries without secret-bearing database fields', async () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => '2026-07-18T11:00:00.000Z');
    registry.create('Bridge', 'project-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-18T11:00:00.000Z' });
    const run = workflows.create({
      id: 'workflow-1',
      projectId: 'project-1',
      correlationId: 'correlation-1',
      idempotencyKey: 'workflow-key-1',
    });
    for (const state of [
      'project_resolving',
      'codex_running',
      'codex_completed',
      'building_context',
      'context_review_required',
      'context_approved',
    ] as const) {
      workflows.transition(run.id, {
        toState: state,
        eventType: `fixture.${state}`,
        actor: 'test',
      });
    }
    workflows.issueApproval({
      workflowRunId: run.id,
      operation: 'send_chatgpt',
      destinationType: 'chatgpt_conversation',
      destinationId: 'conversation-1',
      payloadHash: 'a'.repeat(64),
      ttlMs: 60_000,
    });
    database
      .prepare(
        `INSERT INTO audit_events (
          id, event_type, actor, project_id, correlation_id, resource_type,
          resource_id, outcome, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'audit-sensitive',
        'fixture.audit',
        'test',
        'project-1',
        'correlation-1',
        'fixture',
        'fixture-1',
        'allowed',
        JSON.stringify({ token: 'must-not-cross-ipc', content: 'private file body' }),
        '2026-07-18T11:00:00.000Z',
      );

    const serialized = JSON.stringify(
      await createWorkflowDesktopService(database, workflows).list('project-1'),
    );
    expect(serialized).toContain('fixture.audit');
    expect(serialized).not.toContain('must-not-cross-ipc');
    expect(serialized).not.toContain('private file body');
    expect(serialized).not.toContain('approval_token_hash');
    database.close();
  });
});
