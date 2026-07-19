import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  CodexAdapter,
  CodexRun,
  CodexRunEvent,
  CodexThread,
  StartThreadInput,
} from '@codex-context-bridge/codex-adapter';
import { openDatabase } from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { ResponseRouter } from '@codex-context-bridge/response-router';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopBridgeService, IpcInvokeEventLike, IpcMainLike } from './ipc';
import { pilotIpcChannels, type PilotView } from './pilot-contracts';
import { createPilotDesktopService, registerPilotIpc, type PilotDesktopService } from './pilot-ipc';

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

class FixtureCodexAdapter implements CodexAdapter {
  public run: CodexRun = {
    id: 'codex-run-1',
    threadId: 'codex-thread-1',
    status: 'completed',
    finalResponse: 'Created index.html and styles.css.',
  };

  public startThread(input: StartThreadInput): Promise<CodexThread> {
    return Promise.resolve({ id: 'codex-thread-1', ...input });
  }

  public resumeThread(_threadId: string): Promise<CodexThread> {
    void _threadId;
    return Promise.reject(new Error('NOT_USED'));
  }

  public runTurn(_threadId: string, _prompt: string): Promise<CodexRun> {
    void _threadId;
    void _prompt;
    return Promise.resolve(this.run);
  }

  public getRun(_runId: string): Promise<CodexRun> {
    void _runId;
    return Promise.resolve(this.run);
  }

  public cancelRun(_runId: string): Promise<void> {
    void _runId;
    return Promise.resolve();
  }

  public subscribe(_runId: string, _listener: (event: CodexRunEvent) => void): () => void {
    void _runId;
    void _listener;
    return () => undefined;
  }
}

const bridge: DesktopBridgeService = {
  getStatus: () =>
    Promise.resolve({
      transport: 'native_messaging',
      state: 'connected',
      permissionActive: true,
    }),
  execute: () => Promise.reject(new Error('NOT_USED')),
};

