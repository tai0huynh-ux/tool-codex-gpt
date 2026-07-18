import { openDatabase } from '@codex-context-bridge/database';
import { describe, expect, it } from 'vitest';
import { ProjectRegistry } from './index';

const timestamp = '2026-07-18T10:00:00.000Z';

describe('ProjectRegistry', () => {
  it('supports non-destructive project lifecycle and aliases', () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => timestamp);
    const created = registry.create(' Bridge ', 'project-1');

    expect(created.name).toBe('Bridge');
    expect(registry.update(created.id, 'Bridge renamed')?.name).toBe('Bridge renamed');
    registry.addAlias(created.id, 'context-bridge', 'alias-1');
    registry.addAlias(created.id, 'ccb', 'alias-2');
    expect(registry.listAliases(created.id)).toEqual(['ccb', 'context-bridge']);
    expect(registry.removeAlias(created.id, 'ccb')).toBe(true);

    expect(registry.archive(created.id)?.archivedAt).toBe(timestamp);
    expect(registry.list()).toEqual([]);
    expect(registry.list(true)).toHaveLength(1);
    expect(registry.restore(created.id)?.archivedAt).toBeUndefined();
    database.close();
  });

  it('registers distinct worktrees and refreshes branch without changing identity', () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => timestamp);
    registry.create('Bridge', 'project-1');
    const first = registry.registerRepository(
      'project-1',
      {
        repoRoot: 'C:/work/bridge-main',
        worktreeRoot: 'C:/work/bridge-main',
        gitRemote: 'git@github.com:acme/bridge.git',
        projectName: 'bridge',
        branch: 'main',
      },
      'repository-1',
    );
    const second = registry.registerRepository(
      'project-1',
      {
        repoRoot: 'C:/work/bridge-feature',
        worktreeRoot: 'C:/work/bridge-feature',
        gitRemote: 'https://github.com/acme/bridge.git',
        projectName: 'bridge',
        branch: 'feature',
      },
      'repository-2',
    );

    expect(first.normalizedRemote).toBe('https://github.com/acme/bridge');
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect(registry.listRepositories('project-1')).toHaveLength(2);
    const refreshed = registry.refreshRepository('repository-1', {
      repoRoot: 'c:/WORK/bridge-main',
      worktreeRoot: 'c:/work/bridge-main',
      gitRemote: 'https://github.com/acme/bridge.git',
      projectName: 'bridge',
      branch: 'release',
    });
    expect(refreshed).toMatchObject({ branch: 'release', fingerprint: first.fingerprint });
    expect(registry.archiveRepository('repository-2')?.archivedAt).toBe(timestamp);
    expect(registry.listRepositories('project-1')).toHaveLength(1);
    expect(() => registry.registerRepository('project-1', { repoRoot: '   ' })).toThrow(
      'REPOSITORY_ROOT_REQUIRED',
    );
    database.close();
  });

  it('persists mapping evidence and supersedes earlier confirmations atomically', () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database, () => timestamp);
    registry.create('One', 'project-1');
    registry.create('Two', 'project-2');
    const evidence = [
      { type: 'git-remote' as const, value: 'https://example.test/repo', score: 0.4 },
    ];

    registry.recordMapping(
      {
        projectId: 'project-1',
        subjectType: 'chat_conversation',
        subjectId: 'conversation-1',
        confidence: 0.7,
        evidence,
        status: 'confirmed',
      },
      'mapping-1',
    );
    registry.recordMapping(
      {
        projectId: 'project-2',
        subjectType: 'chat_conversation',
        subjectId: 'conversation-1',
        confidence: 0.9,
        evidence,
        status: 'confirmed',
      },
      'mapping-2',
    );

    expect(registry.listMappingHistory('chat_conversation', 'conversation-1')).toEqual([
      expect.objectContaining({ id: 'mapping-1', status: 'superseded', supersededAt: timestamp }),
      expect.objectContaining({ id: 'mapping-2', status: 'confirmed', projectId: 'project-2' }),
    ]);
    expect(
      registry.registerChatSource({
        id: 'chat-1',
        projectId: 'project-2',
        provider: 'chatgpt',
        conversationId: 'conversation-1',
      }),
    ).toBe('chat-1');
    expect(
      registry.registerCodexThread({
        id: 'thread-1',
        projectId: 'project-2',
        repositoryFingerprint: 'fingerprint-1',
        externalThreadId: 'external-thread-1',
      }),
    ).toBe('thread-1');
    expect(database.prepare('SELECT COUNT(*) AS count FROM chat_sources').get()).toEqual({
      count: 1,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM codex_threads').get()).toEqual({
      count: 1,
    });
    expect(() =>
      registry.recordMapping({
        projectId: 'project-2',
        subjectType: 'repository',
        subjectId: 'repository-unsafe',
        confidence: 0.8,
        evidence: [{ type: 'repo-root', value: 'C:/unsafe', score: 2 }],
        status: 'confirmed',
      }),
    ).toThrow();
    database.close();
  });
});
