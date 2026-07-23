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
  operatorNotes: WorkflowDashboard['operatorNotes'] = [],
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
    operatorNotes,
  };
}

describe('guided workflow renderer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ContextBridgeDesktopApi;
  let cancelWorkflow: ReturnType<typeof vi.fn<ContextBridgeDesktopApi['cancelWorkflow']>>;
  let rerunWorkflow: ReturnType<typeof vi.fn<ContextBridgeDesktopApi['rerunWorkflow']>>;
  let updateWorkflowNotes: ReturnType<typeof vi.fn<ContextBridgeDesktopApi['updateWorkflowNotes']>>;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    cancelWorkflow = vi.fn().mockResolvedValue({ ok: true, value: dashboard('cancelled') });
    rerunWorkflow = vi.fn().mockResolvedValue({
      ok: true,
      value: dashboard('context_review_required', 'rerun-1'),
    });
    updateWorkflowNotes = vi.fn((input) =>
      Promise.resolve({
        ok: true as const,
        value: dashboard(
          'idle',
          input.workflowRunId,
          input.notes.map((note, index) => ({
            id: note.id ?? `note-${String(index + 1)}`,
            target: note.target,
            mode: note.mode,
            text: note.text.trim(),
            createdAt: timestamp,
          })),
        ),
      }),
    );
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
      runWorkflow: vi
        .fn()
        .mockResolvedValue({ ok: true, value: dashboard('context_review_required') }),
      rerunWorkflow,
      cancelWorkflow,
      updateWorkflowNotes,
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
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.runWorkflow).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Review context');
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

  it('offers rerun after stop and selects the newly created reviewed run', async () => {
    const stop = container.querySelector('[aria-label="Dừng workflow workflow-1"]');
    expect(stop).toBeInstanceOf(HTMLButtonElement);
    if (!(stop instanceof HTMLButtonElement)) throw new Error('Stop button missing.');
    await act(async () => {
      stop.click();
      await Promise.resolve();
    });

    const rerun = container.querySelector('[aria-label="Chạy lại workflow workflow-1"]');
    expect(rerun).toBeInstanceOf(HTMLButtonElement);
    if (!(rerun instanceof HTMLButtonElement)) throw new Error('Rerun button missing.');
    await act(async () => {
      rerun.click();
      await Promise.resolve();
    });

    expect(rerunWorkflow).toHaveBeenCalledTimes(1);
    expect(rerunWorkflow).toHaveBeenCalledWith('workflow-1');
    expect(container.textContent).toContain('Run rerun-1');
    expect(container.textContent).toContain('Review context');
    expect(
      container.querySelector('.run-card.active [aria-pressed="true"]')?.textContent,
    ).toContain('rerun-1');
  });

  it('adds and deletes controlled notes through the exact typed workflow IPC payload', async () => {
    const target = container.querySelector('[aria-label="Đích ghi chú workflow"]');
    const mode = container.querySelector('[aria-label="Chế độ ghi chú workflow"]');
    const textarea = container.querySelector('[aria-label="Ghi chú workflow"]');
    expect(target).toBeInstanceOf(HTMLSelectElement);
    expect(mode).toBeInstanceOf(HTMLSelectElement);
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
    if (
      !(target instanceof HTMLSelectElement) ||
      !(mode instanceof HTMLSelectElement) ||
      !(textarea instanceof HTMLTextAreaElement)
    ) {
      throw new Error('Controlled note editor missing.');
    }

    await act(async () => {
      target.value = 'chatgpt';
      target.dispatchEvent(new Event('change', { bubbles: true }));
      mode.value = 'repeat';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      if (!valueSetter) throw new Error('Textarea setter missing.');
      Reflect.apply(valueSetter, textarea, ['  Ghi chú thử  ']);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    const add = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Thêm ghi chú',
    );
    expect(add).toBeInstanceOf(HTMLButtonElement);
    if (!(add instanceof HTMLButtonElement)) throw new Error('Add note button missing.');
    await act(async () => {
      add.click();
      await Promise.resolve();
    });

    expect(updateWorkflowNotes).toHaveBeenNthCalledWith(1, {
      workflowRunId: 'workflow-1',
      notes: [{ target: 'chatgpt', mode: 'repeat', text: 'Ghi chú thử' }],
    });
    expect(container.textContent).toContain('Ghi chú thử');

    const remove = container.querySelector('[aria-label="Xóa ghi chú workflow note-1"]');
    expect(remove).toBeInstanceOf(HTMLButtonElement);
    if (!(remove instanceof HTMLButtonElement)) throw new Error('Delete note button missing.');
    await act(async () => {
      remove.click();
      await Promise.resolve();
    });
    expect(updateWorkflowNotes).toHaveBeenNthCalledWith(2, {
      workflowRunId: 'workflow-1',
      notes: [],
    });
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
