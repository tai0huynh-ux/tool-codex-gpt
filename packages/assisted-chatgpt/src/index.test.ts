import { openDatabase, type SqliteDatabase } from '@codex-context-bridge/database';
import type { ChatGptPageInspection } from '@codex-context-bridge/contracts';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AssistedChatGptService,
  type AssistedChatGptAdapter,
  type CreateAssistedPreviewInput,
} from './index';

const NOW = '2026-07-18T11:00:00.000Z';
const SNAPSHOT_HASH = 'd'.repeat(64);
const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function setup() {
  const database = openDatabase(':memory:');
  databases.push(database);
  database
    .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('project-1', 'Bridge', NOW, NOW);
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
  ] as const) {
    workflows.transition(run.id, {
      toState: state,
      eventType: `workflow.${state}`,
      actor: 'test',
    });
  }
  return {
    database,
    workflows,
    service: new AssistedChatGptService(workflows, { now: () => NOW }),
  };
}

function previewInput(
  destination: 'existing' | 'new' = 'existing',
  overrides: Partial<CreateAssistedPreviewInput> = {},
): CreateAssistedPreviewInput {
  return {
    workflowRunId: 'workflow-1',
    handoff: {
      protocolVersion: '1.0',
      handoffId: 'handoff-1',
      correlationId: 'correlation-1',
      source: 'codex',
      target: 'chatgpt',
      project: { id: 'project-1', name: 'Bridge', confidence: 0.95 },
      destination:
        destination === 'existing'
          ? { mode: 'existing-thread', conversationId: 'conversation-1' }
          : { mode: 'new-thread' },
      objective: 'Review the verified implementation.',
      userInstructions: ['Return a structured response.'],
      constraints: ['Do not invent live evidence.'],
      currentState: 'Context pack reviewed.',
      completedWork: ['Workflow persistence complete.'],
      unresolvedIssues: [],
      attachments: [],
      expectedResponse: { type: 'analysis-and-codex-prompt', schemaVersion: '1.0' },
      createdAt: NOW,
    },
    contextPack: {
      protocolVersion: '1.0',
      id: 'pack-1',
      createdAt: NOW,
      objective: 'Review the verified implementation.',
      project: {
        id: 'project-1',
        name: 'Bridge',
        repositoryRoot: 'C:/work/bridge',
        confidence: 0.95,
      },
      repositoryEvidence: [],
      codexFinalResponse: 'Implemented and tested.',
      completedWork: ['Added workflow recovery.'],
      changedFiles: ['packages/workflow-engine/src/index.ts'],
      gitDiffSummary: '1 file changed',
      verificationResults: [{ command: 'pnpm test', status: 'passed', summary: 'pass' }],
      knownFailures: [],
      openQuestions: [],
      relevantMemories: [],
      attachments: [],
      attachmentManifest: [],
      budget: {
        profile: {
          maxFiles: 10,
          maxTotalBytes: 10_000,
          maxSingleFileBytes: 5_000,
          maxEstimatedTokens: 2_500,
          preferFullFilesBelow: 1_000,
          excerptLineWindow: 20,
        },
        usedFiles: 0,
        totalBytes: 0,
        estimatedTokens: 0,
      },
      expectedChatGptResponse: {
        type: 'analysis-and-codex-prompt',
        schemaVersion: '1.0',
      },
    },
    ...overrides,
  };
}

class FakeAdapter implements AssistedChatGptAdapter {
  public inspection: ChatGptPageInspection = {
    page: { mode: 'existing' as const, conversationId: 'conversation-1' },
    composer: { available: true, readOnly: false },
  };
  public insertCount = 0;
  public copyCount = 0;
  public clearCount = 0;
  public inserted = true;
  public insertedHash: string | undefined;
  public copyError: Error | undefined;
  public clearResult = true;
  public streaming = false;
  public messages: { role: string; text: string }[] = [];

  public inspect() {
    return Promise.resolve(this.inspection);
  }

  public insert(input: { payloadHash: string }) {
    this.insertCount += 1;
    return Promise.resolve({
      inserted: this.inserted,
      ...(this.inserted ? { textHash: this.insertedHash ?? input.payloadHash } : {}),
    });
  }

  public copyToClipboard() {
    this.copyCount += 1;
    return this.copyError ? Promise.reject(this.copyError) : Promise.resolve();
  }

  public clearComposer() {
    this.clearCount += 1;
    return Promise.resolve(this.clearResult);
  }

  public isStreaming() {
    return Promise.resolve(this.streaming);
  }

