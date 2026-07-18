import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

function workspacePackageFiles(): string[] {
  return ['apps', 'packages'].flatMap((directory) =>
    readdirSync(path.join(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, directory, entry.name, 'package.json')),
  );
}

describe('cross-platform workspace commands', () => {
  it('does not embed Windows-only pnpm shims in package scripts', () => {
    for (const packageFile of [path.join(root, 'package.json'), ...workspacePackageFiles()]) {
      const packageJson = JSON.parse(readFileSync(packageFile, 'utf8')) as {
        scripts?: Record<string, string>;
      };

      expect(Object.values(packageJson.scripts ?? {}).join('\n')).not.toContain('pnpm.cmd');
    }
  });

  it('uses a portable pnpm command for the Playwright web server', () => {
    const config = readFileSync(path.join(root, 'playwright.config.ts'), 'utf8');
    expect(config).toContain("'pnpm --filter @codex-context-bridge/chatgpt-extension exec vite");
    expect(config).not.toContain('pnpm.cmd');
  });
});
