import { createHash } from 'node:crypto';
import path from 'node:path';
import type {
  ProjectDetectionResult,
  ProjectEvidence,
  RepositoryFingerprintInput,
} from '@codex-context-bridge/contracts';

export type RepositoryFingerprint = RepositoryFingerprintInput & {
  gitRemote?: string;
  repoRoot: string;
  fingerprint: string;
};

export function normalizeGitRemote(remote: string): string {
  const trimmed = remote.trim().replace(/\\/g, '/');
  const scpMatch = /^git@([^:]+):(.+)$/.exec(trimmed);
  const normalized =
    scpMatch?.[1] && scpMatch[2] ? `https://${scpMatch[1]}/${scpMatch[2]}` : trimmed;
  return normalized
    .replace(/^ssh:\/\/git@/i, 'https://')
    .replace(/\.git\/?$/i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

export function canonicalizeRepositoryRoot(repoRoot: string): string {
  const resolved = path.resolve(repoRoot).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function createRepositoryFingerprint(
  input: RepositoryFingerprintInput,
): RepositoryFingerprint {
  const normalized = {
    ...(input.gitRemote ? { gitRemote: normalizeGitRemote(input.gitRemote) } : {}),
    repoRoot: canonicalizeRepositoryRoot(input.repoRoot),
    ...(input.projectName ? { projectName: input.projectName.trim().toLowerCase() } : {}),
    ...(input.repositoryMarker ? { repositoryMarker: input.repositoryMarker.trim() } : {}),
    ...(input.agentsHash ? { agentsHash: input.agentsHash.toLowerCase() } : {}),
  };
  return {
    ...normalized,
    fingerprint: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
  };
}

const weights: Record<ProjectEvidence['type'], number> = {
  'git-remote': 0.4,
  'repo-root': 0.3,
  'project-name': 0.15,
  'repository-marker': 0.1,
  'agents-hash': 0.05,
};

export function detectProject(
  observed: RepositoryFingerprintInput,
  candidates: { projectId: string; fingerprint: RepositoryFingerprintInput }[],
): ProjectDetectionResult {
  const normalizedObserved = createRepositoryFingerprint(observed);
  let best: { projectId: string; confidence: number; evidence: ProjectEvidence[] } | undefined;

  for (const candidate of candidates) {
    const normalizedCandidate = createRepositoryFingerprint(candidate.fingerprint);
    const evidence: ProjectEvidence[] = [];
    const compare = (type: ProjectEvidence['type'], left?: string, right?: string): void => {
      if (left && right && left === right)
        evidence.push({ type, value: left, score: weights[type] });
    };
    compare('git-remote', normalizedObserved.gitRemote, normalizedCandidate.gitRemote);
    compare('repo-root', normalizedObserved.repoRoot, normalizedCandidate.repoRoot);
    compare('project-name', normalizedObserved.projectName, normalizedCandidate.projectName);
    compare(
      'repository-marker',
      normalizedObserved.repositoryMarker,
      normalizedCandidate.repositoryMarker,
    );
    compare('agents-hash', normalizedObserved.agentsHash, normalizedCandidate.agentsHash);
    const confidence = Number(evidence.reduce((total, item) => total + item.score, 0).toFixed(2));
    if (!best || confidence > best.confidence)
      best = { projectId: candidate.projectId, confidence, evidence };
  }

  if (!best || best.confidence < 0.6) {
    return {
      confidence: best?.confidence ?? 0,
      evidence: best?.evidence ?? [],
      requiresConfirmation: true,
    };
  }
  return {
    projectId: best.projectId,
    confidence: best.confidence,
    evidence: best.evidence,
    requiresConfirmation: best.confidence < 0.85,
  };
}
