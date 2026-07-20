// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBridgeDesktopApi } from '../preload';
import type { PilotView } from '../pilot-contracts';
import type { ProjectView } from '../project-ipc';
import { LiveProjectPilot, SAMPLE_PILOT_OBJECTIVE } from './live-project-pilot';

const timestamp = '2026-07-19T08:00:00.000Z';
const repository: ProjectView['repositories'][number] = {
  id: 'repository-1',
  projectId: 'project-1',
  canonicalRoot: 'c:/temp/pilot',
  fingerprint: 'a'.repeat(64),
  createdAt: timestamp,
  updatedAt: timestamp,
  branch: 'main',
};

function pilot(overrides: Partial<PilotView> = {}): PilotView {
  return {
    id: 'pilot-1',
    projectId: 'project-1',
    repositoryId: 'repository-1',
    repositoryRoot: repository.canonicalRoot,
    repositoryFingerprint: repository.fingerprint,
    objective: SAMPLE_PILOT_OBJECTIVE,
    destination: { mode: 'new' },
    workflowRunId: 'workflow-1',
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

const chatGptPreview = {
  protocolVersion: '1.0' as const,
  workflowRunId: 'workflow-1',
  projectId: 'project-1',
  handoffId: 'handoff-1',
  correlationId: 'correlation-1',
  destination: { mode: 'new' as const },
  text: 'reviewed prompt',
  textHash: 'b'.repeat(64),
  handoffHash: 'c'.repeat(64),
  characterCount: 15,
  createdAt: timestamp,
};

function baseApi(): ContextBridgeDesktopApi {
  return {
    getTransportStatus: vi.fn().mockResolvedValue({
      ok: true,
      value: { transport: 'native_messaging', state: 'connected', permissionActive: true },
    }),
    executeTransportOperation: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    archiveProject: vi.fn(),
    addProjectAlias: vi.fn(),
    chooseRepositoryRoot: vi.fn(),
    previewRepository: vi.fn(),
    confirmRepository: vi.fn(),
    listWorkflows: vi.fn(),
    startWorkflow: vi.fn(),
    cancelWorkflow: vi.fn(),
    listPilots: vi.fn().mockResolvedValue({
      ok: true,
      value: [
        pilot({
          status: 'chatgpt_ready',
          chatGptPreview,
          chatArchive: {
            sourceId: 'source-1',
            conversationId: 'old-chat',
            revisionCount: 1,
            latestMessageCount: 2,
            latestContentHash: 'e'.repeat(64),
            lastSyncedAt: timestamp,
          },
        }),
      ],
    }),
    discoverPilotChatGpt: vi.fn().mockResolvedValue({
      ok: true,
      value: { conversations: [], capturedAt: timestamp, truncated: false },
    }),
    listPilotCodexTargets: vi.fn().mockResolvedValue({ ok: true, value: { projects: [] } }),
    createPilot: vi.fn().mockResolvedValue({ ok: true, value: pilot() }),
    refreshPilot: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'codex_completed' }) }),
    verifyPilotWebsite: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'codex_completed' }) }),
    openPilotPreview: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'codex_completed' }) }),
    inspectPilotChatGpt: vi.fn().mockResolvedValue({ ok: true, value: pilot() }),
    preparePilotChatGpt: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'chatgpt_ready' }) }),
    approvePilotChatGpt: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'chatgpt_dispatched' }) }),
    capturePilotChatGpt: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'codex_ready' }) }),
    syncPilotChatHistory: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'chatgpt_ready' }) }),
    exportPilotChatHistory: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        canceled: false,
        filePath: 'C:/history.json',
        conversationCount: 1,
        revisionCount: 1,
        exportedAt: timestamp,
      },
    }),
    preparePilotAccountTransfer: vi.fn().mockResolvedValue({ ok: true, value: pilot() }),
    approvePilotAccountTransfer: vi.fn().mockResolvedValue({ ok: true, value: pilot() }),
    capturePilotAccountTransfer: vi.fn().mockResolvedValue({ ok: true, value: pilot() }),
    revealPilotAccountTransfer: vi.fn().mockResolvedValue({ ok: true, value: pilot() }),
    approvePilotCodex: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'codex_running' }) }),
    revealPilotCodexBundle: vi.fn().mockResolvedValue({
      ok: true,
      value: pilot({ status: 'codex_completed' }),
    }),
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((item) =>
    item.textContent.includes(label),
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`);
  return found;
}

describe('Live Project Pilot renderer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ContextBridgeDesktopApi;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    api = baseApi();
    Object.defineProperty(window, 'contextBridgeDesktop', { configurable: true, value: api });
    await act(async () => {
      root.render(
        createElement(LiveProjectPilot, {
          projectId: 'project-1',
          projectName: 'AI Website Pilot',
          repositories: [repository],
        }),
      );
      await Promise.resolve();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('uses the sample request and keeps both approval buttons gated by state', () => {
    act(() => button(container, 'Dùng yêu cầu mẫu').click());
    const textarea = container.querySelector('textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Textarea not found.');
    expect(textarea.value).toBe(SAMPLE_PILOT_OBJECTIVE);

    expect(container.textContent).toContain('Duyệt và gửi ChatGPT');
    expect(container.textContent).not.toContain('Duyệt và gửi Codex');
    expect(button(container, 'Duyệt và gửi ChatGPT')).toHaveProperty('disabled', false);
  });

  it('creates a pilot only through the typed desktop API', async () => {
    act(() => button(container, 'Dùng yêu cầu mẫu').click());
    await act(async () => {
      button(container, 'Tạo Live Project Pilot').click();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.createPilot).toHaveBeenCalledWith({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: SAMPLE_PILOT_OBJECTIVE,
      destination: { mode: 'new' },
      codexDestination: { mode: 'new-thread', repositoryId: 'repository-1' },
    });
    expect(container.textContent).toContain('Pilot đã được tạo trong SQLite');
  });

  it('can bind a new pilot to the currently open ChatGPT conversation', async () => {
    const current = container.querySelector(
      'input[aria-label="Dùng conversation ChatGPT đang mở"]',
    );
    if (!(current instanceof HTMLInputElement)) throw new Error('Current conversation not found.');
    act(() => current.click());
    act(() => button(container, 'Dùng yêu cầu mẫu').click());
    await act(async () => {
      button(container, 'Tạo Live Project Pilot').click();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.createPilot).toHaveBeenLastCalledWith({
      projectId: 'project-1',
      repositoryId: 'repository-1',
      objective: SAMPLE_PILOT_OBJECTIVE,
      destination: { mode: 'current' },
      codexDestination: { mode: 'new-thread', repositoryId: 'repository-1' },
    });
  });

  it('lists rendered ChatGPT chats and limits each expanded Codex project to five threads', async () => {
    const discoverChatGpt = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        conversations: [
          {
            conversationId: 'conversation-1',
            conversationPath: '/g/chat-project/c/conversation-1',
            title: 'MVP planning',
            projectId: 'chat-project',
            projectName: 'ChatGPT Project',
            current: true,
          },
        ],
        capturedAt: timestamp,
        truncated: false,
      },
    });
    api.discoverPilotChatGpt = discoverChatGpt;
    const listCodexTargets = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        projects: [
          {
            projectId: 'project-1',
            projectName: 'AI Website Pilot',
            repositories: [repository],
            threads: Array.from({ length: 7 }, (_, index) => ({
              mappingId: `mapping-${String(index + 1)}`,
              externalThreadId: `thread-${String(index + 1)}`,
              title: `Codex task ${String(index + 1)}`,
              repositoryFingerprint: repository.fingerprint,
              updatedAt: timestamp,
            })),
          },
        ],
      },
    });
    api.listPilotCodexTargets = listCodexTargets;

    await act(async () => {
      root.render(
        createElement(LiveProjectPilot, {
          projectId: 'project-2',
          projectName: 'AI Website Pilot',
          repositories: [repository],
        }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('MVP planning');
    expect(container.textContent).toContain('Codex task 5');
    expect(container.textContent).not.toContain('Codex task 6');
    await act(async () => {
      button(container, 'Đồng bộ đoạn chat ChatGPT').click();
      await Promise.resolve();
    });
    expect(discoverChatGpt).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Đã đọc 1 đoạn chat từ các tab ChatGPT đang mở');
    await act(async () => {
      button(container, 'Đồng bộ project Codex').click();
      await Promise.resolve();
    });
    expect(listCodexTargets).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Đã đồng bộ 1 project từ Codex Desktop');
    await act(async () => {
      button(container, 'Hiện thêm 5 đoạn chat').click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Codex task 7');
  });

  it('explains how to recover when the persisted conversation is unavailable', async () => {
    api.inspectPilotChatGpt = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: 'CHATGPT_CONVERSATION_UNAVAILABLE',
        message: 'CHATGPT_CONVERSATION_UNAVAILABLE',
      },
    });

    await act(async () => {
      button(container, 'Kiểm tra ChatGPT').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Cuộc chat không khả dụng');
    expect(container.textContent).toContain('Conversation đang mở');
  });

  it('surfaces an unavailable conversation from automatic archive sync', async () => {
    const existing = pilot({
      destination: { mode: 'existing', conversationId: 'conversation-1' },
    });
    api.listPilots = vi.fn().mockResolvedValue({ ok: true, value: [existing] });
    api.syncPilotChatHistory = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: 'CHATGPT_CONVERSATION_UNAVAILABLE',
        message: 'CHATGPT_CONVERSATION_UNAVAILABLE',
      },
    });

    await act(async () => {
      root.render(
        createElement(LiveProjectPilot, {
          projectId: 'project-2',
          projectName: 'AI Website Pilot',
          repositories: [repository],
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Cuộc chat không khả dụng');
  });

  it('auto-syncs an exact existing conversation and exposes history actions', async () => {
    const existing = pilot({
      destination: {
        mode: 'existing',
        conversationId: 'conversation-1',
        conversationPath: '/g/project-1/c/conversation-1',
      },
      chatArchive: {
        sourceId: 'source-1',
        conversationId: 'conversation-1',
        revisionCount: 1,
        latestMessageCount: 2,
        latestContentHash: 'a'.repeat(64),
        lastSyncedAt: timestamp,
      },
    });
    api.listPilots = vi.fn().mockResolvedValue({ ok: true, value: [existing] });
    api.syncPilotChatHistory = vi.fn().mockResolvedValue({ ok: true, value: existing });
    await act(async () => {
      root.render(
        createElement(LiveProjectPilot, {
          projectId: 'project-2',
          projectName: 'AI Website Pilot',
          repositories: [repository],
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.syncPilotChatHistory).toHaveBeenCalledWith('pilot-1');
    expect(container.textContent).toContain('https://chatgpt.com/g/project-1/c/conversation-1');
    expect(container.textContent).toContain('Tự động lưu mỗi 30 giây');
    expect(container.textContent).toContain('Xuất toàn bộ lịch sử (.json)');
    await act(async () => {
      button(container, 'Xuất toàn bộ lịch sử (.json)').click();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.exportPilotChatHistory).toHaveBeenCalledWith('pilot-1');
  });

  it('prepares and explicitly confirms an account-switch transfer without changing Codex target', async () => {
    const existing = pilot({
      destination: { mode: 'existing', conversationId: 'old-chat' },
      codexDestination: { mode: 'new-thread', repositoryId: 'repository-1' },
      chatArchive: {
        sourceId: 'source-1',
        conversationId: 'old-chat',
        revisionCount: 2,
        latestMessageCount: 8,
        latestContentHash: 'e'.repeat(64),
        lastSyncedAt: timestamp,
      },
    });
    const transferred = pilot({
      ...existing,
      accountTransfer: {
        status: 'review_required',
        sourceDestination: existing.destination,
        targetDestination: { mode: 'new' },
        artifact: {
          zipPath: 'C:/transfers/history.zip',
          sha256: 'f'.repeat(64),
          payloadSha256: '1'.repeat(64),
          size: 2_048,
          conversationCount: 1,
          revisionCount: 2,
          deliveryMode: 'inline',
          createdAt: timestamp,
        },
        preview: { ...chatGptPreview, text: 'old account context', characterCount: 19 },
        workflowRunId: 'transfer-workflow-1',
        preparedAt: timestamp,
      },
    });
    const preparePilotAccountTransfer = vi
      .fn()
      .mockResolvedValue({ ok: true as const, value: transferred });
    api.preparePilotAccountTransfer = preparePilotAccountTransfer;
    api.syncPilotChatHistory = vi.fn().mockResolvedValue({ ok: true, value: transferred });
    const transferState = transferred.accountTransfer;
    if (!transferState) throw new Error('FIXTURE_TRANSFER_MISSING');
    const approvePilotAccountTransfer = vi.fn().mockResolvedValue({
      ok: true,
      value: pilot({
        ...transferred,
        accountTransfer: { ...transferState, status: 'dispatching' },
      }),
    });
    api.approvePilotAccountTransfer = approvePilotAccountTransfer;

    const transferButton = container.querySelector('.pilot-transfer-primary');
    if (!(transferButton instanceof HTMLButtonElement)) {
      throw new Error('Account transfer button not found.');
    }
    expect(transferButton.disabled).toBe(false);
    act(() => {
      transferButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    expect(preparePilotAccountTransfer).toHaveBeenCalledWith('pilot-1');
    expect(container.textContent).toContain('Chờ xem trước và xác nhận');
    expect(container.textContent).toContain('old account context');
    expect(container.textContent).toContain('C:/transfers/history.zip');

    act(() => {
      button(container, 'Xác nhận và gửi sang chat mới').click();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    expect(approvePilotAccountTransfer).toHaveBeenCalledWith('pilot-1');
  });
});
