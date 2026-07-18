import { useEffect, useMemo, useState } from 'react';
import type { WorkflowState } from '@codex-context-bridge/contracts';
import type { WorkflowDashboard } from '../workflow-ipc';

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

export function WorkflowWorkspace({ projectId }: { projectId: string }): React.JSX.Element {
  const [items, setItems] = useState<WorkflowDashboard[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('Loading persistent workflow history...');
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    void load();
  }, [projectId]);

  const start = async (): Promise<void> => {
    setBusy(true);
    const response = await window.contextBridgeDesktop.startWorkflow(projectId);
    setBusy(false);
    if (!response.ok) {
      setNotice(response.error.message);
      return;
    }
    setItems((current) => [response.value, ...current]);
    setSelectedId(response.value.run.id);
    setNotice('Guided workflow created. No data has been sent.');
  };

  const cancel = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    const response = await window.contextBridgeDesktop.cancelWorkflow(selected.run.id);
    setBusy(false);
    if (!response.ok) {
      setNotice(response.error.message);
      return;
    }
    setItems((current) =>
      current.map((item) => (item.run.id === response.value.run.id ? response.value : item)),
    );
    setNotice('Workflow cancelled through the validated main-process boundary.');
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
          <button type="button" onClick={() => void load()} disabled={busy}>
            Refresh diagnostics
          </button>
          <button
            className="workflow-primary"
            type="button"
            onClick={() => void start()}
            disabled={busy}
          >
            Start guided workflow
          </button>
        </div>
      </div>

      <div className="workflow-columns">
        <nav className="run-list" aria-label="Workflow runs">
          {items.map((item) => (
            <button
              className={item.run.id === selected?.run.id ? 'run-card active' : 'run-card'}
              key={item.run.id}
              type="button"
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
          ))}
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
              <button
                className="cancel-action"
                type="button"
                disabled={busy || terminalStates.has(selected.run.state)}
                onClick={() => void cancel()}
              >
                Cancel workflow
              </button>
            </>
          ) : (
            <p className="empty-state">Approval scopes and recovery actions appear here.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
