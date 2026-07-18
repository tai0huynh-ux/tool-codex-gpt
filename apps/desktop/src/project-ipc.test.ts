import { openDatabase } from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { describe, expect, it, vi } from 'vitest';
import type { IpcInvokeEventLike, IpcMainLike } from './ipc';
import {
  createProjectDesktopService,
  projectIpcChannels,
  registerProjectIpc,
  validateGitRepositoryInput,
  type ProjectDesktopService,
} from './project-ipc';

class FakeIpcMain implements IpcMainLike {
  public readonly handlers = new Map<
    string,
    (event: IpcInvokeEventLike, input?: unknown) => Promise<unknown>
  >();

  public handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input?: unknown) => Promise<unknown>,
  ): void {
    this.handlers.set(channel, listener);
  }
}

function setupRegistry(): { registry: ProjectRegistry; close: () => void } {
  const database = openDatabase(':memory:');
  const registry = new ProjectRegistry(database, () => '2026-07-18T10:00:00.000Z');
  registry.create('One', 'project-1');
  registry.create('Two', 'project-2');
  for (const [id, projectId, root] of [
    ['repository-1', 'project-1', 'C:/work/one'],
    ['repository-2', 'project-2', 'C:/work/two'],
  ] as const) {
    registry.registerRepository(
      projectId,
      {
        repoRoot: root,
        gitRemote: 'https://github.com/acme/bridge.git',
        projectName: 'bridge',
        repositoryMarker: 'same-marker',
      },
      id,
    );
  }
  return { registry, close: () => database.close() };
}

describe('project desktop service', () => {
  it('rejects missing Git metadata before preview or registration', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-root-'));
    try {
      expect(() => validateGitRepositoryInput({ repoRoot: directory })).toThrow(
        'REPOSITORY_ROOT_INVALID',
      );
      mkdirSync(path.join(directory, '.git'));
      expect(validateGitRepositoryInput({ repoRoot: directory }).repoRoot).toBe(
        realpathSync(directory),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('previews tied candidates and persists an explicit user confirmation', async () => {
    const { registry, close } = setupRegistry();
    const service = createProjectDesktopService(registry, () => 'C:/work/new-tree');
    const repository = {
      repoRoot: 'C:/work/new-tree',
      gitRemote: 'https://github.com/acme/bridge.git',
      projectName: 'bridge',
      repositoryMarker: 'same-marker',
      branch: 'feature',
    };

    expect(await Promise.resolve(service.previewRepository(repository))).toMatchObject({
      detection: {
        ambiguousProjectIds: ['project-1', 'project-2'],
        requiresConfirmation: true,
      },
    });
    const confirmed = await Promise.resolve(
      service.confirmRepository({ projectId: 'project-2', repository, confirmed: true }),
    );
    expect(confirmed.project.id).toBe('project-2');
    expect(confirmed.repositories.some((item) => item.branch === 'feature')).toBe(true);
    const registered = registry
      .listRepositories('project-2')
      .find((item) => item.canonicalRoot === 'c:/work/new-tree');
    expect(registered).toBeDefined();
    expect(registry.listMappingHistory('repository', registered?.fingerprint ?? '')).toHaveLength(
      1,
    );
    close();
  });

  it('reloads registered projects and repositories from the persistent SQLite database', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-projects-'));
    const databasePath = path.join(directory, 'context-bridge.sqlite');
    try {
      const firstDatabase = openDatabase(databasePath);
      const firstRegistry = new ProjectRegistry(firstDatabase, () => '2026-07-18T10:00:00.000Z');
      firstRegistry.create('Persistent', 'project-persistent');
      const firstService = createProjectDesktopService(firstRegistry, () => null);
      await Promise.resolve(
        firstService.confirmRepository({
          projectId: 'project-persistent',
          repository: { repoRoot: 'C:/work/persistent', branch: 'main' },
          confirmed: true,
        }),
      );
      firstDatabase.close();

      const reopenedDatabase = openDatabase(databasePath);
      const reopenedService = createProjectDesktopService(
        new ProjectRegistry(reopenedDatabase),
        () => null,
      );
      expect(await Promise.resolve(reopenedService.list())).toMatchObject([
        {
          project: { id: 'project-persistent', name: 'Persistent' },
          repositories: [{ canonicalRoot: 'c:/work/persistent', branch: 'main' }],
        },
      ]);
      reopenedDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('project IPC boundary', () => {
  it('allows the user-controlled folder picker to remain open beyond the IPC timeout', async () => {
    const { registry, close } = setupRegistry();
    vi.useFakeTimers();
    try {
      const ipc = new FakeIpcMain();
      registerProjectIpc(
        ipc,
        createProjectDesktopService(
          registry,
          () => new Promise((resolve) => setTimeout(() => resolve(null), 20)),
        ),
        { validateSender: () => true, timeoutMs: 10 },
      );
      const result = ipc.handlers.get(projectIpcChannels.chooseRepositoryRoot)?.({
        sender: { id: 7 },
      });
      await vi.advanceTimersByTimeAsync(20);
      await expect(result).resolves.toEqual({ ok: true, value: null });
    } finally {
      vi.useRealTimers();
      close();
    }
  });

  it('validates sender and input while auditing outcomes without repository payloads', async () => {
    const { registry, close } = setupRegistry();
    const ipc = new FakeIpcMain();
    const audit = vi.fn();
    registerProjectIpc(
      ipc,
      createProjectDesktopService(registry, () => null),
      {
        validateSender: (event) => event.sender.id === 7,
        audit,
      },
    );

    await expect(
      ipc.handlers.get(projectIpcChannels.list)?.({ sender: { id: 8 } }),
    ).resolves.toMatchObject({ error: { code: 'IPC_SENDER_REJECTED' } });
    await expect(
      ipc.handlers.get(projectIpcChannels.create)?.({ sender: { id: 7 } }, { name: '' }),
    ).resolves.toMatchObject({ error: { code: 'IPC_SCHEMA_INVALID' } });
    const listResult = await ipc.handlers.get(projectIpcChannels.list)?.({ sender: { id: 7 } });
    expect(listResult).toMatchObject({ ok: true });
    expect(
      typeof listResult === 'object' && listResult !== null && 'value' in listResult
        ? Array.isArray(listResult.value)
        : false,
    ).toBe(true);
    expect(JSON.stringify(audit.mock.calls)).not.toContain('C:/work');
    close();
  });

  it('maps duplicate repository and timeout failures to explicit codes', async () => {
    const { registry, close } = setupRegistry();
    const base = createProjectDesktopService(registry, () => null);
    const ipc = new FakeIpcMain();
    registerProjectIpc(ipc, base, { validateSender: () => true });
    await expect(
      ipc.handlers.get(projectIpcChannels.confirmRepository)?.(
        { sender: { id: 7 } },
        {
          projectId: 'project-1',
          repository: { repoRoot: 'C:/work/one' },
          confirmed: true,
        },
      ),
    ).resolves.toMatchObject({ error: { code: 'REPOSITORY_ALREADY_REGISTERED' } });

    vi.useFakeTimers();
    const timeoutIpc = new FakeIpcMain();
    const slowService: ProjectDesktopService = {
      ...base,
      list: () => new Promise(() => undefined),
    };
    registerProjectIpc(timeoutIpc, slowService, {
      validateSender: () => true,
      timeoutMs: 10,
    });
    const result = timeoutIpc.handlers.get(projectIpcChannels.list)?.({ sender: { id: 7 } });
    const expectation = expect(result).resolves.toMatchObject({ error: { code: 'IPC_TIMEOUT' } });
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
    vi.useRealTimers();
    close();
  });
});
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
