import { MockCodexAdapter, type CodexRun } from '@codex-context-bridge/codex-adapter';
import type { CodexDestination } from '@codex-context-bridge/contracts';
import { openDatabase, type SqliteDatabase } from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { afterEach, describe, expect, it } from 'vitest';
import { ResponseRouter } from './index';

const NOW = '2026-07-18T12:00:00.000Z';
const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

async function waitForTerminal(adapter: MockCodexAdapter, runId: string): Promise<CodexRun> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = await adapter.getRun(runId);
    if (run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('TEST_RUN_DID_NOT_TERMINATE');
}

function setup(options: { adapter?: MockCodexAdapter; worktree?: boolean } = {}) {
  const database = openDatabase(':memory:');
  databases.push(database);
  const projects = new ProjectRegistry(database, () => NOW);
  projects.create('Bridge', 'project-1');
  const repository = projects.registerRepository(
    'project-1',
    {
      repoRoot: 'C:/work/bridge',
      gitRemote: 'https://github.com/example/bridge.git',
      projectName: 'Bridge',
      repositoryMarker: 'marker-1',
    },
    'repository-1',
  );
  const workflows = new WorkflowEngine(database, { now: () => NOW });
  const run = workflows.create({
    id: 'workflow-1',
    correlationId: 'correlation-1',
    projectId: 'project-1',
    idempotencyKey: 'workflow-key-1',
  });
  for (const state of [
    'project_resolving',
    'codex_running',
    'codex_completed',
    'building_context',
    'context_review_required',
    'context_approved',
    'sent_to_chatgpt',
  ] as const) {
    workflows.transition(run.id, { toState: state, eventType: `workflow.${state}`, actor: 'test' });
  }
  const adapter = options.adapter ?? new MockCodexAdapter({ now: () => NOW });
  const router = new ResponseRouter(database, workflows, projects, adapter, {
    now: () => NOW,
    ...(options.worktree
      ? {
          worktrees: {
            prepare: () =>
              Promise.resolve({
                workingDirectory: 'C:/work/bridge-feature',
                repositoryFingerprint: repository.fingerprint,
              }),
          },
        }
      : {}),
  });
  return { adapter, database, projects, repository, router, workflows };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: '1.0',
    handoffId: 'handoff-1',
    correlationId: 'correlation-1',
    projectId: 'project-1',
    status: 'ready_for_codex',
    analysisSummary: 'Ready.',
    codexPrompt: 'Implement the reviewed change.',
    attachmentsRequested: [],
    requiresUserDecision: false,
    ...overrides,
  };
}

function capture(router: ResponseRouter) {
  return router.captureResponse({
    workflowRunId: 'workflow-1',
    response: response(),
    expectedHandoffId: 'handoff-1',
    expectedCorrelationId: 'correlation-1',
    expectedProjectId: 'project-1',
  });
}

function prepared(
  router: ResponseRouter,
  destination: CodexDestination = { mode: 'new-thread', repositoryId: 'repository-1' },
) {
  const receipt = capture(router);
  const preview = router.createPreview(receipt.receiptId, destination);
  const approval = router.approve(preview, 60_000);
  const effect = router.prepare(
    preview,
    { id: approval.approval.id, token: approval.token },
    'codex-route-key-1',
  ).effect;
  return { effect, preview, receipt };
}

