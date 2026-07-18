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
