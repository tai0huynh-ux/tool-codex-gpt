import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assistedChatGptPreviewSchema,
  localTransportOperationSchema,
  validateContextBridgeResponse,
  validateContextPack,
  validateHandoff,
  validateMemoryRecord,
  workflowRunSchema,
} from './index';

const validEnvelope = {
  protocolVersion: '1.0',
  handoffId: 'handoff-1',
  correlationId: 'correlation-1',
  source: 'codex',
  target: 'chatgpt',
  project: { id: 'project-1', name: 'Bridge', confidence: 0.93 },
  destination: { mode: 'new-thread' },
  objective: 'Review the implementation',
  userInstructions: [],
  constraints: ['Assisted mode'],
  currentState: 'Foundation complete',
  completedWork: [],
  unresolvedIssues: [],
  attachments: [],
  expectedResponse: { type: 'analysis-and-codex-prompt', schemaVersion: '1.0' },
  createdAt: '2026-07-18T00:00:00.000Z',
};

const validResponse = {
  protocolVersion: '1.0',
  handoffId: 'handoff-1',
  correlationId: 'correlation-1',
  projectId: 'project-1',
  status: 'ready_for_codex',
  analysisSummary: 'Ready for implementation.',
  codexPrompt: 'Implement the verified change.',
  attachmentsRequested: [],
  requiresUserDecision: false,
};

describe('handoff envelope', () => {
  it('validates through both Zod and the published JSON Schema', () => {
    expect(validateHandoff(validEnvelope).handoffId).toBe('handoff-1');
    const schemaPath = path.resolve(
      import.meta.dirname,
      '../../../schemas/handoff-envelope.v1.json',
    );
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    expect(ajv.compile(schema)(validEnvelope)).toBe(true);
  });

  it('rejects an existing destination without an identifier', () => {
    expect(() =>
      validateHandoff({ ...validEnvelope, destination: { mode: 'existing-thread' } }),
    ).toThrow();
  });
});

describe('context bridge response', () => {
  it('validates through both Zod and the published JSON Schema', () => {
    const response = validateContextBridgeResponse(validResponse);
    expect(response.codexPrompt).toBe('Implement the verified change.');
    const schemaPath = path.resolve(
      import.meta.dirname,
      '../../../schemas/context-bridge-response.v1.json',
    );
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    expect(new Ajv2020({ strict: true }).compile(schema)(validResponse)).toBe(true);
  });

  it('rejects inconsistent decision state', () => {
    expect(() =>
      validateContextBridgeResponse({
        protocolVersion: '1.0',
        handoffId: 'handoff-1',
        correlationId: 'correlation-1',
        projectId: 'project-1',
        status: 'requires_user_decision',
        analysisSummary: 'A choice is required.',
        attachmentsRequested: [],
        requiresUserDecision: false,
      }),
    ).toThrow();
  });
});

