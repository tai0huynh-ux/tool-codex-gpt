import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  captureGitChangeBaseline,
  createCodexChangeBundle,
  parsePorcelainStatus,
} from './codex-change-bundle';

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true });
}

describe('Codex changed-file bundle', () => {
  it('parses NUL-delimited status without shell path interpolation', () => {
    expect(parsePorcelainStatus(' M src/a.ts\0?? src/new.ts\0')).toEqual([
      { status: ' M', path: 'src/a.ts' },
      { status: '??', path: 'src/new.ts' },
    ]);
  });

  it('captures a baseline and zips only safe files changed afterward', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'context-bridge-bundle-'));
    const output = path.join(root, 'bundle-output');
    try {
      git(root, 'init');
      git(root, 'config', 'user.email', 'fixture@example.com');
      git(root, 'config', 'user.name', 'Fixture');
      writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n');
      writeFileSync(path.join(root, 'delete.txt'), 'remove me\n');
      git(root, 'add', '.');
      git(root, 'commit', '-m', 'baseline');
      writeFileSync(path.join(root, 'tracked.txt'), 'dirty before Codex\n');

      const baseline = await captureGitChangeBaseline(root, () => '2026-07-20T08:00:00.000Z');
      writeFileSync(path.join(root, 'tracked.txt'), 'changed by Codex\n');
      writeFileSync(path.join(root, 'new.txt'), 'safe new file\n');
      writeFileSync(path.join(root, 'secret.txt'), `token=sk-${'a'.repeat(24)}\n`);
      git(root, 'rm', 'delete.txt');

      const result = await createCodexChangeBundle({
        repositoryRoot: root,
        baseline,
        finalResponse: 'Implemented the requested change and ran tests.',
        outputDirectory: output,
        pilotId: 'pilot-1',
        now: () => '2026-07-20T08:10:00.000Z',
      });

      expect(result.changedFiles).toEqual(['delete.txt', 'new.txt', 'secret.txt', 'tracked.txt']);
      expect(result.includedFiles).toEqual(['new.txt', 'tracked.txt']);
      expect(result.blockedFiles).toEqual(
        expect.arrayContaining([
          { path: 'delete.txt', reason: 'DELETED_FILE_MANIFEST_ONLY' },
          { path: 'secret.txt', reason: 'SECRET_DETECTED:openai-key' },
        ]),
      );
      expect(readFileSync(result.zipPath).subarray(0, 4).toString('hex')).toBe('504b0304');
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
