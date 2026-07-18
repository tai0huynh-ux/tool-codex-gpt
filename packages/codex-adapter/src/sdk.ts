import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { ThreadEvent, ThreadOptions, TurnOptions } from '@openai/codex-sdk';
import type {
  CodexAdapter,
  CodexRun,
  CodexRunError,
  CodexRunEvent,
  CodexThread,
  StartThreadInput,
} from './index';

const execFileAsync = promisify(execFile);
const MAX_ERROR_MESSAGE_LENGTH = 240;

interface SdkThreadLike {
  runStreamed(
    input: string,
    options?: TurnOptions,
  ): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
}

interface SdkClientLike {
  startThread(options?: ThreadOptions): SdkThreadLike;
  resumeThread(id: string, options?: ThreadOptions): SdkThreadLike;
}

interface SdkRuntime {
  client: SdkClientLike;
  dispose(): Promise<void>;
}

class BundledCodexThread implements SdkThreadLike {
  public constructor(
    private readonly binary: string,
    private readonly catalogPath: string,
    private readonly options: ThreadOptions,
    private threadId?: string,
  ) {}

  public runStreamed(
    input: string,
    options: TurnOptions = {},
  ): Promise<{ events: AsyncGenerator<ThreadEvent> }> {
    return Promise.resolve({ events: this.stream(input, options.signal) });
  }

  private async *stream(input: string, signal?: AbortSignal): AsyncGenerator<ThreadEvent> {
    const args = ['exec', '--experimental-json'];
    args.push('--config', `model_catalog_json=${JSON.stringify(this.catalogPath)}`);
    if (this.options.sandboxMode) args.push('--sandbox', this.options.sandboxMode);
    if (this.options.workingDirectory) args.push('--cd', this.options.workingDirectory);
    if (this.options.skipGitRepoCheck) args.push('--skip-git-repo-check');
    if (this.options.networkAccessEnabled !== undefined) {
      args.push(
        '--config',
        `sandbox_workspace_write.network_access=${String(this.options.networkAccessEnabled)}`,
      );
    }
    if (this.options.webSearchMode) {
      args.push('--config', `web_search=${JSON.stringify(this.options.webSearchMode)}`);
    }
    if (this.options.approvalPolicy) {
      args.push('--config', `approval_policy=${JSON.stringify(this.options.approvalPolicy)}`);
    }
    if (this.threadId) args.push('resume', this.threadId);

    const child = spawn(this.binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let aborted = signal?.aborted ?? false;
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4_096);
    });
    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        let settled = false;
        const settle = (code: number | null, exitSignal: NodeJS.Signals | null): void => {
          if (settled) return;
          settled = true;
          resolve({ code, signal: exitSignal });
        };
        child.once('exit', settle);
        child.once('close', settle);
        child.once('error', () => settle(null, null));
      },
    );
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const abort = (): void => {
      aborted = true;
      child.stdin.destroy();
      lines.close();
      child.stdout.destroy();
      child.stderr.destroy();
      child.kill();
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (aborted) abort();
    else child.stdin.end(input);

    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ThreadEvent;
        if (event.type === 'thread.started') this.threadId = event.thread_id;
        yield event;
      }
      const result = await exitPromise;
      if (aborted) throw new DOMException('Codex turn cancelled.', 'AbortError');
      if (result.code !== 0 || result.signal) {
        throw new Error(`CODEX_EXEC_FAILED:${stderr}`);
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      lines.close();
      child.kill();
      await exitPromise;
    }
  }
}

class BundledCodexClient implements SdkClientLike {
  public constructor(
    private readonly binary: string,
    private readonly catalogPath: string,
  ) {}

  public startThread(options: ThreadOptions = {}): SdkThreadLike {
    return new BundledCodexThread(this.binary, this.catalogPath, options);
  }

  public resumeThread(id: string, options: ThreadOptions = {}): SdkThreadLike {
    return new BundledCodexThread(this.binary, this.catalogPath, options, id);
  }
}

interface ThreadRecord {
  metadata: CodexThread;
  sdkThread?: SdkThreadLike;
  resume: boolean;
}

interface RunRecord {
  run: CodexRun;
  abortController: AbortController;
  task?: Promise<void>;
}

export interface SdkCodexAdapterOptions {
  createRuntime?: () => Promise<SdkRuntime>;
  resolveThread?: (
    threadId: string,
  ) => Promise<StartThreadInput | undefined> | StartThreadInput | undefined;
  now?: () => string;
  createId?: () => string;
}

