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
import { AssistedChatGptService } from '@codex-context-bridge/assisted-chatgpt';
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
    discoverChatGpt: () =>
      Promise.resolve({
        conversations: [],
        capturedAt: '2026-07-19T08:00:00.000Z',
        truncated: false,
      }),
    listCodexTargets: () => Promise.resolve({ projects: [] }),
    create: () => Promise.resolve(view()),
    refresh: () => Promise.resolve(view()),
    inspectChatGpt: () => Promise.resolve(view()),
    prepareChatGpt: () => Promise.resolve(view()),
    approveChatGpt: () => Promise.resolve(view()),
    captureChatGpt: () => Promise.resolve(view()),
    syncChatHistory: () => Promise.resolve(view()),
    prepareAccountTransfer: () => Promise.resolve(view()),
    approveAccountTransfer: () => Promise.resolve(view()),
    captureAccountTransfer: () => Promise.resolve(view()),
    revealAccountTransfer: () => Promise.resolve(view()),
    exportChatHistory: () =>
      Promise.resolve({
        canceled: false,
        filePath: 'C:/history.json',
        conversationCount: 1,
        revisionCount: 1,
        exportedAt: '2026-07-19T08:00:00.000Z',
      }),
    approveCodex: () => Promise.resolve(view()),
    revealCodexBundle: () => Promise.resolve(view()),
    verifyWebsite: () => Promise.resolve(view()),
    openPreview: () => Promise.resolve(view()),
    ...overrides,
  };
}

