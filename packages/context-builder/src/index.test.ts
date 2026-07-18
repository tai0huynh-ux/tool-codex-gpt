import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextPackBuilder, scoreContextFile, type ContextPackInput } from './index';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'context-pack-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function input(repositoryRoot: string, files: ContextPackInput['files']): ContextPackInput {
  return {
    id: 'pack-1',
    createdAt: '2026-07-18T10:00:00.000Z',
    objective: 'Review the verified implementation.',
    project: { id: 'project-1', name: 'Bridge', repositoryRoot, confidence: 0.95 },
    repositoryEvidence: [{ type: 'repo-root', value: repositoryRoot, score: 0.4 }],
    codexThreadId: 'thread-1',
    codexFinalResponse: 'Implementation complete.',
    completedWork: ['Added deterministic selection.'],
    gitDiffSummary: '2 files changed',
    verificationResults: [{ command: 'pnpm test', status: 'passed', summary: 'green' }],
    knownFailures: [],
    openQuestions: [],
    relevantMemories: [],
    files,
    budget: {
      maxFiles: 10,
      maxTotalBytes: 20_000,
      maxSingleFileBytes: 20_000,
      maxEstimatedTokens: 5_000,
      preferFullFilesBelow: 100,
      excerptLineWindow: 1,
    },
  };
}

describe('ContextPackBuilder', () => {
  it('ranks changed, test, and pinned files deterministically', async () => {
    const root = await temporaryDirectory();
    await Promise.all([
      writeFile(path.join(root, 'z-source.ts'), 'export const source = true;'),
      writeFile(path.join(root, 'a-test.ts'), 'export const test = true;'),
      writeFile(path.join(root, 'pinned.md'), 'Pinned guidance.'),
    ]);
    const packInput = input(root, [
      { path: 'pinned.md', change: 'unchanged', pinned: true, category: 'other' },
      { path: 'a-test.ts', change: 'unchanged', category: 'test' },
      { path: 'z-source.ts', change: 'modified', category: 'source' },
    ]);
    const builder = new ContextPackBuilder();
    const pack = await builder.build(packInput);
    const repeated = await builder.build(packInput);

    expect(pack.attachments.map((item) => item.path)).toEqual([
      'z-source.ts',
      'pinned.md',
      'a-test.ts',
    ]);
    expect(repeated.attachments).toEqual(pack.attachments);
    expect(repeated.attachmentManifest).toEqual(pack.attachmentManifest);
    expect(scoreContextFile({ path: 'x', change: 'modified', category: 'test' })).toBeGreaterThan(
      scoreContextFile({ path: 'x', change: 'modified', category: 'source' }),
    );
  });

  it('uses line-safe excerpts and records files omitted by budget', async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, 'large.ts'), ['one', 'hai 😀', 'three', 'four'].join('\n'));
    await writeFile(path.join(root, 'other.ts'), 'other content');
    const packInput = input(root, [
      { path: 'large.ts', change: 'modified', category: 'source', changedLine: 2 },
      { path: 'other.ts', change: 'modified', category: 'source' },
    ]);
    packInput.budget.preferFullFilesBelow = 5;
    packInput.budget.maxFiles = 1;
    const pack = await new ContextPackBuilder().build(packInput);

    expect(pack.attachments[0]).toMatchObject({
      path: 'large.ts',
      mode: 'excerpt',
      content: 'one\nhai 😀\nthree',
      startLine: 1,
      endLine: 3,
    });
    expect(pack.attachmentManifest).toContainEqual(
      expect.objectContaining({ path: 'other.ts', status: 'manifest-only' }),
    );
  });

  it('deduplicates content and preserves deleted and renamed manifest evidence', async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, 'a.ts'), 'same');
    await writeFile(path.join(root, 'b.ts'), 'same');
    const pack = await new ContextPackBuilder().build(
      input(root, [
        { path: 'a.ts', change: 'renamed', previousPath: 'old-a.ts', category: 'source' },
        { path: 'b.ts', change: 'modified', category: 'source' },
        { path: 'removed.ts', change: 'deleted', category: 'source' },
      ]),
    );

    expect(pack.attachments).toHaveLength(1);
    expect(pack.attachmentManifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'deduplicated' }),
        expect.objectContaining({ path: 'removed.ts', status: 'deleted' }),
        expect.objectContaining({ previousPath: 'old-a.ts' }),
      ]),
    );
  });

  it('blocks secrets, binary files, traversal, and escaping symlinks', async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await writeFile(
      path.join(root, 'secret.txt'),
      ['sk-', 'fixture_only_', '12345678901234567890'].join(''),
    );
    await writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    await writeFile(path.join(outside, 'outside.txt'), 'outside');
    await symlink(
      outside,
      path.join(root, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const pack = await new ContextPackBuilder().build(
      input(root, [
        { path: 'secret.txt', change: 'modified' },
        { path: 'binary.bin', change: 'modified' },
        { path: path.join(outside, 'outside.txt'), change: 'modified' },
        { path: 'escape/outside.txt', change: 'modified' },
      ]),
    );

    expect(pack.attachments).toEqual([]);
    expect(pack.attachmentManifest.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('SECRET_DETECTED'),
        'BINARY_FILE',
        'PATH_OUTSIDE_ALLOWLIST',
        'SYMLINK_OUTSIDE_ALLOWLIST',
      ]),
    );
  });

  it('uses a supplied diff instead of a large full file', async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, 'large.ts'), 'line\n'.repeat(200));
    const packInput = input(root, [
      { path: 'large.ts', change: 'modified', category: 'source', diff: '@@ -1 +1 @@\n-old\n+new' },
    ]);
    packInput.budget.preferFullFilesBelow = 10;
    const pack = await new ContextPackBuilder().build(packInput);

    expect(pack.attachments[0]).toMatchObject({ mode: 'diff', content: '@@ -1 +1 @@\n-old\n+new' });
  });

  it('produces a valid empty-diff pack without invented attachments', async () => {
    const root = await temporaryDirectory();
    const packInput = input(root, []);
    packInput.gitDiffSummary = '';
    const pack = await new ContextPackBuilder().build(packInput);

    expect(pack.changedFiles).toEqual([]);
    expect(pack.attachments).toEqual([]);
    expect(pack.attachmentManifest).toEqual([]);
    expect(pack.budget).toMatchObject({ usedFiles: 0, totalBytes: 0, estimatedTokens: 0 });
  });
});
