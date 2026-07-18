import { randomUUID } from 'node:crypto';

export interface StartThreadInput {
  projectId: string;
  repositoryFingerprint: string;
  workingDirectory: string;
}

export interface CodexThread extends StartThreadInput {
  id: string;
}

export type CodexRunStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface CodexRun {
  id: string;
  threadId: string;
  status: CodexRunStatus;
  finalResponse?: string;
  error?: CodexRunError;
}

export interface CodexRunError {
  code: string;
  message: string;
  retryable: boolean;
}

interface CodexRunEventBase {
  runId: string;
  threadId: string;
  sequence: number;
  occurredAt: string;
}

export type CodexRunEvent =
  | (CodexRunEventBase & { type: 'run.started' })
  | (CodexRunEventBase & { type: 'run.progress'; stage: string })
  | (CodexRunEventBase & { type: 'run.completed'; finalResponse: string })
  | (CodexRunEventBase & { type: 'run.failed'; error: CodexRunError })
  | (CodexRunEventBase & { type: 'run.cancelled' });

export interface CodexAdapter {
  startThread(input: StartThreadInput): Promise<CodexThread>;
  resumeThread(threadId: string): Promise<CodexThread>;
  runTurn(threadId: string, prompt: string): Promise<CodexRun>;
  getRun(runId: string): Promise<CodexRun>;
  cancelRun(runId: string): Promise<void>;
  subscribe(runId: string, listener: (event: CodexRunEvent) => void): () => void;
}

export interface MockCodexAdapterOptions {
  execute?: (prompt: string) => Promise<string>;
  now?: () => string;
}

export class MockCodexAdapter implements CodexAdapter {
  private readonly threads = new Map<string, CodexThread>();
  private readonly runs = new Map<string, CodexRun>();
  private readonly eventHistory = new Map<string, CodexRunEvent[]>();
  private readonly listeners = new Map<string, Set<(event: CodexRunEvent) => void>>();
  private readonly execute: (prompt: string) => Promise<string>;
  private readonly now: () => string;

  public constructor(options: MockCodexAdapterOptions = {}) {
    this.execute = options.execute ?? ((prompt) => Promise.resolve(`MOCK_ONLY:${prompt}`));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  public startThread(input: StartThreadInput): Promise<CodexThread> {
    const thread = { id: randomUUID(), ...input };
    this.threads.set(thread.id, thread);
    return Promise.resolve({ ...thread });
  }

  public resumeThread(threadId: string): Promise<CodexThread> {
    const thread = this.threads.get(threadId);
    return thread
      ? Promise.resolve({ ...thread })
      : Promise.reject(new Error('CODEX_THREAD_NOT_FOUND'));
  }

  public async runTurn(threadId: string, prompt: string): Promise<CodexRun> {
    await this.resumeThread(threadId);
    const run: CodexRun = { id: randomUUID(), threadId, status: 'running' };
    this.runs.set(run.id, run);
    this.emit(run.id, { type: 'run.started' });
    this.emit(run.id, { type: 'run.progress', stage: 'mock.processing' });
    setTimeout(() => void this.finishRun(run.id, prompt), 0);
    return { ...run };
  }

  public getRun(runId: string): Promise<CodexRun> {
    const run = this.runs.get(runId);
    return run
      ? Promise.resolve(this.copyRun(run))
      : Promise.reject(new Error('CODEX_RUN_NOT_FOUND'));
  }

  public cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return Promise.reject(new Error('CODEX_RUN_NOT_FOUND'));
    if (run.status === 'cancelled') return Promise.resolve();
    if (run.status !== 'running') return Promise.reject(new Error('CODEX_RUN_TERMINAL'));

    run.status = 'cancelled';
    this.emit(runId, { type: 'run.cancelled' });
    return Promise.resolve();
  }

  public subscribe(runId: string, listener: (event: CodexRunEvent) => void): () => void {
    this.eventHistory.get(runId)?.forEach((event) => this.safeNotify(listener, event));
    const listeners = this.listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => listeners.delete(listener);
  }

  private async finishRun(runId: string, prompt: string): Promise<void> {
    try {
      const finalResponse = await this.execute(prompt);
      const run = this.runs.get(runId);
      if (run?.status !== 'running') return;
      run.status = 'completed';
      run.finalResponse = finalResponse;
      this.emit(runId, { type: 'run.completed', finalResponse });
    } catch (cause) {
      const run = this.runs.get(runId);
      if (run?.status !== 'running') return;
      const error: CodexRunError = {
        code: 'MOCK_EXECUTION_FAILED',
        message: cause instanceof Error ? cause.message : 'Mock execution failed',
        retryable: false,
      };
      run.status = 'failed';
      run.error = error;
      this.emit(runId, { type: 'run.failed', error });
    }
  }

  private emit(
    runId: string,
    event:
      | { type: 'run.started' }
      | { type: 'run.progress'; stage: string }
      | { type: 'run.completed'; finalResponse: string }
      | { type: 'run.failed'; error: CodexRunError }
      | { type: 'run.cancelled' },
  ): void {
    const run = this.runs.get(runId);
    if (!run) throw new Error('CODEX_RUN_NOT_FOUND');
    const history = this.eventHistory.get(runId) ?? [];
    const eventPayload =
      event.type === 'run.failed' ? { ...event, error: Object.freeze({ ...event.error }) } : event;
    const recorded = Object.freeze({
      ...eventPayload,
      runId,
      threadId: run.threadId,
      sequence: history.length + 1,
      occurredAt: this.now(),
    }) as CodexRunEvent;
    history.push(recorded);
    this.eventHistory.set(runId, history);
    this.listeners.get(runId)?.forEach((listener) => this.safeNotify(listener, recorded));
  }

  private safeNotify(listener: (event: CodexRunEvent) => void, event: CodexRunEvent): void {
    try {
      listener(event);
    } catch {
      // Consumer failures must not corrupt adapter state or suppress later lifecycle events.
    }
  }

  private copyRun(run: CodexRun): CodexRun {
    const copy = { ...run };
    return run.error ? { ...copy, error: { ...run.error } } : copy;
  }
}

export {
  SdkCodexAdapter,
  createIsolatedCodexRuntime,
  findBundledCodexBinary,
  type SdkCodexAdapterOptions,
} from './sdk';
