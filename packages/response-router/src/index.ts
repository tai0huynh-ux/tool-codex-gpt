import { createHash, randomUUID } from 'node:crypto';
import {
  codexRoutePreviewSchema,
  contextBridgeResponseSchema,
  type CodexDestination,
  type CodexRoutePreview,
  type ContextBridgeResponse,
  type WorkflowEffect,
} from '@codex-context-bridge/contracts';
import type {
  CodexAdapter,
  CodexExecutionProfile,
  CodexRun,
  CodexRunEvent,
  CodexThread,
} from '@codex-context-bridge/codex-adapter';
import type { SqliteDatabase } from '@codex-context-bridge/database';
import type { ProjectRegistry, RegisteredRepository } from '@codex-context-bridge/project-registry';
import type { WorkflowEngine } from '@codex-context-bridge/workflow-engine';

interface ReceiptRow {
  id: string;
  workflow_run_id: string;
  handoff_id: string;
  correlation_id: string;
  project_id: string;
  response_hash: string;
  response_json: string;
  status: 'captured' | 'routed';
  created_at: string;
  routed_at: string | null;
}

export interface WorktreeProvider {
  prepare(input: {
    projectId: string;
    repository: RegisteredRepository;
    worktreeName: string;
  }): Promise<{ workingDirectory: string; repositoryFingerprint: string }>;
}

export interface CaptureResponseInput {
  workflowRunId: string;
  response: unknown;
  expectedHandoffId: string;
  expectedCorrelationId: string;
  expectedProjectId: string;
}

export interface ResponseRouterOptions {
  now?: () => string;
  worktrees?: WorktreeProvider;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertExecutionProfile(profile: unknown): CodexExecutionProfile {
  if (profile !== 'read_only' && profile !== 'workspace_write_no_network') {
    throw new Error('CODEX_EXECUTION_PROFILE_INVALID');
  }
  return profile;
}

function destinationBinding(
  destination: CodexDestination,
  profile: CodexExecutionProfile = 'read_only',
): { type: string; id: string } {
  const suffix = profile === 'workspace_write_no_network' ? `:${profile}` : '';
  switch (destination.mode) {
    case 'existing-thread':
      return { type: 'codex_thread', id: `${destination.threadMappingId}${suffix}` };
    case 'new-thread':
      return { type: 'codex_repository', id: `${destination.repositoryId}${suffix}` };
    case 'new-worktree':
      return {
        type: 'codex_worktree',
        id: `${destination.repositoryId}:${destination.worktreeName}${suffix}`,
      };
  }
}

export class ResponseRouter {
  private readonly now: () => string;

