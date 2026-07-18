import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import {
  SdkCodexAdapter,
  type CodexRun,
  type CodexRunEvent,
} from '@codex-context-bridge/codex-adapter';

async function waitForTerminal(adapter: SdkCodexAdapter, runId: string): Promise<CodexRun> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const run = await adapter.getRun(runId);
    if (run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('CODEX_LIVE_RUN_TIMEOUT');
}

const repositoryRoot = process.cwd();
const markerPath = path.join(repositoryRoot, '.codex-context-bridge-read-only-proof');
if (existsSync(markerPath)) throw new Error('CODEX_LIVE_MARKER_PREEXISTS');

const adapter = new SdkCodexAdapter();
try {
  const thread = await adapter.startThread({
    projectId: 'live-spike-project',
    repositoryFingerprint: 'live-spike-repository',
    workingDirectory: repositoryRoot,
  });
  const firstRun = await adapter.runTurn(
    thread.id,
    'Read package.json only. Reply with exactly: CODEX_CONTEXT_BRIDGE_READ_ONLY_OK',
  );
  const firstEvents: CodexRunEvent[] = [];
  adapter.subscribe(firstRun.id, (event) => firstEvents.push(event));
  const first = await waitForTerminal(adapter, firstRun.id);
  if (first.finalResponse?.trim() !== 'CODEX_CONTEXT_BRIDGE_READ_ONLY_OK') {
    throw new Error('CODEX_LIVE_FIRST_RESPONSE_INVALID');
  }
  if (
    firstEvents[0]?.type !== 'run.started' ||
    firstEvents.at(-1)?.type !== 'run.completed' ||
    !firstEvents.some((event) => event.type === 'run.progress')
  ) {
    throw new Error('CODEX_LIVE_LIFECYCLE_INVALID');
  }

  const sandboxRun = await adapter.runTurn(
    thread.id,
    `Attempt to create the file ${markerPath}. If the read-only sandbox blocks it, reply with exactly: CODEX_CONTEXT_BRIDGE_SANDBOX_BLOCKED`,
  );
  const sandbox = await waitForTerminal(adapter, sandboxRun.id);
  if (
    sandbox.finalResponse?.trim() !== 'CODEX_CONTEXT_BRIDGE_SANDBOX_BLOCKED' ||
    existsSync(markerPath)
  ) {
    throw new Error('CODEX_LIVE_READ_ONLY_SANDBOX_INVALID');
  }

  const resumed = await adapter.resumeThread(thread.id);
  const resumedRun = await adapter.runTurn(
    resumed.id,
    'Reply with exactly: CODEX_CONTEXT_BRIDGE_RESUME_OK',
  );
  const second = await waitForTerminal(adapter, resumedRun.id);
  if (second.finalResponse?.trim() !== 'CODEX_CONTEXT_BRIDGE_RESUME_OK') {
    throw new Error('CODEX_LIVE_RESUME_RESPONSE_INVALID');
  }

  const cancelThread = await adapter.startThread({
    projectId: 'live-spike-project',
    repositoryFingerprint: 'live-spike-repository',
    workingDirectory: repositoryRoot,
  });
  const cancelRun = await adapter.runTurn(
    cancelThread.id,
    'Analyze the repository architecture in exhaustive detail before replying with CODEX_CONTEXT_BRIDGE_TOO_LATE.',
  );
  await adapter.cancelRun(cancelRun.id);
  const cancelled = await waitForTerminal(adapter, cancelRun.id);
  if (cancelled.status !== 'cancelled') throw new Error('CODEX_LIVE_CANCEL_INVALID');

  const invalidThread = await adapter.startThread({
    projectId: 'live-spike-project',
    repositoryFingerprint: 'live-spike-repository',
    workingDirectory: path.join(repositoryRoot, '.missing-codex-sdk-working-directory'),
  });
  let startFailure = '';
  try {
    await adapter.runTurn(invalidThread.id, 'This turn must not start.');
  } catch (error) {
    startFailure = error instanceof Error ? error.message : '';
  }
  if (startFailure !== 'CODEX_START_FAILED') {
    throw new Error('CODEX_LIVE_FAILURE_MAPPING_INVALID');
  }

  await new Promise<void>((resolve, reject) =>
    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'passed',
          threadId: thread.id,
          lifecycle: firstEvents.map((event) => event.type),
          readOnlySandbox: 'blocked',
          resume: second.status,
          cancellation: cancelled.status,
          failureMapping: startFailure,
        },
        null,
        2,
      )}\n`,
      (error) => (error ? reject(error) : resolve()),
    ),
  );
} finally {
  await adapter.dispose();
  if (existsSync(markerPath)) unlinkSync(markerPath);
}
