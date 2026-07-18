import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

describe('desktop renderer artifact', () => {
  it('configures relative asset URLs for Electron file loading', () => {
    const config = readFileSync(path.join(repositoryRoot, 'apps/desktop/vite.config.ts'), 'utf8');
    expect(config).toContain("base: './'");
  });

  it('builds the sandboxed preload as CommonJS', () => {
    const packageJson = readFileSync(
      path.join(repositoryRoot, 'apps/desktop/package.json'),
      'utf8',
    );
    const buildConfig = readFileSync(
      path.join(repositoryRoot, 'apps/desktop/tsup.desktop.config.ts'),
      'utf8',
    );
    const mainSource = readFileSync(path.join(repositoryRoot, 'apps/desktop/src/main.ts'), 'utf8');
    expect(packageJson).toContain('tsup.desktop.config.ts');
    expect(buildConfig).toContain("entry: ['src/preload.ts']");
    expect(buildConfig).toContain("format: ['cjs']");
    expect(mainSource).toContain("'preload.cjs'");
  });
});
