import { z } from 'zod';

export const handoffEnvelopeSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    handoffId: z.string().min(1),
    parentHandoffId: z.string().min(1).optional(),
    correlationId: z.string().min(1),
    source: z.enum(['user', 'chatgpt', 'codex']),
    target: z.enum(['chatgpt', 'codex']),
    project: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      repoRoot: z.string().min(1).optional(),
      gitRemote: z.string().min(1).optional(),
      branch: z.string().min(1).optional(),
      confidence: z.number().min(0).max(1),
    }),
    destination: z
      .object({
        mode: z.enum(['existing-thread', 'new-thread']),
        conversationId: z.string().min(1).optional(),
        codexThreadId: z.string().min(1).optional(),
      })
      .superRefine((value, context) => {
        if (
          value.mode === 'existing-thread' &&
          value.conversationId === undefined &&
          value.codexThreadId === undefined
        ) {
          context.addIssue({
            code: 'custom',
            message: 'An existing destination requires a conversation or Codex thread ID.',
          });
        }
      }),
    objective: z.string().min(1),
    userInstructions: z.array(z.string()),
    constraints: z.array(z.string()),
    currentState: z.string(),
    completedWork: z.array(z.string()),
    unresolvedIssues: z.array(z.string()),
    attachments: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        path: z.string().min(1).optional(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        size: z.number().int().nonnegative(),
        mediaType: z.string().min(1).optional(),
        inclusionReason: z.string().min(1),
      }),
    ),
    expectedResponse: z.object({
      type: z.literal('analysis-and-codex-prompt'),
      schemaVersion: z.string().min(1),
    }),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type HandoffEnvelope = z.infer<typeof handoffEnvelopeSchema>;

export function validateHandoff(input: unknown): HandoffEnvelope {
  return handoffEnvelopeSchema.parse(input);
}

export const contextBridgeResponseSchema = z
  .object({
    protocolVersion: z.literal('1.0'),
    handoffId: z.string().min(1),
    correlationId: z.string().min(1),
    projectId: z.string().min(1),
    status: z.enum([
      'ready_for_codex',
      'requires_user_decision',
      'needs_more_context',
      'completed',
    ]),
    analysisSummary: z.string().min(1),
    codexPrompt: z.string().min(1).optional(),
    attachmentsRequested: z.array(z.string().min(1)),
    requiresUserDecision: z.boolean(),
    userDecisionQuestion: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'ready_for_codex' && !value.codexPrompt) {
      context.addIssue({ code: 'custom', message: 'A ready response requires codexPrompt.' });
    }
    if (value.status === 'requires_user_decision') {
      if (!value.requiresUserDecision || !value.userDecisionQuestion) {
        context.addIssue({
          code: 'custom',
          message: 'A decision response requires a question and decision flag.',
        });
      }
    } else if (value.requiresUserDecision) {
      context.addIssue({
        code: 'custom',
        message: 'requiresUserDecision must match requires_user_decision status.',
      });
    }
  });

export type ContextBridgeResponse = z.infer<typeof contextBridgeResponseSchema>;

export function validateContextBridgeResponse(input: unknown): ContextBridgeResponse {
  return contextBridgeResponseSchema.parse(input);
}

export interface ProjectEvidence {
  type: 'git-remote' | 'repo-root' | 'project-name' | 'repository-marker' | 'agents-hash';
  value: string;
  score: number;
}

export interface ProjectDetectionResult {
  projectId?: string;
  confidence: number;
  evidence: ProjectEvidence[];
  requiresConfirmation: boolean;
}

export interface RepositoryFingerprintInput {
  gitRemote?: string;
  repoRoot: string;
  projectName?: string;
  repositoryMarker?: string;
  agentsHash?: string;
}