describe('pilot IPC boundary', () => {
  it('exposes rendered ChatGPT discovery and local Codex targets through typed channels', async () => {
    const ipc = new FakeIpcMain();
    registerPilotIpc(
      ipc,
      stubService({
        discoverChatGpt: () =>
          Promise.resolve({
            conversations: [
              {
                conversationId: 'conversation-1',
                conversationPath: '/c/conversation-1',
                title: 'Rendered chat',
                current: true,
              },
            ],
            capturedAt: '2026-07-20T08:00:00.000Z',
            truncated: false,
          }),
        listCodexTargets: () =>
          Promise.resolve({
            projects: [
              {
                projectId: 'project-1',
                projectName: 'Pilot',
                repositories: [
                  {
                    id: 'repository-1',
                    canonicalRoot: 'C:/pilot',
                    fingerprint: 'a'.repeat(64),
                  },
                ],
                threads: [],
              },
            ],
          }),
      }),
      { validateSender: () => true },
    );

    await expect(
      ipc.handlers.get(pilotIpcChannels.discoverChatGpt)?.({ sender: { id: 7 } }),
    ).resolves.toMatchObject({ ok: true, value: { conversations: [{ title: 'Rendered chat' }] } });
    await expect(
      ipc.handlers.get(pilotIpcChannels.listCodexTargets)?.({ sender: { id: 7 } }),
    ).resolves.toMatchObject({ ok: true, value: { projects: [{ projectName: 'Pilot' }] } });
  });

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
  it('discovers rendered conversations and lists verified Codex thread mappings', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-20T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    const repository = projects.registerRepository(
      'project-1',
      { repoRoot: 'C:/pilot' },
      'repository-1',
    );
    projects.registerCodexThread({
      id: 'mapping-1',
      projectId: 'project-1',
      repositoryFingerprint: repository.fingerprint,
      externalThreadId: 'thread-1',
      title: 'Fix homepage',
    });
    const workflows = new WorkflowEngine(database);
    const codex = new FixtureCodexAdapter();
    const syncCodexCatalog = vi.fn();
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
      discoverCodexCatalog: () =>
        Promise.resolve({
          source: 'codex-local-state' as const,
          capturedAt: '2026-07-20T08:00:00.000Z',
          truncated: false,
          projects: [],
        }),
      syncCodexCatalog,
      bridge: {
        ...bridge,
        execute: (operation) => {
          if (operation.type !== 'conversation.discover') {
            return Promise.reject(new Error('NOT_USED'));
          }
          return Promise.resolve({
            type: 'conversation.discover.result',
            catalog: {
              conversations: [
                {
                  conversationId: 'conversation-1',
                  conversationPath: '/c/conversation-1',
                  title: 'Rendered chat',
                  current: true,
                },
              ],
              capturedAt: '2026-07-20T08:00:00.000Z',
              truncated: false,
            },
          });
        },
      },
      now: () => '2026-07-20T08:00:00.000Z',
    });

    await expect(service.discoverChatGpt()).resolves.toMatchObject({
      conversations: [{ conversationId: 'conversation-1' }],
    });
    await expect(service.listCodexTargets()).resolves.toMatchObject({
      projects: [
        {
          projectId: 'project-1',
          threads: [
            { mappingId: 'mapping-1', externalThreadId: 'thread-1', title: 'Fix homepage' },
          ],
        },
      ],
    });
    expect(syncCodexCatalog).toHaveBeenCalledOnce();
    const created = await service.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Continue the existing thread.',
      destination: { mode: 'new' },
      codexDestination: { mode: 'existing-thread', threadMappingId: 'mapping-1' },
    });
    expect(created.codexDestination).toEqual({
      mode: 'existing-thread',
      threadMappingId: 'mapping-1',
    });
    database.close();
  });

  it('opens one allowlisted ChatGPT home page and retries only for an explicit refresh', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database);
    const workflows = new WorkflowEngine(database);
    const codex = new FixtureCodexAdapter();
    const ensureChatGptPage = vi.fn().mockResolvedValue(undefined);
    const execute = vi
      .fn<DesktopBridgeService['execute']>()
      .mockRejectedValueOnce(new Error('CHATGPT_TAB_NOT_FOUND'))
      .mockResolvedValueOnce({
        type: 'conversation.discover.result',
        catalog: {
          conversations: [
            {
              conversationId: '6a60618a-ec88-83ec-800c-1da420fe5de3',
              conversationPath: '/c/6a60618a-ec88-83ec-800c-1da420fe5de3',
              title: 'Giải thích UUID',
              current: false,
            },
          ],
          capturedAt: '2026-07-22T08:00:00.000Z',
          truncated: false,
        },
      });
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
      bridge: { ...bridge, execute },
      ensureChatGptPage,
    });

    await expect(service.discoverChatGpt({ openIfNeeded: true })).resolves.toMatchObject({
      conversations: [{ title: 'Giải thích UUID' }],
    });
    expect(ensureChatGptPage).toHaveBeenCalledOnce();
    expect(ensureChatGptPage).toHaveBeenCalledWith({ mode: 'new' }, { allowOpenExternal: true });
    expect(execute).toHaveBeenCalledTimes(2);
    database.close();
  });

  it('never opens ChatGPT from background catalog discovery', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database);
    const workflows = new WorkflowEngine(database);
    const codex = new FixtureCodexAdapter();
    const ensureChatGptPage = vi.fn().mockResolvedValue(undefined);
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
      bridge: {
        ...bridge,
        execute: () => Promise.reject(new Error('CHATGPT_TAB_NOT_FOUND')),
      },
      ensureChatGptPage,
    });

    await expect(service.discoverChatGpt()).rejects.toThrow('CHATGPT_TAB_NOT_FOUND');
    expect(ensureChatGptPage).not.toHaveBeenCalled();
    database.close();
  });

  it('restores an orphaned dispatching ChatGPT effect as confirmation-required', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-19T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, {
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const codex = new FixtureCodexAdapter();
    const router = new ResponseRouter(database, workflows, projects, codex);
    const firstService = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge,
      codex,
      router,
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const created = await firstService.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Create a static site.',
      destination: { mode: 'new' },
    });
    const prepared = await firstService.prepareChatGpt(created.id);
    if (!prepared.chatGptPreview) throw new Error('FIXTURE_PREVIEW_MISSING');
    const assisted = new AssistedChatGptService(workflows, {
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const approval = assisted.approve(prepared.chatGptPreview, 5 * 60_000);
    const effect = assisted.prepare(
      prepared.chatGptPreview,
      { id: approval.approval.id, token: approval.token },
      `pilot:${created.id}:chatgpt`,
    ).effect;
    workflows.beginDispatch(effect.id);

    const restored = await firstService.list('project-1');
    expect(restored).toMatchObject([
      {
        id: created.id,
        status: 'chatgpt_confirmation_required',
        chatGptEffectId: effect.id,
      },
    ]);
    database.close();
  });

  it('recovers the ChatGPT page before consuming approval or preparing an effect', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-19T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, {
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const codex = new FixtureCodexAdapter();
    const ensureChatGptPage = vi.fn(() => Promise.reject(new Error('TRANSPORT_DISCONNECTED')));
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
      ensureChatGptPage,
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const created = await service.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Create a static site.',
      destination: { mode: 'new' },
    });
    await service.prepareChatGpt(created.id);

    await expect(service.approveChatGpt(created.id)).rejects.toThrow('TRANSPORT_DISCONNECTED');
    expect(ensureChatGptPage).toHaveBeenCalledWith({ mode: 'new' });
    expect(database.prepare('SELECT COUNT(*) AS count FROM user_approvals').get()).toEqual({
      count: 0,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM workflow_effects').get()).toEqual({
      count: 0,
    });
    database.close();
  });

  it('resolves the current open ChatGPT conversation before persisting the pilot', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-19T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, {
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const codex = new FixtureCodexAdapter();
    const execute = vi.fn<DesktopBridgeService['execute']>((operation) => {
      if (operation.type === 'page.inspect') {
        return Promise.resolve({
          type: 'page.inspect.result',
          inspection: {
            page: {
              mode: 'existing',
              conversationId: 'conversation-current',
              conversationPath: '/g/project-current/c/conversation-current',
            },
            composer: { available: true, readOnly: false },
          },
        });
      }
      if (operation.type === 'page.status') {
        return Promise.resolve({
          type: 'page.status.result',
          streaming: false,
          structuredResponse: {
            ok: false,
            error: { code: 'MARKER_NOT_FOUND', message: 'Not found.' },
          },
        });
      }
      return Promise.reject(new Error('NOT_USED'));
    });
    const currentBridge: DesktopBridgeService = {
      ...bridge,
      execute,
    };
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge: currentBridge,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
    });
    const created = await service.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Use the current conversation.',
      destination: { mode: 'current' },
    });

    expect(created.destination).toEqual({
      mode: 'existing',
      conversationId: 'conversation-current',
      conversationPath: '/g/project-current/c/conversation-current',
    });
    expect(created.chatGptInspection).toMatchObject({
      pageMode: 'existing',
      conversationId: 'conversation-current',
      conversationPath: '/g/project-current/c/conversation-current',
      hasDraft: false,
      streaming: false,
    });
    await service.inspectChatGpt(created.id);
    expect(execute).toHaveBeenCalledWith({
      type: 'page.inspect',
      destination: created.destination,
    });
    expect(execute).toHaveBeenCalledWith({
      type: 'page.status',
      destination: created.destination,
    });
    database.close();
  });

  it('syncs the exact existing conversation into SQLite and exports all revisions', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-19T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-19T08:00:00.000Z' });
    const snapshot = {
      title: 'Archive target',
      projectName: 'Pilot',
      messages: [
        { role: 'user', text: 'first' },
        { role: 'assistant', text: 'answer' },
      ],
      contentHash: 'a'.repeat(64),
      capturedAt: '2026-07-19T08:00:00.000Z',
    };
    const archiveBridge: DesktopBridgeService = {
      ...bridge,
      execute: (operation) => {
        if (operation.type === 'page.inspect') {
          return Promise.resolve({
            type: 'page.inspect.result',
            inspection: {
              page: {
                mode: 'existing',
                conversationId: 'conversation-1',
                conversationPath: '/g/project-1/c/conversation-1',
              },
              composer: { available: true, readOnly: false },
            },
          });
        }
        if (operation.type === 'page.status') {
          return Promise.resolve({
            type: 'page.status.result',
            streaming: false,
            structuredResponse: {
              ok: false,
              error: { code: 'MARKER_NOT_FOUND', message: 'Not found.' },
            },
          });
        }
        if (operation.type === 'conversation.capture') {
          return Promise.resolve({ type: 'conversation.capture.result', snapshot });
        }
        return Promise.reject(new Error('NOT_USED'));
      },
    };
    let exportedContent = '';
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge: archiveBridge,
      codex: new FixtureCodexAdapter(),
      router: new ResponseRouter(database, workflows, projects, new FixtureCodexAdapter()),
      ensureChatGptPage: vi.fn(() => Promise.resolve()),
      saveChatHistory: ({ content }) => {
        exportedContent = content;
        return Promise.resolve('C:/history.json');
      },
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const created = await service.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Archive this conversation.',
      destination: { mode: 'existing', conversationId: 'conversation-1' },
    });
    const synced = await service.syncChatHistory(created.id);
    expect(synced.chatArchive).toMatchObject({
      conversationId: 'conversation-1',
      revisionCount: 1,
      latestMessageCount: 2,
    });
    expect(synced.destination).toEqual({
      mode: 'existing',
      conversationId: 'conversation-1',
      conversationPath: '/g/project-1/c/conversation-1',
    });
    const exported = await service.exportChatHistory(created.id);
    expect(exported).toMatchObject({ canceled: false, conversationCount: 1, revisionCount: 1 });
    expect(exportedContent).toContain('first');
    expect(exportedContent).toContain('answer');
    database.close();
  });

  it('packages stored history, creates a new-account handoff, and rebinds the same Codex pilot', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-21T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, { now: () => '2026-07-21T08:00:00.000Z' });
    const codex = new FixtureCodexAdapter();
    let submitted = false;
    let sentText = '';
    const transferBridge: DesktopBridgeService = {
      ...bridge,
      execute: (operation) => {
        if (operation.type === 'page.inspect') {
          const existing = submitted || operation.destination?.mode === 'existing';
          return Promise.resolve({
            type: 'page.inspect.result',
            inspection: {
              page: existing
                ? {
                    mode: 'existing',
                    conversationId: 'new-account-chat',
                    conversationPath: '/c/new-account-chat',
                  }
                : { mode: 'new' },
              composer: { available: true, readOnly: false },
            },
          });
        }
        if (operation.type === 'page.status') {
          return Promise.resolve({
            type: 'page.status.result',
            streaming: false,
            structuredResponse: {
              ok: false,
              error: { code: 'MARKER_NOT_FOUND', message: 'Not found.' },
            },
          });
        }
        if (operation.type === 'composer.insert') {
          sentText = operation.text;
          return Promise.resolve({
            type: 'composer.insert.result',
            inserted: true,
            sent: false,
            textHash: operation.payloadHash,
          });
        }
        if (operation.type === 'composer.submit') {
          submitted = true;
          return Promise.resolve({
            type: 'composer.submit.result',
            submitted: true,
            textHash: operation.expectedTextHash,
          });
        }
        if (operation.type === 'conversation.capture') {
          return Promise.resolve({
            type: 'conversation.capture.result',
            snapshot: {
              title: 'New account chat',
              messages: [{ role: 'user', text: sentText }],
              contentHash: 'b'.repeat(64),
              capturedAt: '2026-07-21T08:00:00.000Z',
            },
          });
        }
        return Promise.reject(new Error('NOT_USED'));
      },
    };
    const createChatHistoryTransfer = vi.fn(() =>
      Promise.resolve({
        zipPath: 'C:/transfers/chat-history.zip',
        sha256: 'c'.repeat(64),
        payloadSha256: 'd'.repeat(64),
        size: 1_024,
        conversationCount: 1,
        revisionCount: 1,
        deliveryMode: 'inline' as const,
        bootstrapContext: '{"messages":["old account context"]}',
        createdAt: '2026-07-21T08:00:00.000Z',
      }),
    );
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge: transferBridge,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
      ensureChatGptPage: vi.fn(() => Promise.resolve()),
      createChatHistoryTransfer,
      now: () => '2026-07-21T08:00:00.000Z',
    });
    const created = await service.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Continue this project.',
      destination: { mode: 'existing', conversationId: 'old-account-chat' },
      codexDestination: { mode: 'new-thread', repositoryId: 'repository-1' },
    });
    new (await import('./chat-archive')).ChatArchiveStore(
      database,
      () => '2026-07-21T08:00:00.000Z',
      () => crypto.randomUUID(),
    ).archive({
      projectId: 'project-1',
      conversationId: 'old-account-chat',
      snapshot: {
        title: 'Old account chat',
        messages: [{ role: 'user', text: 'old account context' }],
        contentHash: 'a'.repeat(64),
        capturedAt: '2026-07-21T08:00:00.000Z',
      },
    });

    const prepared = await service.prepareAccountTransfer(created.id);
    expect(prepared.accountTransfer).toMatchObject({
      status: 'review_required',
      sourceDestination: { mode: 'existing', conversationId: 'old-account-chat' },
      targetDestination: { mode: 'new' },
      artifact: { zipPath: 'C:/transfers/chat-history.zip', deliveryMode: 'inline' },
    });
    expect(prepared.codexDestination).toEqual(created.codexDestination);
    expect(createChatHistoryTransfer).toHaveBeenCalledOnce();

    const dispatched = await service.approveAccountTransfer(created.id);
    expect(dispatched.accountTransfer?.status).toBe('dispatching');
    expect(sentText).toContain('old account context');

    const completed = await service.captureAccountTransfer(created.id);
    expect(completed.destination).toEqual({
      mode: 'existing',
      conversationId: 'new-account-chat',
      conversationPath: '/c/new-account-chat',
    });
    expect(completed.accountTransfer).toMatchObject({
      status: 'completed',
      targetDestination: {
        mode: 'existing',
        conversationId: 'new-account-chat',
        conversationPath: '/c/new-account-chat',
      },
    });
    expect(completed.codexDestination).toEqual(created.codexDestination);
    database.close();
  });

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

  it('creates a persisted safe ZIP projection after Codex completes', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-20T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, {
      now: () => '2026-07-20T08:00:00.000Z',
    });
    const codex = new FixtureCodexAdapter();
    const createCodexBundle = vi.fn(() =>
      Promise.resolve({
        zipPath: 'C:/bundles/pilot-1.zip',
        sha256: 'b'.repeat(64),
        size: 1_024,
        changedFiles: ['index.html', 'secret.txt'],
        includedFiles: ['index.html'],
        blockedFiles: [{ path: 'secret.txt', reason: 'SECRET_DETECTED:openai-key' }],
        createdAt: '2026-07-20T08:10:00.000Z',
      }),
    );
    const service = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge,
      codex,
      router: new ResponseRouter(database, workflows, projects, codex),
      createCodexBundle,
      now: () => '2026-07-20T08:10:00.000Z',
    });
    const created = await service.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Create a static site.',
      destination: { mode: 'new' },
    });
    database
      .prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run(
        `live-project-pilot-baseline:${created.id}`,
        JSON.stringify({ head: 'a'.repeat(40), entries: [], capturedAt: created.createdAt }),
        created.createdAt,
      );
    database
      .prepare('UPDATE settings SET value_json = ? WHERE key = ?')
      .run(
        JSON.stringify({ ...created, status: 'codex_running', codexRunId: codex.run.id }),
        `live-project-pilot:${created.id}`,
      );

    const refreshed = await service.refresh(created.id);
    expect(refreshed).toMatchObject({
      status: 'codex_completed',
      codexBundle: {
        zipPath: 'C:/bundles/pilot-1.zip',
        includedFiles: ['index.html'],
        blockedFiles: [{ path: 'secret.txt', reason: 'SECRET_DETECTED:openai-key' }],
      },
    });
    expect(createCodexBundle).toHaveBeenCalledWith(
      expect.objectContaining({ pilotId: created.id, finalResponse: codex.run.finalResponse }),
    );
    database.close();
  });

  it('restores terminal pilots without querying a reopened Codex adapter', async () => {
    const database = openDatabase(':memory:');
    const projects = new ProjectRegistry(database, () => '2026-07-19T08:00:00.000Z');
    projects.create('Pilot', 'project-1');
    projects.registerRepository('project-1', { repoRoot: 'C:/pilot' }, 'repository-1');
    const workflows = new WorkflowEngine(database, {
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const firstCodex = new FixtureCodexAdapter();
    const firstService = createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge,
      codex: firstCodex,
      router: new ResponseRouter(database, workflows, projects, firstCodex),
      now: () => '2026-07-19T08:00:00.000Z',
    });
    const created = await firstService.create({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: 'Create a static site.',
      destination: { mode: 'new' },
    });
    database.prepare('UPDATE settings SET value_json = ? WHERE key = ?').run(
      JSON.stringify({
        ...created,
        status: 'codex_completed',
        codexRunId: 'reopened-run-no-longer-available',
        finalResponse: 'Created index.html and styles.css.',
      }),
      `live-project-pilot:${created.id}`,
    );

    const reopenedCodex = new FixtureCodexAdapter();
    reopenedCodex.getRun = () => Promise.reject(new Error('CODEX_RUN_NOT_FOUND'));
    const restored = await createPilotDesktopService({
      database,
      projects,
      workflows,
      bridge,
      codex: reopenedCodex,
      router: new ResponseRouter(database, workflows, projects, reopenedCodex),
    }).list('project-1');

    expect(restored).toMatchObject([
      {
        id: created.id,
        status: 'codex_completed',
        finalResponse: 'Created index.html and styles.css.',
      },
    ]);
    database.close();
  });
});
