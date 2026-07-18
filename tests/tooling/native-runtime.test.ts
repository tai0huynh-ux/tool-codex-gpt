import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

describe('native runtime recovery', () => {
  it('keeps the Node SQLite binding loadable after release tooling', () => {
    expect(() =>
      execFileSync(process.execPath, [path.join(root, 'scripts/restore-node-native.mjs')], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
