// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBridgeDesktopApi } from '../preload';
import type { ProjectView } from '../project-ipc';
import { App, buildRepositoryInput } from './project-ui';

const timestamp = '2026-07-18T10:00:00.000Z';

function project(id: string, name: string): ProjectView {
  return {
    project: { id, name, createdAt: timestamp, updatedAt: timestamp },
    aliases: [],
    repositories: [],
  };
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find((item) =>
    item.textContent.includes(label),
  );
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`);
  return match;
}

describe('project mapping renderer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ContextBridgeDesktopApi;
  let confirmRepository: ReturnType<typeof vi.fn<ContextBridgeDesktopApi['confirmRepository']>>;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    confirmRepository = vi
      .fn<ContextBridgeDesktopApi['confirmRepository']>()
      .mockResolvedValue({ ok: true, value: project('project-2', 'Hai') });
    api = {
      getTransportStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: { transport: 'native_messaging', state: 'disconnected', permissionActive: true },
      }),
      executeTransportOperation: vi.fn(),
      listProjects: vi.fn().mockResolvedValue({
        ok: true,
        value: [project('project-1', 'Một'), project('project-2', 'Hai')],
      }),
      createProject: vi.fn(),
      archiveProject: vi.fn(),
      addProjectAlias: vi.fn(),
      chooseRepositoryRoot: vi.fn().mockResolvedValue({ ok: true, value: 'C:/work/bridge' }),
      previewRepository: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          detection: {
            ambiguousProjectIds: ['project-1', 'project-2'],
            confidence: 0.65,
            evidence: [{ type: 'git-remote', value: 'github.com/acme/bridge', score: 0.45 }],
            requiresConfirmation: true,
          },
          candidateProjects: [
            { id: 'project-1', name: 'Một' },
            { id: 'project-2', name: 'Hai' },
          ],
        },
      }),
      confirmRepository,
      listWorkflows: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      startWorkflow: vi.fn(),
      runWorkflow: vi.fn(),
      cancelWorkflow: vi.fn(),
      deleteWorkflow: vi.fn(),
      listWorkflowLogs: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      listPilots: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      discoverPilotChatGpt: vi.fn().mockResolvedValue({
        ok: true,
        value: { conversations: [], capturedAt: timestamp, truncated: false },
      }),
      listPilotCodexTargets: vi.fn().mockResolvedValue({ ok: true, value: { projects: [] } }),
      createPilot: vi.fn(),
      deletePilot: vi.fn(),
      refreshPilot: vi.fn(),
      verifyPilotWebsite: vi.fn(),
      openPilotPreview: vi.fn(),
      inspectPilotChatGpt: vi.fn(),
      preparePilotChatGpt: vi.fn(),
      approvePilotChatGpt: vi.fn(),
      capturePilotChatGpt: vi.fn(),
      syncPilotChatHistory: vi.fn(),
      exportPilotChatHistory: vi.fn(),
      preparePilotAccountTransfer: vi.fn(),
      approvePilotAccountTransfer: vi.fn(),
      capturePilotAccountTransfer: vi.fn(),
      revealPilotAccountTransfer: vi.fn(),
      approvePilotCodex: vi.fn(),
      revealPilotCodexBundle: vi.fn(),
    };
    Object.defineProperty(window, 'contextBridgeDesktop', { configurable: true, value: api });
    await act(async () => {
      root.render(createElement(App));
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

  it('requires an explicit project choice for an ambiguous repository before confirmation', async () => {
    expect(container.textContent).toContain('Một');
    expect(container.textContent).toContain('Hai');

    await act(async () => {
      button('Chọn thư mục').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('Phân tích repository').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('65%');
    expect(container.textContent).toContain('Xác nhận thủ công bắt buộc');
    await act(async () => {
      button('Hai').click();
      await Promise.resolve();
    });
    await act(async () => {
      button('Xác nhận và ghi nhớ mapping').click();
      await Promise.resolve();
    });

    expect(confirmRepository).toHaveBeenCalledWith('project-2', {
      repoRoot: 'C:/work/bridge',
      worktreeRoot: 'C:/work/bridge',
    });
  });

  it('omits blank optional repository properties', () => {
    expect(
      buildRepositoryInput({
        repoRoot: ' C:/work/bridge ',
        gitRemote: ' ',
        branch: ' main ',
        projectName: '',
        worktreeRoot: '',
      }),
    ).toEqual({ repoRoot: 'C:/work/bridge', branch: 'main' });
  });
});
