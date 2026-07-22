import { useEffect, useMemo, useState } from 'react';
import type { WorkflowState } from '@codex-context-bridge/contracts';
import type { WorkflowDashboard, WorkflowLog } from '../workflow-ipc';

const stateLabels: Record<WorkflowState, string> = {
  idle: 'Ready',
  project_resolving: 'Resolving project',
  project_confirmation_required: 'Project confirmation',
  codex_running: 'Codex working',
  codex_failed: 'Codex failed',
  codex_completed: 'Codex completed',
  building_context: 'Building context',
  context_review_required: 'Review context',
  context_approved: 'Context approved',
  sent_to_chatgpt: 'Sent to ChatGPT',
  waiting_chatgpt: 'Waiting for ChatGPT',
  chatgpt_response_captured: 'Response captured',
  validating_chatgpt_response: 'Validating response',
  chatgpt_response_invalid: 'Response blocked',
  codex_prompt_review_required: 'Review Codex prompt',
  codex_prompt_approved: 'Codex prompt approved',
  sent_to_codex: 'Sent to Codex',
  finished: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const terminalStates = new Set<WorkflowState>(['finished', 'failed', 'cancelled']);

function tone(state: WorkflowState): string {
  if (state === 'finished' || state === 'codex_completed') return 'success';
  if (state === 'failed' || state === 'codex_failed') return 'failed';
  if (state === 'cancelled') return 'cancelled';
  if (
    state === 'project_confirmation_required' ||
    state === 'context_review_required' ||
    state === 'codex_prompt_review_required' ||
    state === 'chatgpt_response_invalid'
  ) {
    return 'warning';
  }
  return state === 'idle' ? 'idle' : 'working';
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function localDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function outcomeLabel(outcome: WorkflowLog['outcome']): string {
  if (outcome === 'allowed') return 'Thành công';
  if (outcome === 'blocked') return 'Bị chặn';
  return 'Lỗi';
}

export function WorkflowWorkspace({ projectId }: { projectId: string }): React.JSX.Element {
  const [items, setItems] = useState<WorkflowDashboard[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('Loading persistent workflow history...');
  const [pendingKey, setPendingKey] = useState('');
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [logNotice, setLogNotice] = useState('Chưa tải log.');
  const [logsBusy, setLogsBusy] = useState(false);
  const busy = Boolean(pendingKey);

  const selected = useMemo(
    () => items.find((item) => item.run.id === selectedId) ?? items[0],
    [items, selectedId],
  );

  const load = async (): Promise<void> => {
    const response = await window.contextBridgeDesktop.listWorkflows(projectId);
    if (!response.ok) {
      setNotice(response.error.message);
      return;
    }
    setItems(response.value);
    setSelectedId((current) =>
      response.value.some((item) => item.run.id === current)
        ? current
        : (response.value[0]?.run.id ?? ''),
    );
    setNotice(
      response.value.length
        ? 'History is reconstructed from persisted events and effect state.'
        : 'No workflow yet. Start a guided run for this project.',
    );
  };

  const loadLogs = async (): Promise<void> => {
    if (logsBusy) return;
    setLogsBusy(true);
    try {
      setLogNotice('Đang tải log chi tiết...');
      const response = await window.contextBridgeDesktop.listWorkflowLogs(projectId, 100);
      if (!response.ok) {
        setLogNotice(`${response.error.code}: ${response.error.message}`);
        return;
      }
      setLogs(response.value);
      setLogNotice(
        response.value.length
          ? `${String(response.value.length)} log mới nhất, dữ liệu nhạy cảm đã được loại bỏ.`
          : 'Chưa có log cho project này.',
      );
    } finally {
      setLogsBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    if (!logsOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLogsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [logsOpen]);

  const create = async (): Promise<void> => {
    setPendingKey('create');
    const response = await window.contextBridgeDesktop.startWorkflow(projectId);
    setPendingKey('');
    if (!response.ok) {
      setNotice(response.error.message);
      return;
    }
    setItems((current) => [response.value, ...current]);
    setSelectedId(response.value.run.id);
    setNotice('Guided workflow created. No data has been sent.');
  };

  const run = async (workflowRunId: string): Promise<void> => {
    setPendingKey(`run:${workflowRunId}`);
    const response = await window.contextBridgeDesktop.runWorkflow(workflowRunId);
    setPendingKey('');
    if (!response.ok) {
      setNotice(`${response.error.code}: ${response.error.message}`);
      return;
    }
    setItems((current) =>
      current.map((item) => (item.run.id === workflowRunId ? response.value : item)),
    );
    setSelectedId(workflowRunId);
    setNotice(
      'Workflow đã chuyển sang trạng thái chạy có hướng dẫn; chưa có dữ liệu nào được gửi.',
    );
  };

  const stop = async (workflowRunId: string): Promise<void> => {
    setPendingKey(`stop:${workflowRunId}`);
    const response = await window.contextBridgeDesktop.cancelWorkflow(workflowRunId);
    setPendingKey('');
    if (!response.ok) {
      setNotice(`${response.error.code}: ${response.error.message}`);
      return;
    }
    setItems((current) =>
      current.map((item) => (item.run.id === workflowRunId ? response.value : item)),
    );
    setSelectedId(workflowRunId);
    setNotice('Workflow đã dừng qua main process và sự kiện đã được ghi log.');
  };

  const remove = async (workflowRunId: string): Promise<void> => {
    const item = items.find((candidate) => candidate.run.id === workflowRunId);
    if (
      !item ||
      !window.confirm(`Xóa workflow ${shortId(workflowRunId)}? Lịch sử audit an toàn vẫn được giữ.`)
    ) {
      return;
    }
    setPendingKey(`delete:${workflowRunId}`);
    const response = await window.contextBridgeDesktop.deleteWorkflow(workflowRunId);
    setPendingKey('');
    if (!response.ok) {
      setNotice(`${response.error.code}: ${response.error.message}`);
      return;
    }
    const index = items.findIndex((candidate) => candidate.run.id === workflowRunId);
    const remaining = items.filter((candidate) => candidate.run.id !== workflowRunId);
    setItems(remaining);
    setSelectedId((current) =>
      current === workflowRunId
        ? (remaining[Math.min(index, remaining.length - 1)]?.run.id ?? '')
        : current,
    );
    setNotice(`Đã xóa workflow ${shortId(workflowRunId)}. Audit log vẫn được bảo toàn.`);
  };

  const openLogs = (): void => {
    setLogsOpen(true);
    void loadLogs();
  };

  return (
    <section className="workflow-deck" aria-label="Guided workflow">
      <div className="workflow-deck-header">
        <div>
          <p className="eyebrow">GUIDED HANDOFF / ASSISTED MODE</p>
          <h2>One trail. Every review visible.</h2>
          <p className="workflow-notice" role="status">
            {notice}
          </p>
        </div>
        <div className="workflow-actions">
          <button className="workflow-log-trigger" type="button" onClick={openLogs} disabled={busy}>
            Log chi tiết
          </button>
          <button type="button" onClick={() => void load()} disabled={busy}>
            Refresh diagnostics
          </button>
          <button
            className="workflow-primary"
            type="button"
            onClick={() => void create()}
            disabled={busy}
          >
            Start guided workflow
          </button>
        </div>
      </div>

      <div className="workflow-columns">
        <nav className="run-list" aria-label="Workflow runs">
          {items.map((item) => {
            const terminal = terminalStates.has(item.run.state);
            const itemBusy = pendingKey.endsWith(`:${item.run.id}`);
            return (
              <article
                className={item.run.id === selected?.run.id ? 'run-card active' : 'run-card'}
                key={item.run.id}
              >
                <button
                  className="run-card-select"
                  type="button"
                  aria-pressed={item.run.id === selected?.run.id}
                  onClick={() => setSelectedId(item.run.id)}
                >
                  <span className={`state-badge ${tone(item.run.state)}`}>
                    {stateLabels[item.run.state]}
                  </span>
                  <strong>Run {shortId(item.run.id)}</strong>
                  <small>
                    Iteration {item.run.iterationCount}/{item.run.maxIterations}
                  </small>
                </button>
                <div className="run-card-actions" aria-label={`Thao tác workflow ${item.run.id}`}>
                  <button
                    type="button"
                    disabled={busy || item.run.state !== 'idle'}
                    aria-label={`Chạy workflow ${item.run.id}`}
                    onClick={() => void run(item.run.id)}
                  >
                    {itemBusy && pendingKey.startsWith('run:') ? 'Đang chạy' : 'Chạy'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || terminal}
                    aria-label={`Dừng workflow ${item.run.id}`}
                    onClick={() => void stop(item.run.id)}
                  >
                    {itemBusy && pendingKey.startsWith('stop:') ? 'Đang dừng' : 'Dừng'}
                  </button>
                  <button
                    className="run-delete"
                    type="button"
                    disabled={busy || !terminal}
                    aria-label={`Xóa workflow ${item.run.id}`}
                    onClick={() => void remove(item.run.id)}
                  >
                    {itemBusy && pendingKey.startsWith('delete:') ? 'Đang xóa' : 'Xóa'}
                  </button>
                </div>
              </article>
            );
          })}
          {items.length === 0 && <p className="empty-state">Persistent history is empty.</p>}
        </nav>

        <div className="timeline-panel">
          <div className="section-heading compact">
            <span>FLOW</span>
            <h2>Workflow timeline</h2>
            {selected && <b>{selected.events.length}</b>}
          </div>
          {selected ? (
            <ol className="timeline">
              {selected.events.map((event) => (
                <li key={event.id}>
                  <span className={`timeline-marker ${tone(event.toState)}`} aria-hidden="true" />
                  <div>
                    <strong>{stateLabels[event.toState]}</strong>
                    <small>{event.eventType}</small>
                  </div>
                  <time>{new Date(event.occurredAt).toLocaleTimeString()}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Select or start a workflow to see its event trail.</p>
          )}
        </div>

        <aside className="review-panel">
          <div className="section-heading compact">
            <span>SAFE</span>
            <h2>Review & recovery</h2>
          </div>
          {selected ? (
            <>
              <div className="review-facts">
                <p>
                  <span>Project</span>
                  <strong>{shortId(selected.run.projectId)}</strong>
                </p>
                <p>
                  <span>Recovery</span>
                  <strong>{selected.run.recoveryStatus}</strong>
                </p>
                <p>
                  <span>Approvals</span>
                  <strong>{selected.approvals.length}</strong>
                </p>
                <p>
                  <span>Retries</span>
                  <strong>
                    {selected.run.failureRetries}/{selected.run.maxFailureRetries}
                  </strong>
                </p>
              </div>
              {selected.recovery.map((item) => (
                <div className="recovery-callout" key={item.effect.id}>
                  <strong>{item.action.replaceAll('_', ' ')}</strong>
                  <span>
                    {item.effect.operation} to {item.effect.destinationType}
                  </span>
                </div>
              ))}
              <div className="diagnostic-list">
                {selected.diagnostics.slice(0, 4).map((item, index) => (
                  <p key={`${item.createdAt}:${String(index)}`}>
                    <span>{item.outcome}</span>
                    {item.eventType}
                  </p>
                ))}
              </div>
              <p className="workflow-action-hint">
                Chạy, dừng hoặc xóa trực tiếp trên từng workflow ở cột bên trái.
              </p>
            </>
          ) : (
            <p className="empty-state">Approval scopes and recovery actions appear here.</p>
          )}
        </aside>
      </div>

      {logsOpen && (
        <div
          className="workflow-log-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLogsOpen(false);
          }}
        >
          <section
            className="workflow-log-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workflow-log-title"
          >
            <header>
              <div>
                <p className="eyebrow">AUDIT / PROJECT LOG</p>
                <h2 id="workflow-log-title">Log chi tiết</h2>
                <p role="status">{logNotice}</p>
              </div>
              <div className="workflow-log-actions">
                <button type="button" onClick={() => void loadLogs()} disabled={busy || logsBusy}>
                  {logsBusy ? 'Đang tải' : 'Làm mới'}
                </button>
                <button
                  type="button"
                  onClick={() => setLogsOpen(false)}
                  aria-label="Đóng log chi tiết"
                >
                  Đóng
                </button>
              </div>
            </header>
            <ol className="workflow-log-list">
              {logs.map((item) => (
                <li key={item.id}>
                  <div className="workflow-log-line">
                    <span className={`log-outcome ${item.outcome}`}>
                      {outcomeLabel(item.outcome)}
                    </span>
                    <strong>{item.eventType}</strong>
                    <time dateTime={item.createdAt}>{localDateTime(item.createdAt)}</time>
                  </div>
                  <div className="workflow-log-meta">
                    <span>Actor: {item.actor}</span>
                    <span>
                      Resource: {item.resourceType ?? 'không ghi nhận'}
                      {item.resourceId ? ` / ${shortId(item.resourceId)}` : ''}
                    </span>
                    {item.workflowRunId && <span>Workflow: {shortId(item.workflowRunId)}</span>}
                  </div>
                  {item.outcome !== 'allowed' && (
                    <p className="workflow-log-error">
                      Nguyên nhân: {item.errorCode ?? 'Không có mã lỗi được ghi nhận'}
                    </p>
                  )}
                </li>
              ))}
              {logs.length === 0 && <li className="empty-state">Chưa có log để hiển thị.</li>}
            </ol>
          </section>
        </div>
      )}
    </section>
  );
}
