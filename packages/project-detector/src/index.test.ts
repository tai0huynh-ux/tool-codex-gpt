import { describe, expect, it } from 'vitest';
import {
  canonicalizeRepositoryRoot,
  createRepositoryFingerprint,
  detectProject,
  normalizeGitRemote,
} from './index';

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

  it('normalizes Windows paths independent of host OS and ignores branch changes', () => {
    expect(canonicalizeRepositoryRoot('C:\\Work\\Bridge')).toBe('c:/work/bridge');
    const main = createRepositoryFingerprint({
      repoRoot: 'C:/Work/Bridge',
      gitRemote: 'https://github.com/acme/bridge.git',
    });
    const feature = createRepositoryFingerprint({
      repoRoot: 'c:/work/bridge',
      gitRemote: 'git@github.com:acme/bridge.git',
    });
    expect(main.fingerprint).toBe(feature.fingerprint);
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

  it('returns an explicit ambiguity instead of selecting the first tied project', () => {
    const observed = {
      repoRoot: 'C:/work/new-tree',
      gitRemote: 'https://github.com/acme/bridge.git',
      projectName: 'bridge',
      repositoryMarker: 'same-marker',
    };
    expect(
      detectProject(observed, [
        { projectId: 'project-1', fingerprint: { ...observed, repoRoot: 'C:/work/one' } },
        { projectId: 'project-2', fingerprint: { ...observed, repoRoot: 'C:/work/two' } },
      ]),
    ).toMatchObject({
      ambiguousProjectIds: ['project-1', 'project-2'],
      requiresConfirmation: true,
    });
  });
});
