import { randomUUID } from 'node:crypto';

export interface StartThreadInput {
  projectId: string;
  repositoryFingerprint: string;
  workingDirectory: string;
}

export interface CodexThread {
  id: string;
  projectId: string;
  repositoryFingerprint: string;
}

export interface CodexRun {
  id: string;
  threadId: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  finalResponse?: string;
}

export type CodexRunEvent =
  | { type: 'run.started'; runId: string; threadId: string }
  | { type: 'run.completed'; runId: string; finalResponse: string }
  | { type: 'run.cancelled'; runId: string };

export interface CodexAdapter {
  startThread(input: StartThreadInput): Promise<CodexThread>;
  resumeThread(threadId: string): Promise<CodexThread>;
  runTurn(threadId: string, prompt: string): Promise<CodexRun>;
  cancelRun(runId: string): Promise<void>;
  subscribe(runId: string, listener: (event: CodexRunEvent) => void): () => void;
}

export class MockCodexAdapter implements CodexAdapter {
  private readonly threads = new Map<string, CodexThread>();
  private readonly runs = new Map<string, CodexRun>();
  private readonly listeners = new Map<string, Set<(event: CodexRunEvent) => void>>();

  public startThread(input: StartThreadInput): Promise<CodexThread> {
    const thread = { id: randomUUID(), ...input };
    this.threads.set(thread.id, thread);
    return Promise.resolve(thread);
  }

  public resumeThread(threadId: string): Promise<CodexThread> {
    const thread = this.threads.get(threadId);
    return thread ? Promise.resolve(thread) : Promise.reject(new Error('CODEX_THREAD_NOT_FOUND'));
  }

  public async runTurn(threadId: string, prompt: string): Promise<CodexRun> {
    await this.resumeThread(threadId);
    const runId = randomUUID();
    const finalResponse = `MOCK_ONLY:${prompt}`;
    this.emit(runId, { type: 'run.started', runId, threadId });
    const run: CodexRun = {
      id: runId,
      threadId,
      status: 'completed',
      finalResponse,
    };
    this.runs.set(runId, run);
    this.emit(runId, { type: 'run.completed', runId, finalResponse });
    return run;
  }

  public cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return Promise.reject(new Error('CODEX_RUN_NOT_FOUND'));
    run.status = 'cancelled';
    this.emit(runId, { type: 'run.cancelled', runId });
    return Promise.resolve();
  }

  public subscribe(runId: string, listener: (event: CodexRunEvent) => void): () => void {
    const listeners = this.listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => listeners.delete(listener);
  }

  private emit(runId: string, event: CodexRunEvent): void {
    this.listeners.get(runId)?.forEach((listener) => listener(event));
  }
}
