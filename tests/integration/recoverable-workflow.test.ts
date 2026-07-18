import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AssistedChatGptService,
  type AssistedChatGptAdapter,
} from '@codex-context-bridge/assisted-chatgpt';
import { MockCodexAdapter } from '@codex-context-bridge/codex-adapter';
import type { ChatGptPageInspection, ConversationSnapshot } from '@codex-context-bridge/contracts';
import { openDatabase } from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { ResponseRouter } from '@codex-context-bridge/response-router';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { describe, expect, it } from 'vitest';

const NOW = '2026-07-18T11:30:00.000Z';
const SNAPSHOT_HASH = 'd'.repeat(64);

class FixtureChatGptAdapter implements AssistedChatGptAdapter {
  public insertedText = '';
  public insertCount = 0;
  public insertError: Error | undefined;
  public messages: ConversationSnapshot['messages'] = [];

  public inspect(): Promise<ChatGptPageInspection> {
    return Promise.resolve({
      page: { mode: 'existing', conversationId: 'conversation-1' },
      composer: { available: true, readOnly: false },
    });
  }

  public insert(input: { text: string; payloadHash: string }): Promise<{
    inserted: boolean;
    textHash: string;
  }> {
    this.insertCount += 1;
    if (this.insertError) return Promise.reject(this.insertError);
    this.insertedText = input.text;
    return Promise.resolve({ inserted: true, textHash: input.payloadHash });
  }

  public isStreaming(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public capture(): Promise<ConversationSnapshot> {
    return Promise.resolve({
      title: 'Bridge fixture',
      messages: this.messages,
      contentHash: SNAPSHOT_HASH,
      capturedAt: NOW,
    });
  }
}

async function waitForState(workflows: WorkflowEngine, workflowRunId: string, state: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const run = workflows.getRun(workflowRunId);
    if (run?.state === state) return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`WORKFLOW_STATE_TIMEOUT:${state}`);
}

function moveToContextApproval(workflows: WorkflowEngine, workflowRunId: string): void {
  for (const state of [
    'project_resolving',
    'codex_running',
    'codex_completed',
    'building_context',
    'context_review_required',
    'context_approved',
  ] as const) {
    workflows.transition(workflowRunId, {
      toState: state,
      eventType: `fixture.${state}`,
      actor: state === 'context_approved' ? 'user' : 'fixture',
    });
  }
}

function previewInput() {
  return {
    workflowRunId: 'workflow-1',
    handoff: {
      protocolVersion: '1.0' as const,
      handoffId: 'handoff-1',
      correlationId: 'correlation-1',
      source: 'codex' as const,
      target: 'chatgpt' as const,
      project: { id: 'project-1', name: 'Bridge', confidence: 0.95 },
      destination: { mode: 'existing-thread' as const, conversationId: 'conversation-1' },
      objective: 'Review the recoverable fixture.',
      userInstructions: ['Return a structured Codex prompt.'],
      constraints: ['Do not claim live integration.'],
      currentState: 'Context reviewed.',
      completedWork: ['Fixture Codex phase completed.'],
      unresolvedIssues: [],
      attachments: [],
      expectedResponse: { type: 'analysis-and-codex-prompt' as const, schemaVersion: '1.0' },
      createdAt: NOW,
    },
    contextPack: {
      protocolVersion: '1.0' as const,
      id: 'pack-1',
      createdAt: NOW,
      objective: 'Review the recoverable fixture.',
      project: {
        id: 'project-1',
        name: 'Bridge',
        repositoryRoot: 'C:/work/bridge',
        confidence: 0.95,
      },
      repositoryEvidence: [],
      codexFinalResponse: 'Fixture implementation completed.',
      completedWork: ['Persisted workflow state.'],
      changedFiles: ['fixture.ts'],
      gitDiffSummary: '1 fixture changed',
      verificationResults: [{ command: 'fixture', status: 'passed' as const, summary: 'green' }],
      knownFailures: [],
      openQuestions: [],
      relevantMemories: [],
      attachments: [],
      attachmentManifest: [],
      budget: {
        profile: {
          maxFiles: 5,
          maxTotalBytes: 5_000,
          maxSingleFileBytes: 2_000,
          maxEstimatedTokens: 1_250,
          preferFullFilesBelow: 500,
          excerptLineWindow: 20,
        },
        usedFiles: 0,
        totalBytes: 0,
        estimatedTokens: 0,
      },
      expectedChatGptResponse: {
        type: 'analysis-and-codex-prompt' as const,
        schemaVersion: '1.0',
      },
    },
  };
}

function structuredResponse() {
  return {
    protocolVersion: '1.0',
    handoffId: 'handoff-1',
    correlationId: 'correlation-1',
    projectId: 'project-1',
    status: 'ready_for_codex',
    analysisSummary: 'Fixture response validated.',
    codexPrompt: 'Complete the fixture workflow safely.',
    attachmentsRequested: [],
    requiresUserDecision: false,
  };
}

