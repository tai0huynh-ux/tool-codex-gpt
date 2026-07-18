import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentAddressedFileStore, type FileAuditEvent } from './index';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'context-bridge-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('content-addressed file store', () => {
  it('stores an allowed file once and audits deduplication', async () => {
    const root = await temporaryDirectory();
    const storageRoot = path.join(root, '.store');
    const source = path.join(root, 'note.txt');
    const audit: FileAuditEvent[] = [];
    await writeFile(source, 'safe context');
    const store = new ContentAddressedFileStore({
      storageRoot,
      repositoryRoots: [root],
      audit: (event) => {
        audit.push(event);
      },
    });

    expect((await store.ingest(source)).deduplicated).toBe(false);
    expect((await store.ingest(source)).deduplicated).toBe(true);
    expect(audit.map((event) => event.eventType)).toEqual(['file.accepted', 'file.deduplicated']);
  });

  it('blocks path traversal outside an allowlisted repository', async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    const source = path.join(outside, 'outside.txt');
    await writeFile(source, 'not allowlisted');
    const store = new ContentAddressedFileStore({
      storageRoot: path.join(root, '.store'),
      repositoryRoots: [root],
    });

    await expect(
      store.ingest(path.join(root, '..', path.basename(outside), 'outside.txt')),
    ).rejects.toThrow('PATH_OUTSIDE_ALLOWLIST');
  });

  it('blocks a symlink that resolves outside the repository', async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await writeFile(path.join(outside, 'outside.txt'), 'not allowlisted');
    const link = path.join(root, 'external');
    await mkdir(path.join(root, '.store'));
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const store = new ContentAddressedFileStore({
      storageRoot: path.join(root, '.store'),
      repositoryRoots: [root],
    });

    await expect(store.ingest(path.join(link, 'outside.txt'))).rejects.toThrow(
      'SYMLINK_OUTSIDE_ALLOWLIST',
    );
  });

  it('blocks excluded files and secret content', async () => {
    const root = await temporaryDirectory();
    const excluded = path.join(root, '.env');
    const secret = path.join(root, 'notes.txt');
    await writeFile(excluded, 'ordinary text');
    await writeFile(secret, ['sk-', 'fixture_only_', '12345678901234567890'].join(''));
    const store = new ContentAddressedFileStore({
      storageRoot: path.join(root, '.store'),
      repositoryRoots: [root],
    });

    await expect(store.ingest(excluded)).rejects.toThrow('FILE_EXCLUDED');
    await expect(store.ingest(secret)).rejects.toThrow('SECRET_DETECTED');
  });
});