describe('context pack', () => {
  it('validates a reviewed pack through both Zod and the published JSON Schema', () => {
    const pack = {
      protocolVersion: '1.0',
      id: 'pack-1',
      createdAt: '2026-07-18T10:00:00.000Z',
      objective: 'Review the change.',
      project: {
        id: 'project-1',
        name: 'Bridge',
        repositoryRoot: 'C:/work/bridge',
        confidence: 0.95,
      },
      repositoryEvidence: [],
      codexFinalResponse: 'Implemented.',
      completedWork: [],
      changedFiles: [],
      gitDiffSummary: '',
      verificationResults: [],
      knownFailures: [],
      openQuestions: [],
      relevantMemories: [],
      attachments: [],
      attachmentManifest: [],
      budget: {
        profile: {
          maxFiles: 10,
          maxTotalBytes: 1000,
          maxSingleFileBytes: 500,
          maxEstimatedTokens: 250,
          preferFullFilesBelow: 100,
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
    };
    expect(validateContextPack(pack).id).toBe('pack-1');
    const schemaPath = path.resolve(import.meta.dirname, '../../../schemas/context-pack.v1.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    expect(ajv.compile(schema)(pack)).toBe(true);
  });
});

describe('memory record', () => {
  it('validates approved provenance through Zod and the published JSON Schema', () => {
    const memory = {
      id: 'memory-1',
      scope: 'project',
      scopeId: 'project-1',
      projectId: 'project-1',
      category: 'architecture',
      content: 'Use SQLite for local persistence.',
      contentHash: 'a'.repeat(64),
      confidence: 0.95,
      status: 'approved',
      sources: [{ type: 'file', id: 'docs/ARCHITECTURE.md' }],
      createdAt: '2026-07-18T10:00:00.000Z',
      updatedAt: '2026-07-18T10:00:00.000Z',
    };
    expect(validateMemoryRecord(memory).id).toBe('memory-1');
    const schemaPath = path.resolve(import.meta.dirname, '../../../schemas/memory-record.v1.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    expect(ajv.compile(schema)(memory)).toBe(true);
  });

  it('rejects project-bound memory without matching project identity', () => {
    expect(() =>
      validateMemoryRecord({
        id: 'memory-1',
        scope: 'project',
        scopeId: 'project-1',
        projectId: 'project-2',
        category: 'rule',
        content: 'Wrong project.',
        contentHash: 'a'.repeat(64),
        confidence: 0.5,
        status: 'candidate',
        sources: [{ type: 'user', id: 'user-1' }],
        createdAt: '2026-07-18T10:00:00.000Z',
        updatedAt: '2026-07-18T10:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('workflow contracts', () => {
  it('validates a persisted run through Zod and the published JSON Schema', () => {
    const run = {
      id: 'workflow-1',
      correlationId: 'correlation-1',
      projectId: 'project-1',
      state: 'idle',
      idempotencyKey: 'workflow-key-1',
      iterationCount: 0,
      failureRetries: 0,
      maxIterations: 5,
      maxFailureRetries: 2,
      recoveryStatus: 'none',
      createdAt: '2026-07-18T10:00:00.000Z',
      updatedAt: '2026-07-18T10:00:00.000Z',
    };
    expect(workflowRunSchema.parse(run).id).toBe('workflow-1');
    const schemaPath = path.resolve(import.meta.dirname, '../../../schemas/workflow.v1.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    expect(ajv.compile(schema)(run)).toBe(true);
  });

  it('rejects unknown states and unbounded workflow limits', () => {
    expect(() =>
      workflowRunSchema.parse({
        id: 'workflow-1',
        correlationId: 'correlation-1',
        projectId: 'project-1',
        state: 'unknown',
        idempotencyKey: 'workflow-key-1',
        iterationCount: 0,
        failureRetries: 0,
        maxIterations: 0,
        maxFailureRetries: 2,
        recoveryStatus: 'none',
        createdAt: '2026-07-18T10:00:00.000Z',
        updatedAt: '2026-07-18T10:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('assisted ChatGPT preview contract', () => {
  it('validates reviewed destination and payload metadata through Zod and JSON Schema', () => {
    const preview = {
      protocolVersion: '1.0',
      workflowRunId: 'workflow-1',
      projectId: 'project-1',
      handoffId: 'handoff-1',
      correlationId: 'correlation-1',
      destination: { mode: 'existing', conversationId: 'conversation-1' },
      text: 'Reviewed handoff',
      textHash: 'a'.repeat(64),
      handoffHash: 'b'.repeat(64),
      characterCount: 16,
      createdAt: '2026-07-18T11:00:00.000Z',
    };
    expect(assistedChatGptPreviewSchema.parse(preview).handoffId).toBe('handoff-1');
    const schemaPath = path.resolve(
      import.meta.dirname,
      '../../../schemas/assisted-chatgpt-preview.v1.json',
    );
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    expect(ajv.compile(schema)(preview)).toBe(true);
  });

  it('rejects stale character counts and unbound destinations', () => {
    expect(() =>
      assistedChatGptPreviewSchema.parse({
        protocolVersion: '1.0',
        workflowRunId: 'workflow-1',
        projectId: 'project-1',
        handoffId: 'handoff-1',
        correlationId: 'correlation-1',
        destination: { mode: 'existing' },
        text: 'Reviewed handoff',
        textHash: 'a'.repeat(64),
        handoffHash: 'b'.repeat(64),
        characterCount: 1,
        createdAt: '2026-07-18T11:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('assisted page operations', () => {
  it('binds composer insertion and clearing to persisted effects and hashes', () => {
    expect(
      localTransportOperationSchema.parse({
        type: 'composer.insert',
        text: 'Reviewed handoff',
        effectId: 'effect-1',
        payloadHash: 'a'.repeat(64),
        destination: { mode: 'existing', conversationId: 'conversation-1' },
      }),
    ).toMatchObject({ type: 'composer.insert', effectId: 'effect-1' });
    expect(
      localTransportOperationSchema.parse({
        type: 'composer.clear',
        effectId: 'effect-1',
        expectedTextHash: 'a'.repeat(64),
      }),
    ).toMatchObject({ type: 'composer.clear' });
    expect(
      localTransportOperationSchema.parse({
        type: 'composer.submit',
        effectId: 'effect-submit',
        expectedTextHash: 'a'.repeat(64),
        destination: { mode: 'existing', conversationId: 'conversation-1' },
      }),
    ).toMatchObject({ type: 'composer.submit', effectId: 'effect-submit' });
    expect(localTransportOperationSchema.parse({ type: 'page.inspect' })).toEqual({
      type: 'page.inspect',
    });
    expect(
      localTransportOperationSchema.parse({
        type: 'page.inspect',
        destination: {
          mode: 'existing',
          conversationId: 'conversation-1',
          conversationPath: '/g/project-1/c/conversation-1',
        },
      }),
    ).toMatchObject({ type: 'page.inspect', destination: { conversationId: 'conversation-1' } });
    expect(() =>
      localTransportOperationSchema.parse({
        type: 'page.inspect',
        destination: {
          mode: 'existing',
          conversationId: 'conversation-1',
          conversationPath: '/g/project-1/c/conversation-2',
        },
      }),
    ).toThrow();
    expect(
      localTransportOperationSchema.parse({
        type: 'page.reload',
        destination: { mode: 'existing', conversationId: 'conversation-1' },
      }),
    ).toMatchObject({ type: 'page.reload' });
  });

  it('rejects legacy approval-only insertion without effect identity', () => {
    expect(() =>
      localTransportOperationSchema.parse({
        type: 'composer.insert',
        text: 'Unbound handoff',
        approvalId: 'approval-1',
      }),
    ).toThrow();
  });
});