  public capture() {
    return Promise.resolve({
      title: 'Bridge conversation',
      messages: this.messages,
      contentHash: SNAPSHOT_HASH,
      capturedAt: NOW,
    });
  }
}

function approvedEffect(
  service: AssistedChatGptService,
  destination: 'existing' | 'new' = 'existing',
) {
  const preview = service.createPreview(previewInput(destination));
  const approval = service.approve(preview, 60_000);
  const prepared = service.prepare(
    preview,
    { id: approval.approval.id, token: approval.token },
    'chatgpt-effect-key-1',
  );
  return { preview, approval, effect: prepared.effect };
}

describe('assisted ChatGPT preview and approval', () => {
  it('renders a deterministic reviewed preview for existing and new destinations', () => {
    const { service } = setup();
    const existing = service.createPreview(previewInput('existing'));
    const repeated = service.createPreview(previewInput('existing'));
    const created = service.createPreview(previewInput('new'));

    expect(existing).toMatchObject({
      destination: { mode: 'existing', conversationId: 'conversation-1' },
      projectId: 'project-1',
      handoffId: 'handoff-1',
      characterCount: existing.text.length,
    });
    expect(existing.text).toContain('<CONTEXT_BRIDGE_HANDOFF>');
    expect(existing.textHash).toBe(repeated.textHash);
    expect(created.destination).toEqual({ mode: 'new' });
  });

  it('blocks cross-project, low-confidence, and Codex-targeted previews', () => {
    const { service } = setup();
    const lowConfidence = previewInput();
    lowConfidence.handoff.project.confidence = 0.59;
    expect(() => service.createPreview(lowConfidence)).toThrow(
      'CHATGPT_PREVIEW_CONFIDENCE_BLOCKED',
    );

    const wrongProject = previewInput();
    wrongProject.contextPack.project.id = 'project-2';
    expect(() => service.createPreview(wrongProject)).toThrow('CHATGPT_PREVIEW_PROJECT_MISMATCH');

    const wrongTarget = previewInput();
    wrongTarget.handoff.target = 'codex';
    expect(() => service.createPreview(wrongTarget)).toThrow('CHATGPT_HANDOFF_TARGET_INVALID');
  });

  it('rejects preview mutation after review before approval or clipboard transfer', () => {
    const { service } = setup();
    const preview = service.createPreview(previewInput());
    const mutated = {
      ...preview,
      text: `${preview.text}\nmutated`,
      characterCount: preview.text.length + 8,
    };

    expect(() => service.approve(mutated, 60_000)).toThrow('CHATGPT_PREVIEW_INTEGRITY_INVALID');
  });
});

describe('assisted dispatch', () => {
  it('inserts once, never submits, and does not reinsert a dispatching effect', async () => {
    const { service } = setup();
    const { preview, effect } = approvedEffect(service);
    const adapter = new FakeAdapter();

    await expect(service.dispatch(preview, effect.id, 'composer', adapter)).resolves.toMatchObject({
      status: 'awaiting_user_send',
      method: 'composer',
      effect: { status: 'dispatching' },
    });
    await expect(service.dispatch(preview, effect.id, 'composer', adapter)).resolves.toMatchObject({
      status: 'confirmation_required',
    });
    expect(adapter.insertCount).toBe(1);
  });

  it('rejects the wrong existing conversation before crossing the effect boundary', async () => {
    const { service, workflows } = setup();
    const { preview, effect } = approvedEffect(service);
    const adapter = new FakeAdapter();
    adapter.inspection = {
      page: { mode: 'existing', conversationId: 'conversation-2' },
      composer: { available: true, readOnly: false },
    };

    await expect(service.dispatch(preview, effect.id, 'composer', adapter)).rejects.toThrow(
      'CHATGPT_DESTINATION_MISMATCH',
    );
    expect(workflows.getEffect(effect.id)?.status).toBe('prepared');
    expect(adapter.insertCount).toBe(0);
  });

  it('supports an explicit clipboard fallback and preserves ambiguous failures', async () => {
    const { service, workflows } = setup();
    const { preview, effect } = approvedEffect(service, 'new');
    const adapter = new FakeAdapter();
    adapter.inspection = {
      page: { mode: 'new' },
      composer: { available: false, readOnly: false },
    };

    await expect(service.dispatch(preview, effect.id, 'clipboard', adapter)).resolves.toMatchObject(
      {
        status: 'awaiting_user_send',
        method: 'clipboard',
      },
    );
    expect(adapter.copyCount).toBe(1);
    expect(workflows.getEffect(effect.id)?.status).toBe('dispatching');

    const secondSetup = setup();
    const second = approvedEffect(secondSetup.service, 'new');
    const failingAdapter = new FakeAdapter();
    failingAdapter.inspection = adapter.inspection;
    failingAdapter.copyError = new Error('clipboard uncertain');
    await expect(
      secondSetup.service.dispatch(second.preview, second.effect.id, 'clipboard', failingAdapter),
    ).rejects.toThrow('CHATGPT_DISPATCH_CONFIRMATION_REQUIRED');
    expect(secondSetup.workflows.getEffect(second.effect.id)?.status).toBe('dispatching');
  });

  it('fails definitively rejected or hash-mismatched composer insertion', async () => {
    const first = setup();
    const rejected = approvedEffect(first.service);
    const rejectedAdapter = new FakeAdapter();
    rejectedAdapter.inserted = false;
    await expect(
      first.service.dispatch(rejected.preview, rejected.effect.id, 'composer', rejectedAdapter),
    ).resolves.toMatchObject({ status: 'failed', code: 'CHATGPT_COMPOSER_INSERT_REJECTED' });

    const second = setup();
    const mismatched = approvedEffect(second.service);
    const mismatchedAdapter = new FakeAdapter();
    mismatchedAdapter.insertedHash = 'f'.repeat(64);
    await expect(
      second.service.dispatch(
        mismatched.preview,
        mismatched.effect.id,
        'composer',
        mismatchedAdapter,
      ),
    ).resolves.toMatchObject({ status: 'failed', code: 'CHATGPT_COMPOSER_HASH_MISMATCH' });
  });
});

