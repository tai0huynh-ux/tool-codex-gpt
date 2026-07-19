import type { ThreadEvent, ThreadOptions, TurnOptions } from '@openai/codex-sdk';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  it('requires a validator and selects workspace-write with network disabled only for the explicit profile', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'codex-workspace-profile-'));
    mkdirSync(path.join(root, 'nested'));
    const options: ThreadOptions[] = [];
    const validated: { projectId: string; fingerprint: string; root: string }[] = [];
    const adapter = new SdkCodexAdapter({
      createId: () => 'profile-run',
      createRuntime: runtime({
        startThread: (input) => {
          options.push(input ?? {});
          return eventThread([
            { type: 'thread.started', thread_id: 'profile-thread' },
            { type: 'turn.started' },
            {
              type: 'item.completed',
              item: { id: 'profile-message', type: 'agent_message', text: 'profile result' },
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
      validateWorkspaceWrite: (input) => {
        validated.push({
          projectId: input.projectId,
          fingerprint: input.repositoryFingerprint,
          root: input.canonicalRoot,
        });
      },
    });

    try {
      const thread = await adapter.startThread({
        projectId: 'project-profile',
        repositoryFingerprint: 'fingerprint-profile',
        workingDirectory: root,
        executionProfile: 'workspace_write_no_network',
      });
      await adapter.runTurn(thread.id, 'create the approved fixture');
      expect(options[0]).toMatchObject({
        approvalPolicy: 'never',
        networkAccessEnabled: false,
        sandboxMode: 'workspace-write',
        webSearchMode: 'disabled',
        workingDirectory: thread.workingDirectory,
      });
      expect(validated).toEqual([
        {
          projectId: 'project-profile',
          fingerprint: 'fingerprint-profile',
          root: thread.workingDirectory,
        },
      ]);
    } finally {
      await adapter.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for workspace-write without registry validation or with a non-directory root', async () => {
    const noValidator = new SdkCodexAdapter({
      createRuntime: runtime({
        startThread: () => eventThread([]),
        resumeThread: () => eventThread([]),
      }),
    });
    await expect(
      noValidator.startThread({
        ...startInput(),
        executionProfile: 'workspace_write_no_network',
      }),
    ).rejects.toThrow('CODEX_WORKSPACE_WRITE_VALIDATION_REQUIRED');
    await noValidator.dispose();

    const fileRoot = path.join(os.tmpdir(), `codex-workspace-file-${String(Date.now())}.txt`);
    writeFileSync(fileRoot, 'not a directory');
    const adapter = new SdkCodexAdapter({
      createRuntime: runtime({
        startThread: () => eventThread([]),
        resumeThread: () => eventThread([]),
      }),
      validateWorkspaceWrite: () => undefined,
    });
    try {
      await expect(
        adapter.startThread({
          ...startInput(),
          workingDirectory: fileRoot,
          executionProfile: 'workspace_write_no_network',
        }),
      ).rejects.toThrow('CODEX_WORKSPACE_ROOT_NOT_DIRECTORY');
    } finally {
      await adapter.dispose();
      rmSync(fileRoot, { force: true });
    }
  });

  it('blocks workspace-write when the canonical root, project, or fingerprint escapes registration', async () => {
    const registeredRoot = mkdtempSync(path.join(os.tmpdir(), 'codex-registered-root-'));
    const outsideRoot = mkdtempSync(path.join(os.tmpdir(), 'codex-outside-root-'));
    const adapter = new SdkCodexAdapter({
      createRuntime: runtime({
        startThread: () => eventThread([]),
        resumeThread: () => eventThread([]),
      }),
      validateWorkspaceWrite: (input) => {
        if (
          input.canonicalRoot !== path.resolve(registeredRoot) ||
          input.projectId !== 'registered-project' ||
          input.repositoryFingerprint !== 'registered-fingerprint'
        ) {
          throw new Error('CODEX_WORKSPACE_IDENTITY_MISMATCH');
        }
      },
    });
    try {
      await expect(
        adapter.startThread({
          projectId: 'registered-project',
          repositoryFingerprint: 'registered-fingerprint',
          workingDirectory: outsideRoot,
          executionProfile: 'workspace_write_no_network',
        }),
      ).rejects.toThrow('CODEX_WORKSPACE_IDENTITY_MISMATCH');
    } finally {
      await adapter.dispose();
      rmSync(registeredRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

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
