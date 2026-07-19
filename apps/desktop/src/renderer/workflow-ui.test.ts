// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBridgeDesktopApi } from '../preload';
import type { WorkflowDashboard } from '../workflow-ipc';
import { WorkflowWorkspace } from './workflow-ui';

const timestamp = '2026-07-18T11:00:00.000Z';

function dashboard(state: WorkflowDashboard['run']['state'] = 'idle'): WorkflowDashboard {
  return {
    run: {
      id: 'workflow-1',
      correlationId: 'correlation-1',
      projectId: 'project-1',
      state,
      idempotencyKey: 'idempotency-1',
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
        workflowRunId: 'workflow-1',
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
      listWorkflows: vi.fn().mockResolvedValue({ ok: true, value: [dashboard()] }),
      startWorkflow: vi.fn().mockResolvedValue({ ok: true, value: dashboard() }),
      cancelWorkflow,
      listPilots: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      createPilot: vi.fn(),
      refreshPilot: vi.fn(),
      verifyPilotWebsite: vi.fn(),
      openPilotPreview: vi.fn(),
      inspectPilotChatGpt: vi.fn(),
      preparePilotChatGpt: vi.fn(),
      approvePilotChatGpt: vi.fn(),
      capturePilotChatGpt: vi.fn(),
      syncPilotChatHistory: vi.fn(),
      exportPilotChatHistory: vi.fn(),
      approvePilotCodex: vi.fn(),
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

  it('shows an accessible timeline and persists cancellation through IPC', async () => {
    expect(container.querySelector('[aria-label="Workflow runs"]')).not.toBeNull();
    expect(container.textContent).toContain('Workflow timeline');
    const cancel = [...container.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Cancel workflow'),
    );
    expect(cancel).toBeInstanceOf(HTMLButtonElement);
    if (!(cancel instanceof HTMLButtonElement)) throw new Error('Cancel button missing.');
    await act(async () => {
      cancel.click();
      await Promise.resolve();
    });
    expect(cancelWorkflow).toHaveBeenCalledWith('workflow-1');
    expect(container.textContent).toContain('Cancelled');
  });
});
