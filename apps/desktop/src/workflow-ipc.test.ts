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
    database.close();
  });
});
