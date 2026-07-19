import { randomUUID } from 'node:crypto';
import type {
  AssistedChatGptPreview,
  ChatGptDestination,
  ContextBridgeResponse,
  ConversationSnapshot,
  LocalTransportResult,
} from '@codex-context-bridge/contracts';
import {
  AssistedChatGptService,
  type AssistedChatGptAdapter,
} from '@codex-context-bridge/assisted-chatgpt';
import type { CodexAdapter, CodexExecutionProfile } from '@codex-context-bridge/codex-adapter';
import type { SqliteDatabase } from '@codex-context-bridge/database';
import type { ProjectRegistry } from '@codex-context-bridge/project-registry';
import type { ResponseRouter } from '@codex-context-bridge/response-router';
import type { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import type { z } from 'zod';
import type { DesktopBridgeService, IpcInvokeEventLike, IpcMainLike } from './ipc';
import {
  pilotCreateInputSchema,
  chatHistoryExportResponseSchema,
  pilotErrorCodeSchema,
  pilotIdInputSchema,
  pilotIpcChannels,
  pilotListInputSchema,
  pilotListResponseSchema,
  pilotViewResponseSchema,
  pilotViewSchema,
  type PilotCreateInput,
  type ChatHistoryExportResult,
  type PilotView,
} from './pilot-contracts';
import { ChatArchiveStore } from './chat-archive';
import { verifyStaticWebsite } from './website-verifier';

const PILOT_PREFIX = 'live-project-pilot:';
const WORKSPACE_PROFILE: CodexExecutionProfile = 'workspace_write_no_network';

class NativeChatGptAdapter implements AssistedChatGptAdapter {
  public constructor(private readonly bridge: DesktopBridgeService) {}

  private async execute<T extends LocalTransportResult['type']>(
    operation: Parameters<DesktopBridgeService['execute']>[0],
    expectedType: T,
  ): Promise<Extract<LocalTransportResult, { type: T }>> {
    const result = await this.bridge.execute(operation);
    if (result.type !== expectedType) throw new Error('TRANSPORT_RESULT_INVALID');
    return result as Extract<LocalTransportResult, { type: T }>;
  }

  public async inspect() {
    return (await this.execute({ type: 'page.inspect' }, 'page.inspect.result')).inspection;
  }

  public async insert(input: {
    text: string;
    effectId: string;
    payloadHash: string;
    destination: ChatGptDestination;
  }) {
    const result = await this.execute(
      { type: 'composer.insert', ...input },
      'composer.insert.result',
    );
    return {
      inserted: result.inserted,
      ...(result.textHash ? { textHash: result.textHash } : {}),
    };
  }

  public async submit(input: {
    effectId: string;
    expectedTextHash: string;
    destination: ChatGptDestination;
  }) {
    const result = await this.execute(
      { type: 'composer.submit', ...input },
      'composer.submit.result',
    );
    return {
      submitted: result.submitted,
      ...(result.textHash ? { textHash: result.textHash } : {}),
      ...(result.code ? { code: result.code } : {}),
    };
  }

  public async isStreaming(): Promise<boolean> {
    return (await this.execute({ type: 'page.status' }, 'page.status.result')).streaming;
  }

  public async isConversationStreaming(destination: ChatGptDestination): Promise<boolean> {
    return (await this.execute({ type: 'page.status', destination }, 'page.status.result'))
      .streaming;
  }

  public async capture(_signal?: AbortSignal): Promise<ConversationSnapshot> {
    void _signal;
    return this.captureConversation();
  }

  public async captureConversation(
    destination?: ChatGptDestination,
  ): Promise<ConversationSnapshot> {
    return (
      await this.execute(
        { type: 'conversation.capture', ...(destination ? { destination } : {}) },
        'conversation.capture.result',
      )
    ).snapshot;
  }
}

interface ChatGptEffectRow {
  id: string;
  status: 'prepared' | 'dispatching' | 'acknowledged' | 'failed';
}

export interface PilotDesktopService {
  list(projectId?: string): Promise<PilotView[]>;
  create(input: PilotCreateInput): Promise<PilotView>;
  refresh(pilotId: string): Promise<PilotView>;
  inspectChatGpt(pilotId: string): Promise<PilotView>;
  prepareChatGpt(pilotId: string): Promise<PilotView>;
  approveChatGpt(pilotId: string): Promise<PilotView>;
  captureChatGpt(pilotId: string): Promise<PilotView>;
  syncChatHistory(pilotId: string): Promise<PilotView>;
  exportChatHistory(pilotId: string): Promise<ChatHistoryExportResult>;
  approveCodex(pilotId: string): Promise<PilotView>;
  verifyWebsite(pilotId: string): Promise<PilotView>;
  openPreview(pilotId: string): Promise<PilotView>;
}

export function createPilotDesktopService(input: {
  database: SqliteDatabase;
  projects: ProjectRegistry;
  workflows: WorkflowEngine;
  bridge: DesktopBridgeService;
  router: ResponseRouter;
  codex: CodexAdapter;
  openPreview?: (repositoryRoot: string) => Promise<void>;
  ensureChatGptPage?: (destination: ChatGptDestination) => Promise<void>;
  saveChatHistory?: (input: {
    suggestedFileName: string;
    content: string;
  }) => Promise<string | null>;
  now?: () => string;
}): PilotDesktopService {
  const now = input.now ?? (() => new Date().toISOString());
  const assisted = new AssistedChatGptService(input.workflows, { now });
  const chatGpt = new NativeChatGptAdapter(input.bridge);
  const archive = new ChatArchiveStore(input.database, now);

  const save = (view: PilotView): PilotView => {
    const value = pilotViewSchema.parse({ ...view, updatedAt: now() });
    input.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(`${PILOT_PREFIX}${value.id}`, JSON.stringify(value), value.updatedAt);
    return value;
  };
  const get = (pilotId: string): PilotView => {
    const row = input.database
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get(`${PILOT_PREFIX}${pilotId}`) as { value_json: string } | undefined;
    if (!row) throw new Error('PILOT_NOT_FOUND');
    return pilotViewSchema.parse(JSON.parse(row.value_json) as unknown);
  };

  const recoverChatGptEffect = (view: PilotView): PilotView => {
    if (view.chatGptEffectId) return view;
    if (
      !['chatgpt_ready', 'chatgpt_dispatched', 'chatgpt_confirmation_required'].includes(
        view.status,
      )
    ) {
      return view;
    }
    const effect = input.database
      .prepare(
        `SELECT id, status FROM workflow_effects
         WHERE workflow_run_id = ? AND operation = 'send_chatgpt'
         ORDER BY prepared_at DESC LIMIT 1`,
      )
      .get(view.workflowRunId) as ChatGptEffectRow | undefined;
    if (!effect) return view;
    if (effect.status === 'prepared') return save({ ...view, chatGptEffectId: effect.id });
    if (effect.status === 'dispatching') {
      return save({
        ...view,
        chatGptEffectId: effect.id,
        status: 'chatgpt_confirmation_required',
      });
    }
    if (effect.status === 'acknowledged') {
      return save({ ...view, chatGptEffectId: effect.id, status: 'chatgpt_dispatched' });
    }
    return save({
      ...view,
      chatGptEffectId: effect.id,
      status: 'failed',
      errorCode: 'CHATGPT_TRANSFER_FAILED',
    });
  };

  const refresh = async (view: PilotView): Promise<PilotView> => {
    view = recoverChatGptEffect(view);
    const workflow = input.workflows.getRun(view.workflowRunId);
    if (!workflow) throw new Error('PILOT_STATE_INVALID');
    if (!view.codexRunId) return view;
    // Terminal persisted pilots are self-contained; a fresh adapter may not retain old run handles.
    if (view.status === 'codex_completed' || view.status === 'failed') return view;
    const run = await input.codex.getRun(view.codexRunId);
    if (run.status === 'completed') {
      return Promise.resolve(
        save({
          ...view,
          status: 'codex_completed',
          ...(run.finalResponse ? { finalResponse: run.finalResponse } : {}),
        }),
      );
    }
    if (run.status === 'failed') {
      return save({ ...view, status: 'failed', errorCode: run.error?.code ?? 'INTERNAL_ERROR' });
    }
    if (run.status === 'cancelled') {
      return save({ ...view, status: 'failed', errorCode: 'CODEX_RUN_CANCELLED' });
    }
    return view;
  };

  const buildPreview = (view: PilotView): AssistedChatGptPreview => {
    const project = input.projects.get(view.projectId);
    if (!project) throw new Error('PROJECT_NOT_FOUND');
    const createdAt = now();
    return assisted.createPreview({
      workflowRunId: view.workflowRunId,
      handoff: {
        protocolVersion: '1.0',
        handoffId: `pilot-handoff:${view.id}`,
        correlationId: input.workflows.getRun(view.workflowRunId)?.correlationId ?? '',
        source: 'codex',
        target: 'chatgpt',
        project: { id: project.id, name: project.name, confidence: 1 },
        destination:
          view.destination.mode === 'existing'
            ? { mode: 'existing-thread', conversationId: view.destination.conversationId }
            : { mode: 'new-thread' },
        objective: view.objective,
        userInstructions: ['Return exactly one structured Codex prompt.'],
        constraints: [
          'Modify only the registered repository.',
          'Do not install dependencies or use network resources.',
        ],
        currentState: 'Live Project Pilot request reviewed in Codex Context Bridge.',
        completedWork: [],
        unresolvedIssues: [],
        attachments: [],
        expectedResponse: { type: 'analysis-and-codex-prompt', schemaVersion: '1.0' },
        createdAt,
      },
      contextPack: {
        protocolVersion: '1.0',
        id: `pilot-pack:${view.id}`,
        createdAt,
        objective: view.objective,
        project: {
          id: project.id,
          name: project.name,
          repositoryRoot: view.repositoryRoot,
          confidence: 1,
        },
        repositoryEvidence: [{ type: 'repo-root', value: view.repositoryRoot, score: 1 }],
        codexFinalResponse: 'Not run yet.',
        completedWork: [],
        changedFiles: [],
        gitDiffSummary: 'No Codex changes yet.',
        verificationResults: [],
        knownFailures: [],
        openQuestions: [],
        relevantMemories: [],
        attachments: [],
        attachmentManifest: [],
        budget: {
          profile: {
            maxFiles: 5,
            maxTotalBytes: 20_000,
            maxSingleFileBytes: 10_000,
            maxEstimatedTokens: 5_000,
            preferFullFilesBelow: 4_000,
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
    });
  };

  return {
    list: async (projectId) => {
      const rows = input.database
        .prepare('SELECT value_json FROM settings WHERE key LIKE ? ORDER BY updated_at DESC')
        .all(`${PILOT_PREFIX}%`) as { value_json: string }[];
      const views = rows
        .map((row) => pilotViewSchema.parse(JSON.parse(row.value_json) as unknown))
        .filter((view) => !projectId || view.projectId === projectId);
      return Promise.all(views.map((view) => refresh(view)));
    },
    create: async ({ projectId, repositoryId, objective, destination }) => {
      const project = input.projects.get(projectId);
      const repository = input.projects.getRepository(repositoryId);
      if (!project || project.archivedAt) throw new Error('PROJECT_NOT_FOUND');
      if (repository?.projectId !== projectId || repository.archivedAt) {
        throw new Error('REPOSITORY_NOT_FOUND');
      }
      let resolvedDestination: PilotView['destination'];
      let chatGptInspection: PilotView['chatGptInspection'];
      if (destination.mode === 'current') {
        const transport = await input.bridge.getStatus();
        if (transport.state !== 'connected') throw new Error('TRANSPORT_DISCONNECTED');
        const inspection = await chatGpt.inspect();
        const streaming = await chatGpt.isStreaming();
        if (inspection.page.mode !== 'existing') throw new Error('CHATGPT_NOT_READY');
        resolvedDestination = {
          mode: 'existing',
          conversationId: inspection.page.conversationId,
        };
        chatGptInspection = {
          pageMode: inspection.page.mode,
          conversationId: inspection.page.conversationId,
          composerAvailable: inspection.composer.available,
          composerReadOnly: inspection.composer.readOnly,
          hasDraft: Boolean(inspection.composer.textHash),
          streaming,
        };
      } else {
        resolvedDestination = destination;
      }
      const id = randomUUID();
      const workflow = input.workflows.create({
        projectId,
        correlationId: `pilot:${id}`,
        idempotencyKey: `pilot:${id}`,
      });
      input.workflows.transition(workflow.id, {
        toState: 'project_resolving',
        eventType: 'pilot.project.resolving',
        actor: 'pilot.service',
      });
      input.workflows.transition(workflow.id, {
        toState: 'building_context',
        eventType: 'pilot.context.building',
        actor: 'pilot.service',
      });
      input.workflows.transition(workflow.id, {
        toState: 'context_review_required',
        eventType: 'pilot.context.review_required',
        actor: 'pilot.service',
      });
      const createdAt = now();
      return save({
        id,
        projectId,
        repositoryId,
        repositoryRoot: repository.canonicalRoot,
        repositoryFingerprint: repository.fingerprint,
        objective: objective.trim(),
        destination: resolvedDestination,
        workflowRunId: workflow.id,
        status: 'draft',
        ...(chatGptInspection ? { chatGptInspection } : {}),
        createdAt,
        updatedAt: createdAt,
      });
    },
    refresh: async (pilotId) => refresh(get(pilotId)),
    inspectChatGpt: async (pilotId) => {
      const view = get(pilotId);
      await input.ensureChatGptPage?.(view.destination);
      const status = await input.bridge.getStatus();
      if (status.state !== 'connected') throw new Error('TRANSPORT_DISCONNECTED');
      const inspection = await chatGpt.inspect();
      const streaming = await chatGpt.isStreaming();
      return save({
        ...view,
        chatGptInspection: {
          pageMode: inspection.page.mode,
          ...(inspection.page.mode === 'existing'
            ? { conversationId: inspection.page.conversationId }
            : {}),
          composerAvailable: inspection.composer.available,
          composerReadOnly: inspection.composer.readOnly,
          hasDraft: Boolean(inspection.composer.textHash),
          streaming,
        },
      });
    },
    prepareChatGpt: (pilotId) => {
      const view = get(pilotId);
      if (view.status !== 'draft') throw new Error('PILOT_STATE_INVALID');
      input.workflows.transition(view.workflowRunId, {
        toState: 'context_approved',
        eventType: 'pilot.context.approved',
        actor: 'user',
      });
      return Promise.resolve(
        save({ ...view, status: 'chatgpt_ready', chatGptPreview: buildPreview(view) }),
      );
    },
    approveChatGpt: async (pilotId) => {
      const view = get(pilotId);
      if (view.status !== 'chatgpt_ready' || !view.chatGptPreview) {
        throw new Error('PILOT_STATE_INVALID');
      }
      // Recover the exact ChatGPT page before consuming the approval capability.
      await input.ensureChatGptPage?.(view.destination);
      const approval = assisted.approve(view.chatGptPreview, 5 * 60_000);
      const effect = assisted.prepare(
        view.chatGptPreview,
        { id: approval.approval.id, token: approval.token },
        `pilot:${view.id}:chatgpt`,
      ).effect;
      const dispatched = await assisted.dispatch(
        view.chatGptPreview,
        effect.id,
        'composer',
        chatGpt,
      );
      if (dispatched.status === 'confirmation_required') {
        return save({
          ...view,
          chatGptEffectId: effect.id,
          status: 'chatgpt_confirmation_required',
        });
      }
      if (dispatched.status === 'acknowledged') {
        return save({ ...view, chatGptEffectId: effect.id, status: 'chatgpt_dispatched' });
      }
      if (dispatched.status === 'failed') {
        return save({
          ...view,
          chatGptEffectId: effect.id,
          status: 'failed',
          errorCode: dispatched.code,
        });
      }
      const submitted = await assisted.submitApproved(effect.id, view.destination, chatGpt);
      return save({
        ...view,
        chatGptEffectId: effect.id,
        status:
          submitted.status === 'submitted' ? 'chatgpt_dispatched' : 'chatgpt_confirmation_required',
        ...(submitted.status === 'failed' ? { errorCode: submitted.code } : {}),
      });
    },
    captureChatGpt: async (pilotId) => {
      const view = get(pilotId);
      if (!view.chatGptEffectId || !view.chatGptPreview) throw new Error('PILOT_STATE_INVALID');
      const confirmation = await assisted.confirmOnce(
        view.chatGptEffectId,
        view.destination,
        chatGpt,
      );
      if (confirmation.status !== 'acknowledged') {
        throw new Error('CHATGPT_CONFIRMATION_REQUIRED');
      }
      const status = await input.bridge.execute({
        type: 'page.status',
        expectedHandoffId: view.chatGptPreview.handoffId,
        expectedCorrelationId: view.chatGptPreview.correlationId,
        expectedProjectId: view.projectId,
      });
      if (status.type !== 'page.status.result' || !status.structuredResponse.ok) {
        throw new Error('CHATGPT_NOT_READY');
      }
      const response: ContextBridgeResponse = status.structuredResponse.response;
      const receipt = input.router.captureResponse({
        workflowRunId: view.workflowRunId,
        response,
        expectedHandoffId: view.chatGptPreview.handoffId,
        expectedCorrelationId: view.chatGptPreview.correlationId,
        expectedProjectId: view.projectId,
      });
      const codexPreview = input.router.createPreview(receipt.receiptId, {
        mode: 'new-thread',
        repositoryId: view.repositoryId,
      });
      return save({ ...view, status: 'codex_ready', response, codexPreview });
    },
    syncChatHistory: async (pilotId) => {
      const view = get(pilotId);
      if (view.destination.mode !== 'existing') {
        throw new Error('CHAT_ARCHIVE_DESTINATION_REQUIRED');
      }
      await input.ensureChatGptPage?.(view.destination);
      const transport = await input.bridge.getStatus();
      if (transport.state !== 'connected') throw new Error('TRANSPORT_DISCONNECTED');
      if (await chatGpt.isConversationStreaming(view.destination)) {
        throw new Error('CHATGPT_NOT_READY');
      }
      const snapshot = await chatGpt.captureConversation(view.destination);
      const summary = archive.archive({
        projectId: view.projectId,
        conversationId: view.destination.conversationId,
        snapshot,
      });
      return save({ ...get(pilotId), chatArchive: summary });
    },
    exportChatHistory: async (pilotId) => {
      const view = get(pilotId);
      const history = archive.exportProject(view.projectId);
      const revisionCount = history.conversations.reduce(
        (total, conversation) => total + conversation.revisions.length,
        0,
      );
      if (history.conversations.length === 0 || revisionCount === 0) {
        throw new Error('CHAT_ARCHIVE_EMPTY');
      }
      if (!input.saveChatHistory) throw new Error('CHAT_ARCHIVE_EXPORT_FAILED');
      const compactTimestamp = history.exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      let filePath: string | null;
      try {
        filePath = await input.saveChatHistory({
          suggestedFileName: `chatgpt-history-${compactTimestamp}.json`,
          content: `${JSON.stringify(history, null, 2)}\n`,
        });
      } catch {
        throw new Error('CHAT_ARCHIVE_EXPORT_FAILED');
      }
      return {
        canceled: filePath === null,
        ...(filePath ? { filePath } : {}),
        conversationCount: history.conversations.length,
        revisionCount,
        exportedAt: history.exportedAt,
      };
    },
    approveCodex: async (pilotId) => {
      const view = get(pilotId);
      if (view.status !== 'codex_ready' || !view.codexPreview) {
        throw new Error('PILOT_STATE_INVALID');
      }
      const approval = input.router.approve(view.codexPreview, 5 * 60_000, WORKSPACE_PROFILE);
      const effect = input.router.prepare(
        view.codexPreview,
        { id: approval.approval.id, token: approval.token },
        `pilot:${view.id}:codex`,
        WORKSPACE_PROFILE,
      ).effect;
      const dispatched = await input.router.dispatch(
        view.codexPreview,
        effect.id,
        WORKSPACE_PROFILE,
      );
      return save({
        ...view,
        status: 'codex_running',
        codexEffectId: effect.id,
        codexThreadId: dispatched.thread.id,
        codexRunId: dispatched.run.id,
      });
    },
    verifyWebsite: async (pilotId) => {
      const view = get(pilotId);
      if (view.status !== 'codex_completed') throw new Error('PILOT_STATE_INVALID');
      const websiteVerification = await verifyStaticWebsite(view.repositoryRoot, now);
      return save({ ...view, websiteVerification });
    },
    openPreview: async (pilotId) => {
      const view = get(pilotId);
      if (view.websiteVerification?.status !== 'passed') throw new Error('PILOT_STATE_INVALID');
      if (!input.openPreview) throw new Error('INTERNAL_ERROR');
      await input.openPreview(view.repositoryRoot);
      return view;
    },
  };
}

export function registerPilotIpc(
  ipcMain: IpcMainLike,
  service: PilotDesktopService,
  options: {
    validateSender: (event: IpcInvokeEventLike) => boolean;
    timeoutMs?: number;
    audit?: (event: { action: string; outcome: 'allowed' | 'blocked' | 'failed' }) => void;
  },
): void {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const register = (
    channel: string,
    action: string,
    schema: z.ZodType,
    responseSchema: z.ZodType,
    operation: (input: unknown) => unknown,
  ): void => {
    ipcMain.handle(channel, async (event, raw) => {
      if (!options.validateSender(event)) {
        options.audit?.({ action, outcome: 'blocked' });
        return {
          ok: false,
          error: { code: 'IPC_SENDER_REJECTED', message: 'IPC sender rejected.' },
        };
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        options.audit?.({ action, outcome: 'blocked' });
        return {
          ok: false,
          error: { code: 'IPC_SCHEMA_INVALID', message: 'Pilot request invalid.' },
        };
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await Promise.race([
          Promise.resolve(operation(parsed.data)),
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('IPC_TIMEOUT')), timeoutMs);
          }),
        ]);
        const response = responseSchema.parse({ ok: true, value });
        options.audit?.({ action, outcome: 'allowed' });
        return response;
      } catch (error) {
        options.audit?.({ action, outcome: 'failed' });
        const rawCode = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        const code = pilotErrorCodeSchema.safeParse(rawCode).success ? rawCode : 'INTERNAL_ERROR';
        return { ok: false, error: { code, message: code } };
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
  };

  register(
    pilotIpcChannels.list,
    'pilot.list',
    pilotListInputSchema,
    pilotListResponseSchema,
    (value) => service.list((value as { projectId?: string }).projectId),
  );
  register(
    pilotIpcChannels.create,
    'pilot.create',
    pilotCreateInputSchema,
    pilotViewResponseSchema,
    (value) => service.create(value as PilotCreateInput),
  );
  register(
    pilotIpcChannels.refresh,
    'pilot.refresh',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.refresh((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.inspectChatGpt,
    'pilot.inspect-chatgpt',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.inspectChatGpt((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.prepareChatGpt,
    'pilot.prepare-chatgpt',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.prepareChatGpt((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.approveChatGpt,
    'pilot.approve-chatgpt',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.approveChatGpt((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.captureChatGpt,
    'pilot.capture-chatgpt',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.captureChatGpt((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.syncChatHistory,
    'pilot.sync-chat-history',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.syncChatHistory((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.exportChatHistory,
    'pilot.export-chat-history',
    pilotIdInputSchema,
    chatHistoryExportResponseSchema,
    (value) => service.exportChatHistory((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.approveCodex,
    'pilot.approve-codex',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.approveCodex((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.verifyWebsite,
    'pilot.verify-website',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.verifyWebsite((value as { pilotId: string }).pilotId),
  );
  register(
    pilotIpcChannels.openPreview,
    'pilot.open-preview',
    pilotIdInputSchema,
    pilotViewResponseSchema,
    (value) => service.openPreview((value as { pilotId: string }).pilotId),
  );
}