function platformTarget(): { packageName: string; triple: string; binaryName: string } {
  const key = `${process.platform}-${process.arch}`;
  const targets: Record<string, { packageName: string; triple: string }> = {
    'darwin-arm64': {
      packageName: '@openai/codex-darwin-arm64',
      triple: 'aarch64-apple-darwin',
    },
    'darwin-x64': {
      packageName: '@openai/codex-darwin-x64',
      triple: 'x86_64-apple-darwin',
    },
    'linux-arm64': {
      packageName: '@openai/codex-linux-arm64',
      triple: 'aarch64-unknown-linux-musl',
    },
    'linux-x64': {
      packageName: '@openai/codex-linux-x64',
      triple: 'x86_64-unknown-linux-musl',
    },
    'win32-arm64': {
      packageName: '@openai/codex-win32-arm64',
      triple: 'aarch64-pc-windows-msvc',
    },
    'win32-x64': {
      packageName: '@openai/codex-win32-x64',
      triple: 'x86_64-pc-windows-msvc',
    },
  };
  const target = targets[key];
  if (!target) throw new Error('CODEX_PLATFORM_UNSUPPORTED');
  return {
    ...target,
    binaryName: process.platform === 'win32' ? 'codex.exe' : 'codex',
  };
}

export function findBundledCodexBinary(): string {
  const sdkEntry = fileURLToPath(import.meta.resolve('@openai/codex-sdk'));
  const sdkRequire = createRequire(sdkEntry);
  const codexPackage = sdkRequire.resolve('@openai/codex/package.json');
  const codexRequire = createRequire(codexPackage);
  const target = platformTarget();
  const platformPackage = codexRequire.resolve(`${target.packageName}/package.json`);
  return path.join(
    path.dirname(platformPackage),
    'vendor',
    target.triple,
    'bin',
    target.binaryName,
  );
}