  public constructor(
    private readonly database: SqliteDatabase,
    private readonly workflows: WorkflowEngine,
    private readonly projects: ProjectRegistry,
    private readonly codex: CodexAdapter,
    private readonly options: ResponseRouterOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  public captureResponse(input: CaptureResponseInput): {
    receiptId: string;
    response: ContextBridgeResponse;
  } {
    const response = contextBridgeResponseSchema.parse(input.response);
    if (response.handoffId !== input.expectedHandoffId) throw new Error('HANDOFF_ID_MISMATCH');
    if (response.correlationId !== input.expectedCorrelationId) {
      throw new Error('CORRELATION_ID_MISMATCH');
    }
    if (response.projectId !== input.expectedProjectId) throw new Error('PROJECT_ID_MISMATCH');
    const run = this.workflows.getRun(input.workflowRunId);
    if (!run) throw new Error('WORKFLOW_NOT_FOUND');
    if (run.projectId !== response.projectId || run.correlationId !== response.correlationId) {
      throw new Error('RESPONSE_WORKFLOW_MISMATCH');
    }
    const duplicate = this.database
      .prepare('SELECT id FROM chatgpt_response_receipts WHERE handoff_id = ?')
      .get(response.handoffId) as { id: string } | undefined;
    if (duplicate) throw new Error('DUPLICATE_RESPONSE');
    if (run.state !== 'sent_to_chatgpt' && run.state !== 'waiting_chatgpt') {
      throw new Error('RESPONSE_WORKFLOW_STATE_INVALID');
    }
    const responseJson = JSON.stringify(response);
    const receiptId = randomUUID();
    const now = this.now();
    return this.database.transaction(() => {
      if (run.state === 'sent_to_chatgpt') {
        this.workflows.transition(run.id, {
          toState: 'waiting_chatgpt',
          eventType: 'chatgpt.response.waiting',
          actor: 'response.router',
        });
      }
      this.workflows.transition(run.id, {
        toState: 'chatgpt_response_captured',
        eventType: 'chatgpt.response.captured',
        actor: 'response.router',
        payload: { handoffId: response.handoffId },
      });
      this.workflows.transition(run.id, {
        toState: 'validating_chatgpt_response',
        eventType: 'chatgpt.response.validating',
        actor: 'response.router',
      });
      this.database
        .prepare(
          `INSERT INTO chatgpt_response_receipts (
            id, workflow_run_id, handoff_id, correlation_id, project_id,
            response_hash, response_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'captured', ?)`,
        )
        .run(
          receiptId,
          run.id,
          response.handoffId,
          response.correlationId,
          response.projectId,
          sha256(responseJson),
          responseJson,
          now,
        );
      this.workflows.transition(run.id, {
        toState:
          response.status === 'ready_for_codex' ? 'codex_prompt_review_required' : 'finished',
        eventType:
          response.status === 'ready_for_codex'
            ? 'chatgpt.response.ready_for_review'
            : 'chatgpt.response.workflow_stopped',
        actor: 'response.router',
      });
      return { receiptId, response };
    })();
  }

  public createPreview(receiptId: string, destination: CodexDestination): CodexRoutePreview {
    const row = this.getReceipt(receiptId);
    const response = contextBridgeResponseSchema.parse(JSON.parse(row.response_json) as unknown);
    if (response.status !== 'ready_for_codex' || !response.codexPrompt) {
      throw new Error('RESPONSE_NOT_ROUTABLE');
    }
    const run = this.workflows.getRun(row.workflow_run_id);
    if (run?.state !== 'codex_prompt_review_required') {
      throw new Error('CODEX_PREVIEW_STATE_INVALID');
    }
    this.resolveDestination(run.projectId, destination);
    return codexRoutePreviewSchema.parse({
      protocolVersion: '1.0',
      receiptId: row.id,
      workflowRunId: run.id,
      handoffId: row.handoff_id,
      correlationId: row.correlation_id,
      projectId: row.project_id,
      codexPrompt: response.codexPrompt,
      promptHash: sha256(response.codexPrompt.trim()),
      responseHash: row.response_hash,
      destination,
      createdAt: this.now(),
    });
  }

  public approve(
    previewInput: CodexRoutePreview,
    ttlMs: number,
    executionProfile: CodexExecutionProfile = 'read_only',
  ) {
    const preview = this.validatePreview(previewInput);
    const profile = assertExecutionProfile(executionProfile);
    const destination = destinationBinding(preview.destination, profile);
    return this.database.transaction(() => {
      this.workflows.transition(preview.workflowRunId, {
        toState: 'codex_prompt_approved',
        eventType: 'codex.prompt.approved',
        actor: 'user',
      });
      return this.workflows.issueApproval({
        workflowRunId: preview.workflowRunId,
        operation: 'send_codex',
        destinationType: destination.type,
        destinationId: destination.id,
        payloadHash: preview.promptHash,
        ttlMs,
      });
    })();
  }

  public prepare(
    previewInput: CodexRoutePreview,
    approval: { id: string; token: string },
    idempotencyKey: string,
    executionProfile: CodexExecutionProfile = 'read_only',
  ) {
    const preview = this.validatePreview(previewInput);
    const profile = assertExecutionProfile(executionProfile);
    const destination = destinationBinding(preview.destination, profile);
    return this.workflows.prepareSend({
      workflowRunId: preview.workflowRunId,
      operation: 'send_codex',
      idempotencyKey,
      handoffHash: preview.responseHash,
      payloadHash: preview.promptHash,
      destinationType: destination.type,
      destinationId: destination.id,
      approvalId: approval.id,
      approvalToken: approval.token,
    });
  }

  public async dispatch(
    previewInput: CodexRoutePreview,
    effectId: string,
    executionProfile: CodexExecutionProfile = 'read_only',
  ): Promise<{
    effect: WorkflowEffect;
    thread: CodexThread;
    run: CodexRun;
  }> {
    const preview = this.validatePreview(previewInput);
    const profile = assertExecutionProfile(executionProfile);
    const effect = this.workflows.getEffect(effectId);
    if (!effect) throw new Error('EFFECT_NOT_FOUND');
    if (effect.status === 'dispatching') throw new Error('CODEX_DISPATCH_CONFIRMATION_REQUIRED');
    if (effect.status !== 'prepared') throw new Error('CODEX_EFFECT_NOT_DISPATCHABLE');
    const expectedDestination = destinationBinding(preview.destination, profile);
    if (
      effect.destinationType !== expectedDestination.type ||
      effect.destinationId !== expectedDestination.id
    ) {
      throw new Error('CODEX_EXECUTION_PROFILE_MISMATCH');
    }
    const target = await this.resolveTarget(preview.projectId, preview.destination, profile);
    this.workflows.beginDispatch(effect.id);
    try {
      const thread = target.thread ?? (await this.codex.startThread(target.start));
      const run = await this.codex.runTurn(thread.id, preview.codexPrompt);
      const acknowledged = this.database.transaction(() => {
        if (!target.thread) {
          this.projects.registerCodexThread({
            projectId: preview.projectId,
            repositoryFingerprint: thread.repositoryFingerprint,
            externalThreadId: thread.id,
          });
        }
        const updatedEffect = this.workflows.acknowledge(effect.id, {
          threadId: thread.id,
          runId: run.id,
        });
        this.workflows.transition(preview.workflowRunId, {
          toState: 'codex_running',
          eventType: 'codex.run.started',
          actor: 'response.router',
          payload: { runId: run.id, threadId: thread.id },
        });
        this.database
          .prepare(
            "UPDATE chatgpt_response_receipts SET status = 'routed', routed_at = ? WHERE id = ?",
          )
          .run(this.now(), preview.receiptId);
        return updatedEffect;
      })();
      this.codex.subscribe(run.id, (event) => this.handleCodexEvent(preview.workflowRunId, event));
      return { effect: acknowledged, thread, run };
    } catch (error) {
      throw new Error('CODEX_DISPATCH_CONFIRMATION_REQUIRED', { cause: error });
    }
  }

  private handleCodexEvent(workflowRunId: string, event: CodexRunEvent): void {
    const run = this.workflows.getRun(workflowRunId);
    if (run?.state !== 'codex_running') return;
    if (event.type === 'run.completed') {
      this.workflows.transition(workflowRunId, {
        toState: 'codex_completed',
        eventType: 'codex.run.completed',
        actor: 'codex.adapter',
      });
    } else if (event.type === 'run.failed') {
      this.workflows.transition(workflowRunId, {
        toState: 'codex_failed',
        eventType: 'codex.run.failed',
        actor: 'codex.adapter',
        errorCode: event.error.code,
      });
    } else if (event.type === 'run.cancelled') {
      this.workflows.transition(workflowRunId, {
        toState: 'cancelled',
        eventType: 'codex.run.cancelled',
        actor: 'codex.adapter',
      });
    }
  }

  private validatePreview(input: CodexRoutePreview): CodexRoutePreview {
    const preview = codexRoutePreviewSchema.parse(input);
    const row = this.getReceipt(preview.receiptId);
    if (
      sha256(preview.codexPrompt.trim()) !== preview.promptHash ||
      row.response_hash !== preview.responseHash ||
      row.handoff_id !== preview.handoffId ||
      row.project_id !== preview.projectId ||
      row.correlation_id !== preview.correlationId
    ) {
      throw new Error('CODEX_PREVIEW_INTEGRITY_INVALID');
    }
    this.resolveDestination(preview.projectId, preview.destination);
    return preview;
  }

  private getReceipt(id: string): ReceiptRow {
    const row = this.database
      .prepare('SELECT * FROM chatgpt_response_receipts WHERE id = ?')
      .get(id) as ReceiptRow | undefined;
    if (!row) throw new Error('RESPONSE_RECEIPT_NOT_FOUND');
    return row;
  }

  private resolveDestination(
    projectId: string,
    destination: CodexDestination,
  ): RegisteredRepository {
    if (destination.mode === 'existing-thread') {
      const mapping = this.projects.getCodexThread(destination.threadMappingId);
      if (mapping?.projectId !== projectId) throw new Error('CODEX_THREAD_PROJECT_MISMATCH');
      const repository = this.projects
        .listRepositories(projectId)
        .find((candidate) => candidate.fingerprint === mapping.repositoryFingerprint);
      if (!repository) throw new Error('CODEX_THREAD_REPOSITORY_NOT_FOUND');
      return repository;
    }
    const repository = this.projects.getRepository(destination.repositoryId);
    if (repository?.projectId !== projectId || repository.archivedAt) {
      throw new Error('CODEX_REPOSITORY_PROJECT_MISMATCH');
    }
    if (destination.mode === 'new-worktree' && !this.options.worktrees) {
      throw new Error('CODEX_WORKTREE_PROVIDER_UNAVAILABLE');
    }
    return repository;
  }

  private async resolveTarget(
    projectId: string,
    destination: CodexDestination,
    executionProfile: CodexExecutionProfile,
  ): Promise<{
    thread?: CodexThread;
    start: {
      projectId: string;
      repositoryFingerprint: string;
      workingDirectory: string;
      executionProfile?: CodexExecutionProfile;
    };
  }> {
    const repository = this.resolveDestination(projectId, destination);
    if (destination.mode === 'existing-thread') {
      const mapping = this.projects.getCodexThread(destination.threadMappingId);
      if (!mapping) throw new Error('CODEX_THREAD_NOT_FOUND');
      const thread = await this.codex.resumeThread(mapping.externalThreadId);
      if (
        thread.projectId !== projectId ||
        thread.repositoryFingerprint !== repository.fingerprint
      ) {
        throw new Error('CODEX_THREAD_IDENTITY_MISMATCH');
      }
      if ((thread.executionProfile ?? 'read_only') !== executionProfile) {
        throw new Error('CODEX_THREAD_PROFILE_MISMATCH');
      }
      return { thread, start: thread };
    }
    if (destination.mode === 'new-worktree') {
      const worktree = await this.options.worktrees?.prepare({
        projectId,
        repository,
        worktreeName: destination.worktreeName,
      });
      if (!worktree) throw new Error('CODEX_WORKTREE_PROVIDER_UNAVAILABLE');
      return {
        start: {
          projectId,
          repositoryFingerprint: worktree.repositoryFingerprint,
          workingDirectory: worktree.workingDirectory,
          ...(executionProfile !== 'read_only' ? { executionProfile } : {}),
        },
      };
    }
    return {
      start: {
        projectId,
        repositoryFingerprint: repository.fingerprint,
        workingDirectory: repository.worktreeRoot ?? repository.canonicalRoot,
        ...(executionProfile !== 'read_only' ? { executionProfile } : {}),
      },
    };
  }
}
