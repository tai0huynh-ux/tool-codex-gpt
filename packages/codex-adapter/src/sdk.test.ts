import type { ThreadEvent, ThreadOptions, TurnOptions } from '@openai/codex-sdk';
import { describe, expect, it } from 'vitest';
import type { CodexRun, CodexRunEvent } from './index';
import { SdkCodexAdapter } from './sdk';

interface FakeThread {
  runStreamed(
    input: string,
    options?: TurnOptions,
  ): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
}

function eventThread(events: ThreadEvent[]): FakeThread {
  return {
    runStreamed: () =>
      Promise.resolve({
        events: (async function* () {
          await Promise.resolve();
          for (const event of events) yield event;
        })(),
      }),
  };
}

function runtime(client: {
  startThread(options?: ThreadOptions): FakeThread;
  resumeThread(id: string, options?: ThreadOptions): FakeThread;
}) {
  return () => Promise.resolve({ client, dispose: () => Promise.resolve() });
}

async function waitForTerminal(adapter: SdkCodexAdapter, runId: string): Promise<CodexRun> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const run = await adapter.getRun(runId);
    if (run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('TEST_RUN_DID_NOT_TERMINATE');
}

function startInput() {
  return {
    projectId: 'project-1',
    repositoryFingerprint: 'fingerprint-1',
    workingDirectory: process.cwd(),
  };
}