describe('manual-send acknowledgement and cancellation', () => {
  it('waits through streaming and acknowledges only the matching captured user message', async () => {
    const { service, workflows } = setup();
    const { preview, effect } = approvedEffect(service);
    const adapter = new FakeAdapter();
    await service.dispatch(preview, effect.id, 'composer', adapter);

    adapter.streaming = true;
    await expect(
      service.confirmOnce(effect.id, preview.destination, adapter),
    ).resolves.toMatchObject({
      status: 'streaming',
    });
    adapter.streaming = false;
    adapter.messages = [{ role: 'user', text: 'different message' }];
    await expect(
      service.confirmOnce(effect.id, preview.destination, adapter),
    ).resolves.toMatchObject({
      status: 'message_not_found',
    });
    await expect(service.confirmOnce(effect.id, { mode: 'new' }, adapter)).rejects.toThrow(
      'CHATGPT_EFFECT_DESTINATION_MISMATCH',
    );
    adapter.messages = [{ role: 'user', text: `\r\n${preview.text}\r\n` }];
    await expect(
      service.confirmOnce(effect.id, preview.destination, adapter),
    ).resolves.toMatchObject({
      status: 'acknowledged',
      effect: { status: 'acknowledged' },
    });
    expect(workflows.getRun(preview.workflowRunId)?.state).toBe('sent_to_chatgpt');
  });

  it('accepts a new-chat URL transition after manual send', async () => {
    const { service } = setup();
    const { preview, effect } = approvedEffect(service, 'new');
    const adapter = new FakeAdapter();
    adapter.inspection = {
      page: { mode: 'new' },
      composer: { available: true, readOnly: false },
    };
    await service.dispatch(preview, effect.id, 'composer', adapter);
    adapter.inspection = {
      page: { mode: 'existing', conversationId: 'created-conversation' },
      composer: { available: true, readOnly: false },
    };
    adapter.messages = [{ role: 'user', text: preview.text }];

    await expect(
      service.confirmOnce(effect.id, preview.destination, adapter),
    ).resolves.toMatchObject({
      status: 'acknowledged',
      effect: { result: { conversationId: 'created-conversation' } },
    });
  });

  it('cancels polling without losing recovery state and clears exact composer text on explicit cancel', async () => {
    const { service, workflows } = setup();
    const { preview, effect } = approvedEffect(service);
    const adapter = new FakeAdapter();
    await service.dispatch(preview, effect.id, 'composer', adapter);
    adapter.streaming = true;
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.waitForAcknowledgement(effect.id, preview.destination, adapter, {
        signal: controller.signal,
      }),
    ).rejects.toThrow('CHATGPT_CONFIRMATION_CANCELLED');
    expect(workflows.getEffect(effect.id)?.status).toBe('dispatching');

    await expect(service.cancelPreparedTransfer(effect.id, adapter)).resolves.toMatchObject({
      status: 'failed',
    });
    expect(adapter.clearCount).toBe(1);
  });
});
