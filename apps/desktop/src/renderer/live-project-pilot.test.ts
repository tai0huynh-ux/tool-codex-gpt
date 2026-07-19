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
      value: [pilot({ status: 'chatgpt_ready', chatGptPreview })],
    }),
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
    approvePilotCodex: vi
      .fn()
      .mockResolvedValue({ ok: true, value: pilot({ status: 'codex_running' }) }),
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
    });
  });
});
