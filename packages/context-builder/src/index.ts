import path from 'node:path';
import {
  contextPackSchema,
  type ContextPack,
  type ContextPackBudgetProfile,
  type ProjectEvidence,
} from '@codex-context-bridge/contracts';
import { inspectAllowedFile } from '@codex-context-bridge/file-store';

export interface ContextFileCandidate {
  path: string;
  previousPath?: string;
  change: 'added' | 'modified' | 'renamed' | 'deleted' | 'unchanged';
  category?: 'source' | 'test' | 'types' | 'config' | 'log' | 'architecture' | 'rules' | 'other';
  pinned?: boolean;
  generated?: boolean;
  dependencyNeighbor?: boolean;
  diff?: string;
  changedLine?: number;
}

export interface ContextPackInput {
  id: string;
  createdAt: string;
  objective: string;
  project: {
    id: string;
    name: string;
    repositoryRoot: string;
    confidence: number;
  };
  repositoryEvidence: ProjectEvidence[];
  codexThreadId?: string;
  codexFinalResponse: string;
  completedWork: string[];
  gitDiffSummary: string;
  verificationResults: {
    command: string;
    status: 'passed' | 'failed' | 'blocked' | 'not-run';
    summary: string;
  }[];
  knownFailures: string[];
  openQuestions: string[];
  relevantMemories: string[];
  files: ContextFileCandidate[];
  budget: ContextPackBudgetProfile;
  expectedChatGptResponse?: {
    type: 'analysis-and-codex-prompt';
    schemaVersion: string;
  };
}

export interface ContextBuilderAuditEvent {
  eventType: 'context.file.attached' | 'context.file.omitted' | 'context.file.blocked';
  relativePath: string;
  outcome: 'allowed' | 'blocked';
  reason: string;
}

export interface ContextPackBuilderOptions {
  exclusions?: string[];
  audit?: (event: ContextBuilderAuditEvent) => void | Promise<void>;
}

const scoreByChange: Record<ContextFileCandidate['change'], number> = {
  added: 100,
  modified: 90,
  renamed: 85,
  unchanged: 10,
  deleted: 5,
};

const scoreByCategory: Record<NonNullable<ContextFileCandidate['category']>, number> = {
  test: 35,
  types: 30,
  config: 25,
  log: 18,
  source: 15,
  architecture: 12,
  rules: 10,
  other: 0,
};

function normalizedRelativePath(repositoryRoot: string, candidatePath: string): string {
  const absolute = path.resolve(repositoryRoot, candidatePath);
  const relative = path.relative(path.resolve(repositoryRoot), absolute).replaceAll('\\', '/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    return `[outside-repository]/${path.basename(absolute)}`;
  }
  return relative || path.basename(absolute);
}

export function scoreContextFile(candidate: ContextFileCandidate): number {
  const filename = path.basename(candidate.path).toLowerCase();
  return (
    scoreByChange[candidate.change] +
    scoreByCategory[candidate.category ?? 'other'] +
    (candidate.pinned ? 70 : 0) +
    (candidate.dependencyNeighbor ? 12 : 0) -
    (candidate.generated ? 90 : 0) -
    (filename.endsWith('.lock') || filename === 'pnpm-lock.yaml' ? 45 : 0)
  );
}

function isBinary(content: Buffer): boolean {
  const sample = content.subarray(0, Math.min(content.length, 8_192));
  return sample.includes(0);
}

function estimatedTokens(content: string): number {
  return Math.ceil(Buffer.byteLength(content, 'utf8') / 4);
}

function excerpt(content: string, changedLine: number | undefined, window: number) {
  const lines = content.split(/\r?\n/);
  const center = Math.max(1, Math.min(changedLine ?? 1, lines.length));
  const startLine = Math.max(1, center - window);
  const endLine = Math.min(lines.length, center + window);
  return {
    content: lines.slice(startLine - 1, endLine).join('\n'),
    startLine,
    endLine,
  };
}

function reasonFor(candidate: ContextFileCandidate, mode: 'full' | 'excerpt' | 'diff'): string {
  const reasons: string[] = [candidate.change];
  if (candidate.pinned) reasons.push('user-pinned');
  if (candidate.category) reasons.push(candidate.category);
  if (candidate.dependencyNeighbor) reasons.push('dependency-neighbor');
  reasons.push(mode);
  return reasons.join(', ');
}

export class ContextPackBuilder {
  public constructor(private readonly options: ContextPackBuilderOptions = {}) {}

