import { describe, expect, it } from 'vitest';
import { createRepositoryFingerprint, detectProject, normalizeGitRemote } from './index';

describe('repository identity', () => {
  it('normalizes equivalent Git remotes', () => {
    expect(normalizeGitRemote('git@github.com:OpenAI/example.git')).toBe(
      'https://github.com/openai/example',
    );
  });

  it('gives same-named repositories at different roots distinct fingerprints', () => {
    const first = createRepositoryFingerprint({
      repoRoot: 'C:/work/one/tool',
      projectName: 'tool',
    });
    const second = createRepositoryFingerprint({
      repoRoot: 'C:/work/two/tool',
      projectName: 'tool',
    });
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it('enforces automatic, confirmation, and blocked confidence thresholds', () => {
    const candidate = {
      projectId: 'project-1',
      fingerprint: {
        repoRoot: 'C:/work/bridge',
        gitRemote: 'https://github.com/acme/bridge.git',
        projectName: 'bridge',
        repositoryMarker: 'marker-1',
        agentsHash: 'abc',
      },
    };

    expect(detectProject(candidate.fingerprint, [candidate])).toMatchObject({
      projectId: 'project-1',
      confidence: 1,
      requiresConfirmation: false,
    });
    expect(
      detectProject({ repoRoot: 'C:/work/bridge', gitRemote: candidate.fingerprint.gitRemote }, [
        candidate,
      ]),
    ).toMatchObject({ confidence: 0.7, requiresConfirmation: true });
    expect(detectProject({ repoRoot: 'C:/elsewhere' }, [candidate])).toMatchObject({
      confidence: 0,
      requiresConfirmation: true,
    });
  });
});