export async function createIsolatedCodexRuntime(): Promise<SdkRuntime> {
  const binary = findBundledCodexBinary();
  const { stdout } = await execFileAsync(binary, ['debug', 'models', '--bundled'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const catalog = JSON.parse(stdout) as { models?: unknown };
  if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
    throw new Error('CODEX_BUNDLED_CATALOG_INVALID');
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-context-bridge-sdk-'));
  const catalogPath = path.join(temporaryRoot, 'models.json');
  await mkdir(temporaryRoot, { recursive: true });
  await writeFile(catalogPath, stdout, { encoding: 'utf8', mode: 0o600 });
  const client = new BundledCodexClient(binary, catalogPath);
  return {
    client,
    dispose: async () =>
      rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  };
}

function createDeferred(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function safeError(cause: unknown, phase: 'start' | 'turn'): CodexRunError {
  const raw = cause instanceof Error ? cause.message : '';
  const configuration = raw.includes('model_catalog_json') || raw.includes('config');
  return {
    code: configuration
      ? 'CODEX_CONFIGURATION_INVALID'
      : phase === 'start'
        ? 'CODEX_START_FAILED'
        : 'CODEX_TURN_FAILED',
    message: configuration
      ? 'Codex configuration is incompatible with the bundled SDK runtime.'
      : phase === 'start'
        ? 'Codex could not start the requested thread.'
        : 'Codex could not complete the requested turn.',
    retryable: false,
  };
}

export class SdkCodexAdapter implements CodexAdapter {
  private readonly threads = new Map<string, ThreadRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly eventHistory = new Map<string, CodexRunEvent[]>();
  private readonly listeners = new Map<string, Set<(event: CodexRunEvent) => void>>();
  private readonly runtime: Promise<SdkRuntime>;
  private readonly resolveThreadIdentity?: SdkCodexAdapterOptions['resolveThread'];
  private readonly now: () => string;
  private readonly createId: () => string;

  public constructor(options: SdkCodexAdapterOptions = {}) {
    this.runtime = (options.createRuntime ?? createIsolatedCodexRuntime)();
    this.resolveThreadIdentity = options.resolveThread;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? randomUUID;
  }

  public startThread(input: StartThreadInput): Promise<CodexThread> {
    const metadata: CodexThread = {
      ...input,
      id: this.createId(),
      workingDirectory: path.resolve(input.workingDirectory),
    };
    this.threads.set(metadata.id, { metadata, resume: false });
    return Promise.resolve(metadata);
  }

  public async resumeThread(threadId: string): Promise<CodexThread> {
    const existing = this.threads.get(threadId);
    if (existing) return existing.metadata;
    const identity = await this.resolveThreadIdentity?.(threadId);
    if (!identity) throw new Error('CODEX_THREAD_NOT_FOUND');
    const metadata: CodexThread = {
      ...identity,
      id: threadId,
      workingDirectory: path.resolve(identity.workingDirectory),
    };
    this.threads.set(threadId, { metadata, resume: true });
    return metadata;
  }

  public async runTurn(threadId: string, prompt: string): Promise<CodexRun> {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error('CODEX_THREAD_NOT_FOUND');
    const run: CodexRun = { id: this.createId(), threadId, status: 'running' };
    const record: RunRecord = {
      run,
      abortController: new AbortController(),
    };
    this.runs.set(run.id, record);
    const started = createDeferred();
    record.task = this.consumeRun(threadId, thread, record, prompt, started);
    await started.promise;
    return this.copyRun(run);
  }

  public getRun(runId: string): Promise<CodexRun> {
    const record = this.runs.get(runId);
    return record
      ? Promise.resolve(this.copyRun(record.run))
      : Promise.reject(new Error('CODEX_RUN_NOT_FOUND'));
  }

  public cancelRun(runId: string): Promise<void> {
    const record = this.runs.get(runId);
    if (!record) return Promise.reject(new Error('CODEX_RUN_NOT_FOUND'));
    if (record.run.status === 'cancelled') return Promise.resolve();
    if (record.run.status !== 'running') {
      return Promise.reject(new Error('CODEX_RUN_TERMINAL'));
    }
    record.run.status = 'cancelled';
    record.abortController.abort();
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

  public async dispose(): Promise<void> {
    for (const record of this.runs.values()) {
      if (record.run.status === 'running') {
        record.run.status = 'cancelled';
        record.abortController.abort();
        this.emit(record.run.id, { type: 'run.cancelled' });
      }
    }
    await Promise.allSettled(
      [...this.runs.values()].flatMap((record) => (record.task ? [record.task] : [])),
    );
    await (await this.runtime).dispose();
  }

  private async consumeRun(
    lookupThreadId: string,
    thread: ThreadRecord,
    record: RunRecord,
    prompt: string,
    started: ReturnType<typeof createDeferred>,
  ): Promise<void> {
    let lifecycleStarted = false;
    let finalResponse = '';
    try {
      const runtime = await this.runtime;
      const options: ThreadOptions = {
        approvalPolicy: 'never',
        networkAccessEnabled: false,
        sandboxMode: 'read-only',
        skipGitRepoCheck: false,
        webSearchMode: 'disabled',
        workingDirectory: thread.metadata.workingDirectory,
      };
      thread.sdkThread ??= thread.resume
        ? runtime.client.resumeThread(thread.metadata.id, options)
        : runtime.client.startThread(options);
      const { events } = await thread.sdkThread.runStreamed(prompt, {
        signal: record.abortController.signal,
      });
      for await (const event of events) {
        if (record.run.status !== 'running') return;
        if (event.type === 'thread.started') {
          this.rekeyThread(lookupThreadId, event.thread_id, thread);
          record.run.threadId = event.thread_id;
          lifecycleStarted = true;
          this.emit(record.run.id, { type: 'run.started' });
          started.resolve();
          await Promise.resolve();
        } else if (event.type === 'turn.started') {
          this.emit(record.run.id, { type: 'run.progress', stage: 'codex.turn.started' });
        } else if (event.type === 'item.completed') {
          if (event.item.type === 'agent_message') finalResponse = event.item.text;
          this.emit(record.run.id, {
            type: 'run.progress',
            stage: `codex.item.${event.item.type}.completed`,
          });
        } else if (event.type === 'turn.completed') {
          record.run.status = 'completed';
          record.run.finalResponse = finalResponse;
          this.emit(record.run.id, { type: 'run.completed', finalResponse });
          return;
        } else if (event.type === 'turn.failed' || event.type === 'error') {
          const error = safeError(event, lifecycleStarted ? 'turn' : 'start');
          this.failRun(record.run.id, error);
          if (!lifecycleStarted) started.reject(new Error(error.code));
          return;
        }
      }
      if (record.run.status === 'running') {
        const error = safeError(undefined, lifecycleStarted ? 'turn' : 'start');
        this.failRun(record.run.id, error);
        if (!lifecycleStarted) started.reject(new Error(error.code));
      }
    } catch (cause) {
      if (record.run.status === 'cancelled') return;
      const error = safeError(cause, lifecycleStarted ? 'turn' : 'start');
      this.failRun(record.run.id, error);
      if (!lifecycleStarted) started.reject(new Error(error.code));
    }
  }

  private rekeyThread(oldId: string, newId: string, thread: ThreadRecord): void {
    thread.metadata.id = newId;
    thread.resume = true;
    this.threads.delete(oldId);
    this.threads.set(newId, thread);
  }

  private failRun(runId: string, error: CodexRunError): void {
    const record = this.runs.get(runId);
    if (record?.run.status !== 'running') return;
    record.run.status = 'failed';
    record.run.error = {
      ...error,
      message: error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    };
    this.emit(runId, { type: 'run.failed', error: record.run.error });
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
    const record = this.runs.get(runId);
    if (!record) throw new Error('CODEX_RUN_NOT_FOUND');
    const history = this.eventHistory.get(runId) ?? [];
    const recorded = Object.freeze({
      ...event,
      runId,
      threadId: record.run.threadId,
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
      // Consumer failures cannot alter the SDK lifecycle projection.
    }
  }

  private copyRun(run: CodexRun): CodexRun {
    const copy = { ...run };
    return run.error ? { ...copy, error: { ...run.error } } : copy;
  }
}