describe('response capture and preview', () => {
  it('persists one validated receipt and rejects identity mismatch or duplicate replay', () => {
    const { database, router, workflows } = setup();
    const receipt = capture(router);

    expect(workflows.getRun('workflow-1')?.state).toBe('codex_prompt_review_required');
    expect(
      database.prepare('SELECT handoff_id, status FROM chatgpt_response_receipts').get(),
    ).toEqual({
      handoff_id: 'handoff-1',
      status: 'captured',
    });
    expect(() =>
      router.captureResponse({
        workflowRunId: 'workflow-1',
        response: response(),
        expectedHandoffId: 'handoff-1',
        expectedCorrelationId: 'correlation-1',
        expectedProjectId: 'project-1',
      }),
    ).toThrow('DUPLICATE_RESPONSE');
    expect(receipt.response.codexPrompt).toBe('Implement the reviewed change.');

    const second = setup();
    expect(() =>
      second.router.captureResponse({
        workflowRunId: 'workflow-1',
        response: response({ projectId: 'project-2' }),
        expectedHandoffId: 'handoff-1',
        expectedCorrelationId: 'correlation-1',
        expectedProjectId: 'project-1',
      }),
    ).toThrow('PROJECT_ID_MISMATCH');
    expect(second.workflows.getRun('workflow-1')?.state).toBe('sent_to_chatgpt');
  });

  it('blocks cross-project destinations and preview mutation', () => {
    const { router } = setup();
    const receipt = capture(router);
    expect(() =>
      router.createPreview(receipt.receiptId, {
        mode: 'new-thread',
        repositoryId: 'missing-repository',
      }),
    ).toThrow('CODEX_REPOSITORY_PROJECT_MISMATCH');

    const preview = router.createPreview(receipt.receiptId, {
      mode: 'new-thread',
      repositoryId: 'repository-1',
    });
    expect(() => router.approve({ ...preview, codexPrompt: 'mutated prompt' }, 60_000)).toThrow(
      'CODEX_PREVIEW_INTEGRITY_INVALID',
    );
  });
});

describe('Codex routing', () => {
  it('creates, persists, and runs a new mock-only thread through the effect journal', async () => {
    const { adapter, database, projects, router, workflows } = setup();
    const { effect, preview } = prepared(router);

    const dispatched = await router.dispatch(preview, effect.id);
    expect(dispatched.effect.status).toBe('acknowledged');
    expect(projects.listCodexThreads('project-1')).toHaveLength(1);
    expect(database.prepare('SELECT status FROM chatgpt_response_receipts').get()).toEqual({
      status: 'routed',
    });
    await waitForTerminal(adapter, dispatched.run.id);
    expect(workflows.getRun('workflow-1')?.state).toBe('codex_completed');
  });

  it('resumes only a persisted thread with matching project and repository identity', async () => {
    const { adapter, projects, repository, router } = setup();
    const thread = await adapter.startThread({
      projectId: 'project-1',
      repositoryFingerprint: repository.fingerprint,
      workingDirectory: repository.canonicalRoot,
    });
    projects.registerCodexThread({
      id: 'mapping-1',
      projectId: 'project-1',
      repositoryFingerprint: repository.fingerprint,
      externalThreadId: thread.id,
    });
    const destination = { mode: 'existing-thread' as const, threadMappingId: 'mapping-1' };
    const { effect, preview } = prepared(router, destination);

    await expect(router.dispatch(preview, effect.id)).resolves.toMatchObject({
      thread: { id: thread.id, projectId: 'project-1' },
    });
  });

  it('uses an explicit worktree provider and rejects missing providers before approval', async () => {
    const withoutProvider = setup();
    const receipt = capture(withoutProvider.router);
    expect(() =>
      withoutProvider.router.createPreview(receipt.receiptId, {
        mode: 'new-worktree',
        repositoryId: 'repository-1',
        worktreeName: 'feature-safe',
      }),
    ).toThrow('CODEX_WORKTREE_PROVIDER_UNAVAILABLE');

    const withProvider = setup({ worktree: true });
    const destination = {
      mode: 'new-worktree' as const,
      repositoryId: 'repository-1',
      worktreeName: 'feature-safe',
    };
    const route = prepared(withProvider.router, destination);
    await expect(
      withProvider.router.dispatch(route.preview, route.effect.id),
    ).resolves.toMatchObject({
      thread: { workingDirectory: 'C:/work/bridge-feature' },
    });
  });

  it('leaves ambiguous adapter failure in confirmation-required state without retry', async () => {
    const adapter = new MockCodexAdapter({
      execute: () => Promise.resolve('not reached'),
    });
    const originalRunTurn = adapter.runTurn.bind(adapter);
    adapter.runTurn = () => Promise.reject(new Error('transport lost'));
    const { router, workflows } = setup({ adapter });
    const { effect, preview } = prepared(router);

    await expect(router.dispatch(preview, effect.id)).rejects.toThrow(
      'CODEX_DISPATCH_CONFIRMATION_REQUIRED',
    );
    expect(workflows.getEffect(effect.id)?.status).toBe('dispatching');
    await expect(router.dispatch(preview, effect.id)).rejects.toThrow(
      'CODEX_DISPATCH_CONFIRMATION_REQUIRED',
    );
    adapter.runTurn = originalRunTurn;
  });
});