function view(overrides: Partial<PilotView> = {}): PilotView {
  const timestamp = '2026-07-19T08:00:00.000Z';
  return {
    id: 'pilot-1',
    projectId: 'project-1',
    repositoryId: 'repository-1',
    repositoryRoot: 'C:/pilot',
    repositoryFingerprint: 'a'.repeat(64),
    objective: 'Create a static site.',
    destination: { mode: 'new' },
    workflowRunId: 'workflow-1',
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function stubService(overrides: Partial<PilotDesktopService> = {}): PilotDesktopService {
  return {
    list: () => Promise.resolve([]),
    create: () => Promise.resolve(view()),
    refresh: () => Promise.resolve(view()),
    inspectChatGpt: () => Promise.resolve(view()),
    prepareChatGpt: () => Promise.resolve(view()),
    approveChatGpt: () => Promise.resolve(view()),
    captureChatGpt: () => Promise.resolve(view()),
    approveCodex: () => Promise.resolve(view()),
    verifyWebsite: () => Promise.resolve(view()),
    openPreview: () => Promise.resolve(view()),
    ...overrides,
  };
}

describe('pilot IPC boundary', () => {
  it('accepts a bounded objective and rejects empty, oversized, unknown, and untrusted requests', async () => {
    const ipc = new FakeIpcMain();
    const audit = vi.fn();
    const create = vi.fn<PilotDesktopService['create']>().mockResolvedValue(view());
    registerPilotIpc(ipc, stubService({ create }), {
      validateSender: (event) => event.sender.id === 7,
      audit,
    });
    const handler = ipc.handlers.get(pilotIpcChannels.create);
    const valid = {
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Create a static site.',
      destination: { mode: 'new' },
    };

    await expect(handler?.({ sender: { id: 7 } }, valid)).resolves.toMatchObject({ ok: true });
    expect(create).toHaveBeenCalledWith(valid);
    for (const invalid of [
      { ...valid, objective: '' },
      { ...valid, objective: 'x'.repeat(20_001) },
      { ...valid, injected: true },
    ]) {
      await expect(handler?.({ sender: { id: 7 } }, invalid)).resolves.toMatchObject({
        error: { code: 'IPC_SCHEMA_INVALID' },
      });
    }
    await expect(handler?.({ sender: { id: 8 } }, valid)).resolves.toMatchObject({
      error: { code: 'IPC_SENDER_REJECTED' },
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain('Create a static site.');
  });

  it('maps project identity failures and timeouts to stable codes', async () => {
    const ipc = new FakeIpcMain();
    registerPilotIpc(
      ipc,
      stubService({ create: () => Promise.reject(new Error('PROJECT_NOT_FOUND')) }),
      { validateSender: () => true },
    );
    await expect(
      ipc.handlers.get(pilotIpcChannels.create)?.(
        { sender: { id: 7 } },
        {
          projectId: 'wrong-project',
          repositoryId: 'repository-1',
          objective: 'Create a static site.',
          destination: { mode: 'new' },
        },
      ),
    ).resolves.toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });

    vi.useFakeTimers();
    try {
      const timeoutIpc = new FakeIpcMain();
      registerPilotIpc(timeoutIpc, stubService({ refresh: () => new Promise(() => undefined) }), {
        validateSender: () => true,
        timeoutMs: 10,
      });
      const result = timeoutIpc.handlers.get(pilotIpcChannels.refresh)?.(
        { sender: { id: 7 } },
        { pilotId: 'pilot-1' },
      );
      const expectation = expect(result).resolves.toMatchObject({
        error: { code: 'IPC_TIMEOUT' },
      });
      await vi.advanceTimersByTimeAsync(10);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pilot desktop persistence', () => {
  it('persists a repository-bound pilot and restores it after reopening SQLite', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-pilot-'));
    const databasePath = path.join(directory, 'context-bridge.sqlite');
    try {
      const first = openDatabase(databasePath);
      const firstProjects = new ProjectRegistry(first, () => '2026-07-19T08:00:00.000Z');
      firstProjects.create('Pilot', 'project-1');
      firstProjects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
      const firstWorkflows = new WorkflowEngine(first, {
        now: () => '2026-07-19T08:00:00.000Z',
      });
      const firstCodex = new FixtureCodexAdapter();
      const created = await createPilotDesktopService({
        database: first,
        projects: firstProjects,
        workflows: firstWorkflows,
        bridge,
        codex: firstCodex,
        router: new ResponseRouter(first, firstWorkflows, firstProjects, firstCodex),
        now: () => '2026-07-19T08:00:00.000Z',
      }).create({
        projectId: 'project-1',
        repositoryId: 'repository-1',
        objective: 'Create a static site.',
        destination: { mode: 'new' },
      });
      first.close();

      const reopened = openDatabase(databasePath);
      const reopenedProjects = new ProjectRegistry(reopened);
      const reopenedWorkflows = new WorkflowEngine(reopened);
      const reopenedCodex = new FixtureCodexAdapter();
      const restored = await createPilotDesktopService({
        database: reopened,
        projects: reopenedProjects,
        workflows: reopenedWorkflows,
        bridge,
        codex: reopenedCodex,
        router: new ResponseRouter(reopened, reopenedWorkflows, reopenedProjects, reopenedCodex),
      }).list('project-1');
      expect(restored).toMatchObject([
        {
          id: created.id,
          projectId: 'project-1',
          repositoryId: 'repository-1',
          objective: 'Create a static site.',
          status: 'draft',
        },
      ]);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('projects a completed Codex run into persisted pilot state without exposing runtime handles', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-19T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, {
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const codex = new FixtureCodexAdapter();
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const created = await service.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Create a static site.',
      destination: { mode: 'new' },
    });
    database
      .prepare('UPDATE settings SET value_json = ? WHERE key = ?')
      .run(
        JSON.stringify({ ...created, status: 'codex_running', codexRunId: codex.run.id }),
        `live-project-pilot:${created.id}`,
      );

    const refreshed = await service.refresh(created.id);
    expect(refreshed).toMatchObject({
      status: 'codex_completed',
      finalResponse: 'Created index.html and styles.css.',
    });
    expect(JSON.stringify(refreshed)).not.toContain('approvalToken');
    database.close();
  });
});
