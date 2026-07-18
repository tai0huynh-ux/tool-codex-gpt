import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateContextBridgeResponse, validateHandoff } from './index';

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