  public async build(input: ContextPackInput): Promise<ContextPack> {
    const ranked = input.files
      .map((candidate) => ({
        candidate,
        relativePath: normalizedRelativePath(input.project.repositoryRoot, candidate.path),
        previousPath: candidate.previousPath
          ? normalizedRelativePath(input.project.repositoryRoot, candidate.previousPath)
          : undefined,
        score: scoreContextFile(candidate),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.relativePath.localeCompare(right.relativePath),
      );
    const attachments: ContextPack['attachments'] = [];
    const attachmentManifest: ContextPack['attachmentManifest'] = [];
    const hashes = new Set<string>();
    let totalBytes = 0;
    let totalTokens = 0;

    for (const item of ranked) {
      const { candidate, previousPath, relativePath, score } = item;
      if (candidate.change === 'deleted') {
        attachmentManifest.push({
          path: relativePath,
          ...(previousPath ? { previousPath } : {}),
          change: candidate.change,
          status: 'deleted',
          score,
          reason: 'Deleted files are represented in the manifest only.',
        });
        continue;
      }

      try {
        const inspected = await inspectAllowedFile(
          path.resolve(input.project.repositoryRoot, candidate.path),
          {
            repositoryRoots: [input.project.repositoryRoot],
            maxBytes: input.budget.maxSingleFileBytes,
            ...(this.options.exclusions ? { exclusions: this.options.exclusions } : {}),
          },
        );
        if (isBinary(inspected.content)) throw new Error('BINARY_FILE');
        if (hashes.has(inspected.sha256)) {
          attachmentManifest.push({
            path: relativePath,
            ...(previousPath ? { previousPath } : {}),
            change: candidate.change,
            status: 'deduplicated',
            score,
            reason: 'Duplicate content hash.',
            sha256: inspected.sha256,
            size: inspected.size,
          });
          await this.options.audit?.({
            eventType: 'context.file.omitted',
            relativePath,
            outcome: 'allowed',
            reason: 'duplicate',
          });
          continue;
        }

        const fullContent = inspected.content.toString('utf8');
        let mode: 'full' | 'excerpt' | 'diff' = 'full';
        let rendered = fullContent;
        let lineRange: { startLine?: number; endLine?: number } = {};
        if (inspected.size > input.budget.preferFullFilesBelow) {
          if (candidate.diff) {
            mode = 'diff';
            rendered = candidate.diff;
          } else {
            mode = 'excerpt';
            const selected = excerpt(
              fullContent,
              candidate.changedLine,
              input.budget.excerptLineWindow,
            );
            rendered = selected.content;
            lineRange = { startLine: selected.startLine, endLine: selected.endLine };
          }
        }
        const attachedBytes = Buffer.byteLength(rendered, 'utf8');
        const tokens = estimatedTokens(rendered);
        const overBudget =
          attachments.length >= input.budget.maxFiles ||
          totalBytes + attachedBytes > input.budget.maxTotalBytes ||
          totalTokens + tokens > input.budget.maxEstimatedTokens;
        if (overBudget) {
          attachmentManifest.push({
            path: relativePath,
            change: candidate.change,
            status: 'manifest-only',
            score,
            reason: 'Context budget exhausted.',
            sha256: inspected.sha256,
            size: inspected.size,
          });
          await this.options.audit?.({
            eventType: 'context.file.omitted',
            relativePath,
            outcome: 'allowed',
            reason: 'budget',
          });
          continue;
        }

        hashes.add(inspected.sha256);
        totalBytes += attachedBytes;
        totalTokens += tokens;
        attachments.push({
          path: relativePath,
          sha256: inspected.sha256,
          sourceSize: inspected.size,
          attachedBytes,
          estimatedTokens: tokens,
          mode,
          content: rendered,
          inclusionReason: reasonFor(candidate, mode),
          ...lineRange,
        });
        attachmentManifest.push({
          path: relativePath,
          ...(previousPath ? { previousPath } : {}),
          change: candidate.change,
          status: 'attached',
          score,
          reason: reasonFor(candidate, mode),
          sha256: inspected.sha256,
          size: inspected.size,
        });
        await this.options.audit?.({
          eventType: 'context.file.attached',
          relativePath,
          outcome: 'allowed',
          reason: mode,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'UNKNOWN_FILE_ERROR';
        attachmentManifest.push({
          path: relativePath,
          ...(previousPath ? { previousPath } : {}),
          change: candidate.change,
          status: 'blocked',
          score,
          reason,
        });
        await this.options.audit?.({
          eventType: 'context.file.blocked',
          relativePath,
          outcome: 'blocked',
          reason,
        });
      }
    }

    return contextPackSchema.parse({
      protocolVersion: '1.0',
      id: input.id,
      createdAt: input.createdAt,
      objective: input.objective,
      project: input.project,
      repositoryEvidence: input.repositoryEvidence,
      ...(input.codexThreadId ? { codexThreadId: input.codexThreadId } : {}),
      codexFinalResponse: input.codexFinalResponse,
      completedWork: input.completedWork,
      changedFiles: ranked
        .filter((item) => item.candidate.change !== 'unchanged')
        .map((item) => item.relativePath),
      gitDiffSummary: input.gitDiffSummary,
      verificationResults: input.verificationResults,
      knownFailures: input.knownFailures,
      openQuestions: input.openQuestions,
      relevantMemories: input.relevantMemories,
      attachments,
      attachmentManifest,
      budget: {
        profile: input.budget,
        usedFiles: attachments.length,
        totalBytes,
        estimatedTokens: totalTokens,
      },
      expectedChatGptResponse: input.expectedChatGptResponse ?? {
        type: 'analysis-and-codex-prompt',
        schemaVersion: '1.0',
      },
    });
  }
}
