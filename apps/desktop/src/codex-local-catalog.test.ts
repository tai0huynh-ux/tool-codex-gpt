import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { readCodexLocalCatalog, syncCodexLocalCatalog } from './codex-local-catalog';

describe('Codex local project catalog', () => {
  it('reads project and thread metadata without reading prompt bodies', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'codex-local-catalog-'));
    try {
      await writeFile(
        path.join(root, '.codex-global-state.json'),
        JSON.stringify({
          'project-order': ['project-1'],
          'local-projects': {
            'project-1': {
              id: 'project-1',
              name: 'Website project',
              rootPaths: ['C:/work/website'],
            },
          },
          'thread-project-assignments': {
            'thread-1': { projectKind: 'local', projectId: 'project-1', cwd: 'C:/work/website' },
          },
        }),
        'utf8',
      );
      await writeFile(
        path.join(root, 'session_index.jsonl'),
        `${JSON.stringify({ id: 'thread-1', thread_name: 'Fix homepage', updated_at: '2026-07-20T08:00:00.000Z' })}\n`,
        'utf8',
      );

      await expect(
        readCodexLocalCatalog({ codexHome: root, now: () => '2026-07-20T09:00:00.000Z' }),
      ).resolves.toEqual({
        source: 'codex-local-state',
        capturedAt: '2026-07-20T09:00:00.000Z',
        truncated: false,
        projects: [
          {
            externalProjectId: 'project-1',
            projectName: 'Website project',
            rootPaths: ['C:/work/website'],
            threads: [
              {
                externalThreadId: 'thread-1',
                title: 'Fix homepage',
                updatedAt: '2026-07-20T08:00:00.000Z',
                workingDirectory: 'C:/work/website',
              },
            ],
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed when an allowlisted state file is a symlink', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'codex-local-catalog-'));
    const target = path.join(root, 'outside.json');
    try {
      await writeFile(target, '{}', 'utf8');
      await mkdir(path.join(root, 'nested'));
      await writeFile(path.join(root, 'session_index.jsonl'), '', 'utf8');
      // The production reader must never follow a state-file symlink.
      await expect(
        (async () => {
          await import('node:fs/promises').then(({ symlink }) =>
            symlink(target, path.join(root, '.codex-global-state.json')),
          );
          return readCodexLocalCatalog({ codexHome: root });
        })(),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('imports an exact discovered Git root and its thread mappings without manual naming', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'codex-local-project-'));
    const database = openDatabase(':memory:');
    try {
      await mkdir(path.join(root, '.git'));
      const registry = new ProjectRegistry(database, () => '2026-07-20T09:00:00.000Z');
      syncCodexLocalCatalog(
        registry,
        {
          source: 'codex-local-state',
          capturedAt: '2026-07-20T09:00:00.000Z',
          truncated: false,
          projects: [
            {
              externalProjectId: 'codex-project-1',
              projectName: 'Imported website',
              rootPaths: [root],
              threads: [
                {
                  externalThreadId: 'codex-thread-1',
                  title: 'Fix page',
                  updatedAt: '2026-07-20T08:00:00.000Z',
                  workingDirectory: root,
                },
              ],
            },
          ],
        },
        (input) => input,
      );
      const project = registry.list()[0];
      expect(project?.name).toBe('Imported website');
      const repository = project ? registry.listRepositories(project.id)[0] : undefined;
      expect(repository?.canonicalRoot.replaceAll('\\', '/').toLowerCase()).toBe(
        root.replaceAll('\\', '/').toLowerCase(),
      );
      expect(project ? registry.listCodexThreads(project.id)[0] : undefined).toMatchObject({
        externalThreadId: 'codex-thread-1',
        title: 'Fix page',
      });
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
