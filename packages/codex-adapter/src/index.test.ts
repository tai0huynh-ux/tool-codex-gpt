import { describe, expect, it } from 'vitest';
import { MockCodexAdapter, type CodexRun, type CodexRunEvent } from './index';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitForTerminal(adapter: MockCodexAdapter, runId: string): Promise<CodexRun> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = await adapter.getRun(runId);
    if (run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('TEST_RUN_DID_NOT_TERMINATE');
}

async function startThread(adapter: MockCodexAdapter) {
  return adapter.startThread({
    projectId: 'project-1',
    repositoryFingerprint: 'fingerprint-1',
    workingDirectory: 'C:/work/bridge',
  });
}

describe('MockCodexAdapter', () => {
  it('preserves project identity and resumes the same structured thread', async () => {
    const adapter = new MockCodexAdapter();
    const thread = await startThread(adapter);

    expect(await adapter.resumeThread(thread.id)).toEqual(thread);
  });

  it('replays a lossless ordered lifecycle to late subscribers', async () => {
    const adapter = new MockCodexAdapter({ now: () => '2026-07-18T00:00:00.000Z' });
    const thread = await startThread(adapter);
    const startedRun = await adapter.runTurn(thread.id, 'read only');
    expect(startedRun.status).toBe('running');
    expect((await waitForTerminal(adapter, startedRun.id)).finalResponse).toBe(
      'MOCK_ONLY:read only',
    );

    const events: CodexRunEvent[] = [];
    adapter.subscribe(startedRun.id, (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'run.progress',
      'run.completed',
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(events.every((event) => event.threadId === thread.id)).toBe(true);
  });

  it('cancels a running execution without allowing late completion', async () => {
    const execution = deferred<string>();
    const adapter = new MockCodexAdapter({ execute: () => execution.promise });
    const thread = await startThread(adapter);
    const run = await adapter.runTurn(thread.id, 'cancel me');
    const events: CodexRunEvent[] = [];
    adapter.subscribe(run.id, (event) => events.push(event));

    await adapter.cancelRun(run.id);
    await adapter.cancelRun(run.id);
    execution.resolve('too late');
    await new Promise((resolve) => setTimeout(resolve, 1));

    expect(await adapter.getRun(run.id)).toMatchObject({ status: 'cancelled' });
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'run.progress',
      'run.cancelled',
    ]);
  });

  it('maps execution failures to structured terminal events', async () => {
    const adapter = new MockCodexAdapter({
      execute: () => Promise.reject(new Error('fixture failure')),
    });
    const thread = await startThread(adapter);
    const run = await adapter.runTurn(thread.id, 'fail safely');
    const failed = await waitForTerminal(adapter, run.id);
    const events: CodexRunEvent[] = [];
    adapter.subscribe(run.id, (event) => events.push(event));

    expect(failed).toMatchObject({
      status: 'failed',
      error: { code: 'MOCK_EXECUTION_FAILED', message: 'fixture failure', retryable: false },
    });
    expect(events.at(-1)).toMatchObject({ type: 'run.failed', sequence: 3 });
  });

  it('rejects cancellation after successful completion', async () => {
    const adapter = new MockCodexAdapter();
    const thread = await startThread(adapter);
    const run = await adapter.runTurn(thread.id, 'complete');
    await waitForTerminal(adapter, run.id);

    await expect(adapter.cancelRun(run.id)).rejects.toThrow('CODEX_RUN_TERMINAL');
    expect((await adapter.getRun(run.id)).status).toBe('completed');
  });

  it('isolates subscriber failures from lifecycle delivery', async () => {
    const adapter = new MockCodexAdapter();
    const thread = await startThread(adapter);
    const run = await adapter.runTurn(thread.id, 'keep delivering');
    const observed: string[] = [];
    adapter.subscribe(run.id, () => {
      throw new Error('broken consumer');
    });
    adapter.subscribe(run.id, (event) => observed.push(event.type));

    await waitForTerminal(adapter, run.id);
    expect(observed).toEqual(['run.started', 'run.progress', 'run.completed']);
  });
});