describe('recoverable ChatGPT to Codex fixture loop', () => {
  it('persists the golden path across restart and blocks duplicate sends', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-e2e-'));
    const databasePath = path.join(directory, 'context-bridge.sqlite');
    try {
      const database = openDatabase(databasePath);
      const projects = new ProjectRegistry(database, () => NOW);
      projects.create('Bridge', 'project-1');
      projects.registerRepository(
        'project-1',
        { repoRoot: 'C:/work/bridge', gitRemote: 'https://github.com/example/bridge.git' },
        'repository-1',
      );
      const workflows = new WorkflowEngine(database, { now: () => NOW });
      workflows.create({
        id: 'workflow-1',
        projectId: 'project-1',
        correlationId: 'correlation-1',
        idempotencyKey: 'workflow-key-1',
      });
      moveToContextApproval(workflows, 'workflow-1');

      const assisted = new AssistedChatGptService(workflows, { now: () => NOW });
      const chatGpt = new FixtureChatGptAdapter();
      const chatPreview = assisted.createPreview(previewInput());
      const chatApproval = assisted.approve(chatPreview, 60_000);
      const chatEffect = assisted.prepare(
        chatPreview,
        { id: chatApproval.approval.id, token: chatApproval.token },
        'chatgpt-effect-1',
      ).effect;
      await assisted.dispatch(chatPreview, chatEffect.id, 'composer', chatGpt);
      await expect(
        assisted.dispatch(chatPreview, chatEffect.id, 'composer', chatGpt),
      ).resolves.toMatchObject({ status: 'confirmation_required' });
      expect(chatGpt.insertCount).toBe(1);
      chatGpt.messages = [{ role: 'user', text: chatGpt.insertedText }];
      await expect(
        assisted.confirmOnce(chatEffect.id, chatPreview.destination, chatGpt),
      ).resolves.toMatchObject({ status: 'acknowledged' });

      const codex = new MockCodexAdapter({ now: () => NOW });
      const router = new ResponseRouter(database, workflows, projects, codex, { now: () => NOW });
      const receipt = router.captureResponse({
        workflowRunId: 'workflow-1',
        response: structuredResponse(),
        expectedHandoffId: 'handoff-1',
        expectedCorrelationId: 'correlation-1',
        expectedProjectId: 'project-1',
      });
      const codexPreview = router.createPreview(receipt.receiptId, {
        mode: 'new-thread',
        repositoryId: 'repository-1',
      });
      const codexApproval = router.approve(codexPreview, 60_000);
      const codexEffect = router.prepare(
        codexPreview,
        { id: codexApproval.approval.id, token: codexApproval.token },
        'codex-effect-1',
      ).effect;
      const dispatched = await router.dispatch(codexPreview, codexEffect.id);
      await waitForState(workflows, 'workflow-1', 'codex_completed');
      await expect(router.dispatch(codexPreview, codexEffect.id)).rejects.toThrow(
        'CODEX_EFFECT_NOT_DISPATCHABLE',
      );
      expect(await codex.getRun(dispatched.run.id)).toMatchObject({ status: 'completed' });
      database.close();

      const reopenedDatabase = openDatabase(databasePath);
      const reopenedWorkflows = new WorkflowEngine(reopenedDatabase, { now: () => NOW });
      const reopenedProjects = new ProjectRegistry(reopenedDatabase, () => NOW);
      expect(reopenedWorkflows.getRun('workflow-1')).toMatchObject({
        state: 'codex_completed',
        recoveryStatus: 'none',
      });
      expect(reopenedWorkflows.listEvents('workflow-1').length).toBeGreaterThanOrEqual(16);
      expect(reopenedProjects.listCodexThreads('project-1')).toHaveLength(1);
      expect(
        reopenedDatabase
          .prepare('SELECT operation, status FROM workflow_effects ORDER BY prepared_at, operation')
          .all(),
      ).toEqual([
        { operation: 'send_chatgpt', status: 'acknowledged' },
        { operation: 'send_codex', status: 'acknowledged' },
      ]);
      const reopenedRouter = new ResponseRouter(
        reopenedDatabase,
        reopenedWorkflows,
        reopenedProjects,
        new MockCodexAdapter({ now: () => NOW }),
        { now: () => NOW },
      );
      expect(() =>
        reopenedRouter.captureResponse({
          workflowRunId: 'workflow-1',
          response: structuredResponse(),
          expectedHandoffId: 'handoff-1',
          expectedCorrelationId: 'correlation-1',
          expectedProjectId: 'project-1',
        }),
      ).toThrow('DUPLICATE_RESPONSE');
      reopenedDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('restores ambiguous dispatch as confirmation-required without resending', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-recovery-'));
    const databasePath = path.join(directory, 'context-bridge.sqlite');
    try {
      const database = openDatabase(databasePath);
      const projects = new ProjectRegistry(database, () => NOW);
      projects.create('Bridge', 'project-1');
      const workflows = new WorkflowEngine(database, { now: () => NOW });
      workflows.create({
        id: 'workflow-1',
        projectId: 'project-1',
        correlationId: 'correlation-1',
        idempotencyKey: 'workflow-key-1',
      });
      moveToContextApproval(workflows, 'workflow-1');
      const assisted = new AssistedChatGptService(workflows, { now: () => NOW });
      const preview = assisted.createPreview(previewInput());
      const approval = assisted.approve(preview, 60_000);
      const effect = assisted.prepare(
        preview,
        { id: approval.approval.id, token: approval.token },
        'chatgpt-effect-ambiguous',
      ).effect;
      const adapter = new FixtureChatGptAdapter();
      adapter.insertError = new Error('fixture transport lost');

      await expect(assisted.dispatch(preview, effect.id, 'composer', adapter)).rejects.toThrow(
        'CHATGPT_DISPATCH_CONFIRMATION_REQUIRED',
      );
      expect(adapter.insertCount).toBe(1);
      database.close();

      const reopenedDatabase = openDatabase(databasePath);
      const reopenedWorkflows = new WorkflowEngine(reopenedDatabase, { now: () => NOW });
      expect(reopenedWorkflows.recover('workflow-1')).toMatchObject([
        { action: 'confirmation_required', effect: { id: effect.id, status: 'dispatching' } },
      ]);
      const reopenedAssisted = new AssistedChatGptService(reopenedWorkflows, { now: () => NOW });
      await expect(
        reopenedAssisted.dispatch(preview, effect.id, 'composer', adapter),
      ).resolves.toMatchObject({ status: 'confirmation_required' });
      expect(adapter.insertCount).toBe(1);
      reopenedDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