describe('SdkCodexAdapter', () => {
  it('maps structured SDK events and replaces the provisional thread ID', async () => {
    const options: ThreadOptions[] = [];
    const adapter = new SdkCodexAdapter({
      createId: () => 'local-id',
      createRuntime: runtime({
        startThread: (input) => {
          options.push(input ?? {});
          return eventThread([
            { type: 'thread.started', thread_id: 'sdk-thread-1' },
            { type: 'turn.started' },
            {
              type: 'item.completed',
              item: { id: 'message-1', type: 'agent_message', text: 'live result' },
            },
            {
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0,
              },
            },
          ]);
        },
        resumeThread: () => eventThread([]),
      }),
      now: () => '2026-07-18T13:30:00.000Z',
    });
    const thread = await adapter.startThread(startInput());
    const run = await adapter.runTurn(thread.id, 'read package.json');
    const completed = await waitForTerminal(adapter, run.id);
    const events: CodexRunEvent[] = [];
    adapter.subscribe(run.id, (event) => events.push(event));

    expect(thread.id).toBe('sdk-thread-1');
    expect(completed).toMatchObject({
      threadId: 'sdk-thread-1',
      status: 'completed',
      finalResponse: 'live result',
    });
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'run.progress',
      'run.progress',
      'run.completed',
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(options[0]).toMatchObject({
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      sandboxMode: 'read-only',
      webSearchMode: 'disabled',
    });
    await adapter.dispose();
  });

  it('resumes a persisted SDK thread through a trusted identity resolver', async () => {
    const resumed: string[] = [];
    const adapter = new SdkCodexAdapter({
      createId: () => 'run-1',
      createRuntime: runtime({
        startThread: () => eventThread([]),
        resumeThread: (id) => {
          resumed.push(id);
          return eventThread([
            { type: 'thread.started', thread_id: id },
            { type: 'turn.started' },
            {
              type: 'item.completed',
              item: { id: 'message-2', type: 'agent_message', text: 'resumed result' },
            },
            {
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0,
              },
            },
          ]);
        },
      }),
      resolveThread: (id) => (id === 'persisted-1' ? startInput() : undefined),
    });

    const thread = await adapter.resumeThread('persisted-1');
    const run = await adapter.runTurn(thread.id, 'resume');
    expect((await waitForTerminal(adapter, run.id)).finalResponse).toBe('resumed result');
    expect(resumed).toEqual(['persisted-1']);
    await adapter.dispose();
  });

  it('aborts a live SDK process and prevents late terminal overwrite', async () => {
    const adapter = new SdkCodexAdapter({
      createId: (() => {
        const ids = ['thread-local', 'run-cancel'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      createRuntime: runtime({
        startThread: () => ({
          runStreamed: (_input, options) =>
            Promise.resolve({
              events: (async function* () {
                yield { type: 'thread.started', thread_id: 'sdk-cancel' };
                yield { type: 'turn.started' };
                await new Promise<void>((_resolve, reject) => {
                  options?.signal?.addEventListener('abort', () =>
                    reject(new DOMException('Aborted', 'AbortError')),
                  );
                });
              })(),
            }),
        }),
        resumeThread: () => eventThread([]),
      }),
    });
    const thread = await adapter.startThread(startInput());
    const run = await adapter.runTurn(thread.id, 'cancel');
    const events: CodexRunEvent[] = [];
    adapter.subscribe(run.id, (event) => events.push(event));

    await adapter.cancelRun(run.id);
    await adapter.cancelRun(run.id);
    await new Promise((resolve) => setTimeout(resolve, 1));

    expect(await adapter.getRun(run.id)).toMatchObject({ status: 'cancelled' });
    expect(events.at(-1)?.type).toBe('run.cancelled');
    expect(events.some((event) => event.type === 'run.failed')).toBe(false);
    await adapter.dispose();
  });

  it('waits for cancelled child work before disposing the isolated runtime', async () => {
    const lifecycle: string[] = [];
    const adapter = new SdkCodexAdapter({
      createId: (() => {
        const ids = ['thread-local', 'run-cancel'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      createRuntime: () =>
        Promise.resolve({
          client: {
            startThread: () => ({
              runStreamed: (_input, options) =>
                Promise.resolve({
                  events: (async function* () {
                    yield { type: 'thread.started', thread_id: 'sdk-cancel' };
                    await new Promise<void>((resolve) => {
                      options?.signal?.addEventListener('abort', () =>
                        setTimeout(() => {
                          lifecycle.push('child-stopped');
                          resolve();
                        }, 5),
                      );
                    });
                  })(),
                }),
            }),
            resumeThread: () => eventThread([]),
          },
          dispose: () => {
            lifecycle.push('runtime-disposed');
            return Promise.resolve();
          },
        }),
    });
    const thread = await adapter.startThread(startInput());
    await adapter.runTurn(thread.id, 'cancel during disposal');

    await adapter.dispose();

    expect(lifecycle).toEqual(['child-stopped', 'runtime-disposed']);
  });

  it('maps SDK failures to bounded redacted errors', async () => {
    const adapter = new SdkCodexAdapter({
      createId: (() => {
        const ids = ['thread-local', 'run-failed'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      createRuntime: runtime({
        startThread: () =>
          eventThread([
            { type: 'thread.started', thread_id: 'sdk-failed' },
            { type: 'turn.started' },
            { type: 'turn.failed', error: { message: 'C:\\Users\\private\\secret' } },
          ]),
        resumeThread: () => eventThread([]),
      }),
    });
    const thread = await adapter.startThread(startInput());
    const run = await adapter.runTurn(thread.id, 'fail');
    const failed = await waitForTerminal(adapter, run.id);

    expect(failed).toMatchObject({
      status: 'failed',
      error: {
        code: 'CODEX_TURN_FAILED',
        message: 'Codex could not complete the requested turn.',
        retryable: false,
      },
    });
    expect(JSON.stringify(failed)).not.toContain('private');
    await adapter.dispose();
  });

  it('rejects startup failures without exposing the external configuration path', async () => {
    const adapter = new SdkCodexAdapter({
      createId: (() => {
        const ids = ['thread-local', 'run-start-failed'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      createRuntime: runtime({
        startThread: () => ({
          runStreamed: () =>
            Promise.reject(
              new Error('failed to parse model_catalog_json at C:\\Users\\private\\models.json'),
            ),
        }),
        resumeThread: () => eventThread([]),
      }),
    });
    const thread = await adapter.startThread(startInput());

    await expect(adapter.runTurn(thread.id, 'fail before start')).rejects.toThrow(
      'CODEX_CONFIGURATION_INVALID',
    );
    await adapter.dispose();
  });
});
