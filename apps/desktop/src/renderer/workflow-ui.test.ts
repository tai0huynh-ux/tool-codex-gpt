// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBridgeDesktopApi } from '../preload';
import type { WorkflowDashboard } from '../workflow-ipc';
import { WorkflowWorkspace } from './workflow-ui';

const timestamp = '2026-07-18T11:00:00.000Z';

function dashboard(
  state: WorkflowDashboard['run']['state'] = 'idle',
  id = 'workflow-1',
): WorkflowDashboard {
  return {
    run: {
      id,
      correlationId: `correlation-${id}`,
      projectId: 'project-1',
      state,
      idempotencyKey: `idempotency-${id}`,
      iterationCount: 0,
      failureRetries: 0,
      maxIterations: 5,
      maxFailureRetries: 2,
      recoveryStatus: 'none',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    events: [
      {
        id: 'event-1',
        workflowRunId: id,
        sequence: 1,
        toState: state,
        eventType: 'workflow.created',
        actor: 'system',
        payload: {},
        occurredAt: timestamp,
      },
    ],
    recovery: [],
    approvals: [],
    diagnostics: [],
  };
}

describe('guided workflow renderer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ContextBridgeDesktopApi;
  let cancelWorkflow: ReturnType<typeof vi.fn<ContextBridgeDesktopApi['cancelWorkflow']>>;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    cancelWorkflow = vi.fn().mockResolvedValue({ ok: true, value: dashboard('cancelled') });
    api = {
      getTransportStatus: vi.fn().mockResolvedValue({
        ok: true,
        value: { transport: 'native_messaging', state: 'disconnected', permissionActive: true },
      }),
      executeTransportOperation: vi.fn(),
      listProjects: vi.fn(),
      createProject: vi.fn(),
      archiveProject: vi.fn(),
      addProjectAlias: vi.fn(),
      chooseRepositoryRoot: vi.fn(),
      previewRepository: vi.fn(),
      confirmRepository: vi.fn(),
      listWorkflows: vi.fn().mockResolvedValue({
        ok: true,
        value: [dashboard(), dashboard('cancelled', 'workflow-2')],
      }),
      startWorkflow: vi.fn().mockResolvedValue({ ok: true, value: dashboard() }),
      runWorkflow: vi.fn().mockResolvedValue({ ok: true, value: dashboard('project_resolving') }),
      cancelWorkflow,
      deleteWorkflow: vi
        .fn()
        .mockResolvedValue({ ok: true, value: { workflowRunId: 'workflow-1' } }),
      listWorkflowLogs: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            id: 'log-1',
            createdAt: timestamp,
            eventType: 'workflow.delete.blocked',
            outcome: 'failed',
            actor: 'user',
            projectId: 'project-1',
            resourceType: 'workflow_run',
            resourceId: 'workflow-1',
            workflowRunId: 'workflow-1',
            errorCode: 'WORKFLOW_NOT_DELETABLE',
          },
        ],
      }),
      listPilots: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      discoverPilotChatGpt: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          conversations: [],
          capturedAt: '2026-07-19T08:00:00.000Z',
          truncated: false,
        },
      }),
      listPilotCodexTargets: vi.fn().mockResolvedValue({ ok: true, value: { projects: [] } }),
      createPilot: vi.fn(),
      updatePilotNotes: vi.fn(),
      updatePilotChatSelection: vi.fn(),
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
      root.render(createElement(WorkflowWorkspace, { projectId: 'project-1' }));
      await Promise.resolve();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });

  it('shows per-workflow run, stop, and delete controls with exact IPC calls', async () => {
    expect(container.querySelector('[aria-label="Workflow runs"]')).not.toBeNull();
    expect(container.textContent).toContain('Workflow timeline');
    const run = container.querySelector('[aria-label="Chạy workflow workflow-1"]');
    expect(run).toBeInstanceOf(HTMLButtonElement);
    if (!(run instanceof HTMLButtonElement)) throw new Error('Run button missing.');
    await act(async () => {
      run.click();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.runWorkflow).toHaveBeenCalledWith('workflow-1');
    const stop = container.querySelector('[aria-label="Dừng workflow workflow-1"]');
    expect(stop).toBeInstanceOf(HTMLButtonElement);
    if (!(stop instanceof HTMLButtonElement)) throw new Error('Stop button missing.');
    await act(async () => {
      stop.click();
      await Promise.resolve();
    });
    expect(cancelWorkflow).toHaveBeenCalledWith('workflow-1');
    const deleteButton = container.querySelector('[aria-label="Xóa workflow workflow-1"]');
    expect(deleteButton).toBeInstanceOf(HTMLButtonElement);
    if (!(deleteButton instanceof HTMLButtonElement)) throw new Error('Delete button missing.');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      deleteButton.click();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.deleteWorkflow).toHaveBeenCalledWith('workflow-1');
    expect(container.textContent).toContain('Cancelled');
  });

  it('opens the detailed log dialog with timestamp and error cause', async () => {
    const logButton = [...container.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Log chi tiết'),
    );
    expect(logButton).toBeInstanceOf(HTMLButtonElement);
    if (!(logButton instanceof HTMLButtonElement)) throw new Error('Log button missing.');
    await act(async () => {
      logButton.click();
      await Promise.resolve();
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.listWorkflowLogs).toHaveBeenCalledWith('project-1', 100);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('WORKFLOW_NOT_DELETABLE');
    expect(container.querySelector('time[dateTime="2026-07-18T11:00:00.000Z"]')).not.toBeNull();
  });
});
